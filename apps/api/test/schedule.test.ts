import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
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

vi.mock("@sabame/catalog/schedule-catalog", () => ({
  fetchSeasonRoutes: mocks.fetchSeasonRoutes,
}));
vi.mock("@sabame/catalog/schedule", () => ({
  fetchSchedule: mocks.fetchSchedule,
  ScheduleServiceError: mocks.ScheduleServiceError,
  isTimeZone: (value: unknown) => typeof value === "string" && value.length > 0,
}));

import { currentSeason } from "@sabame/domain/seasonal";
import { MalRepository } from "../src/database/repository.js";
import { ScheduleService } from "../src/modules/schedule/schedule.service.js";
import { ScheduleModule } from "../src/modules/schedule/schedule.module.js";

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

let moduleRef: TestingModule;
let schedule: ScheduleService;

function request(query = "year=2026&week=39&tz=Asia%2FBangkok&airType=all") {
  return new Request(`http://localhost/api/schedule?${query}`, {
    headers: { cookie: "sabame_mal_session=test-session" },
  });
}

beforeEach(async () => {
  mocks.session.mockResolvedValue({ id: 7, name: "Viewer" });
  mocks.account.mockResolvedValue({ imported: true });
  mocks.entries.mockResolvedValue([{ anime: { id: "mal-42" } }]);
  mocks.fetchSeasonRoutes.mockResolvedValue(new Map([[42, ["blue-comet"]]]));
  mocks.fetchSchedule.mockResolvedValue([scheduleItem]);

  const repository = {
    session: mocks.session,
    account: mocks.account,
    entries: mocks.entries,
  };
  moduleRef = await Test.createTestingModule({ imports: [ScheduleModule] })
    .overrideProvider(MalRepository)
    .useValue(repository)
    .compile();
  schedule = moduleRef.get(ScheduleService);
});

afterEach(async () => {
  await moduleRef?.close();
  vi.clearAllMocks();
});

describe("ScheduleService", () => {
  it("rejects invalid weeks, filters, and time zones before reading MAL data", async () => {
    const response = await schedule.schedule(
      request("year=2025&week=53&tz=UTC&airType=all"),
    );

    expect(response.status).toBe(400);
    expect(mocks.session).not.toHaveBeenCalled();
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("returns the explicit list-not-imported state expected by the browser", async () => {
    mocks.account.mockResolvedValue({ imported: false });

    const response = await schedule.schedule(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: { code: "list_not_imported" },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fetchSeasonRoutes).not.toHaveBeenCalled();
  });

  it("returns a private current-season schedule filtered to saved MAL anime", async () => {
    const response = await schedule.schedule(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 1,
      items: [scheduleItem],
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.fetchSchedule).toHaveBeenCalledOnce();
    expect(mocks.fetchSchedule.mock.calls[0][0]).toEqual({
      year: 2026,
      week: 39,
    });
  });

  it("returns zero matches without requesting the weekly timetable", async () => {
    mocks.entries.mockResolvedValue([{ anime: { id: "mal-99" } }]);
    mocks.fetchSeasonRoutes.mockResolvedValue(new Map());

    const response = await schedule.schedule(request());

    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 0,
      items: [],
    });
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("surfaces missing AnimeSchedule configuration as a catalog service error", async () => {
    mocks.fetchSeasonRoutes.mockRejectedValue(
      new mocks.ScheduleServiceError("not_configured"),
    );

    const response = await schedule.schedule(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", source: "catalog" },
    });
  });
});
