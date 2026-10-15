import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  account: vi.fn(),
  entries: vi.fn(),
  fetchScheduleRoutes: vi.fn(),
  fetchSchedule: vi.fn(),
  ScheduleServiceError: class extends Error {
    constructor(readonly code: string) {
      super(code);
    }
  },
}));

vi.mock("@sabame/catalog/schedule-catalog", () => ({
  fetchScheduleRoutes: mocks.fetchScheduleRoutes,
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
  id: "blue-comet:raw",
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
  airType: "Raw",
};
const ongoingScheduleItem = {
  ...scheduleItem,
  id: "one-piece:raw",
  title: "One Piece",
  route: "one-piece",
};
const lowercaseRawScheduleItem = {
  ...scheduleItem,
  id: "blue-comet:raw-lowercase",
  airType: "raw",
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
  mocks.entries.mockResolvedValue([
    { anime: { id: "mal-42" }, entry: { status: "watching" } },
  ]);
  mocks.fetchScheduleRoutes.mockResolvedValue(new Map([[42, ["blue-comet"]]]));
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
    expect(mocks.fetchScheduleRoutes).not.toHaveBeenCalled();
  });

  it.each(["all", "sub", "dub", "raw"] as const)(
    "returns a private Watching schedule from the raw timetable for airType=%s",
    async (airType) => {
      mocks.fetchSchedule.mockResolvedValue([
        scheduleItem,
        lowercaseRawScheduleItem,
        { ...scheduleItem, id: "blue-comet:sub", airType: "Sub" },
        { ...scheduleItem, id: "blue-comet:dub", airType: "Dub" },
      ]);
      const response = await schedule.schedule(
        request(`year=2026&week=39&tz=Asia%2FBangkok&airType=${airType}`),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        state: "ready",
        season: currentSeason(),
        matchedAnimeCount: 1,
        items: [scheduleItem, lowercaseRawScheduleItem],
      });
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(mocks.fetchSchedule).toHaveBeenCalledOnce();
      expect(mocks.fetchSchedule).toHaveBeenCalledWith(
        { year: 2026, week: 39 },
        "Asia/Bangkok",
        "raw",
      );
    },
  );

  it("matches Watching titles in the current-season and ongoing catalogs", async () => {
    mocks.entries.mockResolvedValue([
      { anime: { id: "mal-42" }, entry: { status: "watching" } },
      { anime: { id: "mal-43" }, entry: { status: "completed" } },
      { anime: { id: "mal-44" }, entry: { status: "planned" } },
      { anime: { id: "mal-45" }, entry: { status: "on_hold" } },
      { anime: { id: "mal-46" }, entry: { status: "dropped" } },
      { anime: { id: "mal-47" }, entry: { status: "watching" } },
      { anime: { id: "mal-48" }, entry: { status: "watching" } },
      { anime: { id: "mal-99" }, entry: { status: "watching" } },
    ]);
    mocks.fetchScheduleRoutes.mockResolvedValue(
      new Map([
        [42, ["blue-comet"]],
        [43, ["completed-show"]],
        [44, ["planned-show"]],
        [45, ["on-hold-show"]],
        [46, ["dropped-show"]],
        [47, ["one-piece"]],
      ]),
    );
    mocks.fetchSchedule.mockResolvedValue([
      scheduleItem,
      ongoingScheduleItem,
      {
        ...scheduleItem,
        id: "completed-show:sub",
        title: "Completed Show",
        route: "completed-show",
      },
      {
        ...scheduleItem,
        id: "planned-show:sub",
        title: "Planned Show",
        route: "planned-show",
      },
      {
        ...scheduleItem,
        id: "on-hold-show:sub",
        title: "On Hold Show",
        route: "on-hold-show",
      },
      {
        ...scheduleItem,
        id: "dropped-show:sub",
        title: "Dropped Show",
        route: "dropped-show",
      },
      {
        ...scheduleItem,
        id: "older-season-show:sub",
        title: "Older Season Show",
        route: "older-season-show",
      },
      {
        ...scheduleItem,
        id: "older-finished-show:raw",
        title: "Older Finished Show",
        route: "older-finished-show",
      },
    ]);

    const response = await schedule.schedule(request());

    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 2,
      items: [scheduleItem, ongoingScheduleItem],
    });
  });

  it("returns zero matches without requesting the weekly timetable", async () => {
    mocks.entries.mockResolvedValue([
      { anime: { id: "mal-99" }, entry: { status: "watching" } },
    ]);
    mocks.fetchScheduleRoutes.mockResolvedValue(new Map());

    const response = await schedule.schedule(request());

    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 0,
      items: [],
    });
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("returns no schedule without requesting catalog data when no titles are Watching", async () => {
    mocks.entries.mockResolvedValue([
      { anime: { id: "mal-42" }, entry: { status: "completed" } },
    ]);

    const response = await schedule.schedule(request());

    expect(await response.json()).toEqual({
      state: "ready",
      season: currentSeason(),
      matchedAnimeCount: 0,
      items: [],
    });
    expect(mocks.fetchScheduleRoutes).not.toHaveBeenCalled();
    expect(mocks.fetchSchedule).not.toHaveBeenCalled();
  });

  it("surfaces missing AnimeSchedule configuration as a catalog service error", async () => {
    mocks.fetchScheduleRoutes.mockRejectedValue(
      new mocks.ScheduleServiceError("not_configured"),
    );

    const response = await schedule.schedule(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: { code: "not_configured", source: "catalog" },
    });
  });
});
