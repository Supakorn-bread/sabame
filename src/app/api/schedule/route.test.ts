import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentUser: vi.fn(),
  errorResponse: vi.fn(),
  account: vi.fn(),
  entries: vi.fn(),
  fetchSeasonRoutes: vi.fn(),
  fetchSchedule: vi.fn(),
  ScheduleServiceError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/features/mal/server/http", () => ({
  currentUser: mocks.currentUser,
  errorResponse: mocks.errorResponse,
  privateJson: (value: unknown, status = 200) => Response.json(value, {
    status,
    headers: { "Cache-Control": "no-store, private" },
  }),
}));
vi.mock("@/features/mal/server/repository", () => ({
  malRepository: () => ({ account: mocks.account, entries: mocks.entries }),
}));
vi.mock("@/features/schedule/server/anime-catalog", () => ({
  fetchSeasonRoutes: mocks.fetchSeasonRoutes,
}));
vi.mock("@/features/schedule/server/client", () => ({
  fetchSchedule: mocks.fetchSchedule,
  ScheduleServiceError: mocks.ScheduleServiceError,
  isTimeZone: (value: unknown) => typeof value === "string" && value.length > 0,
}));

import { currentSeason } from "@/features/seasonal/model";
import { GET } from "./route";

const scheduleItem = {
  id: "blue-comet:sub",
  title: "Blue Comet",
  route: "blue-comet",
  imageVersionRoute: null,
  episodeDate: "2026-09-23T05:00:00.000Z",
  delayedUntil: null,
  delayedText: null,
  episodeNumber: 4,
  subtractedEpisodeNumber: null,
  status: "Upcoming",
  airingStatus: "upcoming",
  airType: "Sub",
};

function request() {
  return new Request("http://localhost/api/schedule?year=2026&week=39&tz=Asia%2FBangkok&airType=all");
}

beforeEach(() => {
  mocks.currentUser.mockResolvedValue({ id: 7, name: "Viewer" });
  mocks.account.mockReturnValue({ imported: true });
  mocks.entries.mockReturnValue([{ anime: { id: "mal-42" } }]);
  mocks.fetchSeasonRoutes.mockResolvedValue(new Map([[42, ["blue-comet"]]]));
  mocks.fetchSchedule.mockResolvedValue([scheduleItem]);
  mocks.errorResponse.mockImplementation((error: { code?: string; status?: number }) =>
    Response.json({ error: { code: error.code ?? "internal_error" } }, { status: error.status ?? 500 }));
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/schedule", () => {
  it("rejects invalid weeks, filters, and time zones before reading MAL data", async () => {
    const response = await GET(new Request("http://localhost/api/schedule?year=2025&week=53&tz=UTC&airType=all"));

    expect(response.status).toBe(400);
    expect(mocks.currentUser).not.toHaveBeenCalled();
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("returns the explicit list-not-imported state expected by the browser", async () => {
    mocks.account.mockReturnValue({ imported: false });

    const response = await GET(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: { code: "list_not_imported" } });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fetchSeasonRoutes).not.toHaveBeenCalled();
  });

  it("returns a private current-season schedule filtered to saved MAL anime", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 1,
      items: [scheduleItem],
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fetchSchedule).toHaveBeenCalledOnce();
    expect(mocks.fetchSchedule.mock.calls[0][0]).toEqual({ year: 2026, week: 39 });
  });

  it("returns zero matches without requesting the weekly timetable", async () => {
    mocks.entries.mockReturnValue([{ anime: { id: "mal-99" } }]);
    mocks.fetchSeasonRoutes.mockResolvedValue(new Map());

    const response = await GET(request());

    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 0,
      items: [],
    });
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("surfaces missing AnimeSchedule configuration as a catalog service error", async () => {
    mocks.fetchSeasonRoutes.mockRejectedValue(new mocks.ScheduleServiceError("not_configured"));

    const response = await GET(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "not_configured", source: "catalog" } });
  });
});