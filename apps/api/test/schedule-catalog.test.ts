import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MalRepository } from "../src/database/repository.js";
import { ScheduleService } from "../src/modules/schedule/schedule.service.js";

function libraryItem(id: number, status: string) {
  return { anime: { id: `mal-${id}` }, entry: { status } };
}

function timetableItem(route: string, title: string) {
  return {
    title,
    route,
    airType: "Raw",
    episodeDate: "2026-10-14T09:00:00.000Z",
    episodeNumber: 3,
    status: "Upcoming",
  };
}

beforeEach(() => {
  vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "secret-app-token");
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-15T00:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("ScheduleService with the real current-season and ongoing catalogs", () => {
  it("matches current-season and older ongoing Watching titles on the raw timetable", async () => {
    const seasonCatalog = [
      {
        route: "current-watching",
        websites: {
          mal: "myanimelist.net/anime/53913/Tensei_shitara_Ken_deshita_2",
        },
      },
      {
        route: "completed-show",
        websites: {
          mal: "https://myanimelist.net/anime/61987/Kusuriya_no_Hitorigoto_Zoku-hen",
        },
      },
      {
        route: "planned-show",
        websites: { mal: "https://myanimelist.net/anime/40123/planned" },
      },
      {
        route: "on-hold-show",
        websites: { mal: "https://myanimelist.net/anime/40124/on-hold" },
      },
      {
        route: "dropped-show",
        websites: { mal: "https://myanimelist.net/anime/40125/dropped" },
      },
    ];
    const ongoingCatalog = [
      {
        route: "one-piece",
        websites: { mal: "myanimelist.net/anime/21/One_Piece" },
      },
    ];
    const broadcasts = [
      timetableItem("current-watching", "Current Watching"),
      timetableItem("one-piece", "One Piece"),
      timetableItem("completed-show", "Completed Show"),
      timetableItem("planned-show", "Planned Show"),
      timetableItem("on-hold-show", "On Hold Show"),
      timetableItem("dropped-show", "Dropped Show"),
      timetableItem("older-season-show", "Older Season Show"),
    ];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/api/v3/anime") {
        const catalog = url.searchParams.has("airing-statuses")
          ? ongoingCatalog
          : seasonCatalog;
        return Response.json({
          page: 1,
          totalAmount: catalog.length,
          anime: catalog,
        });
      }
      if (url.pathname === "/api/v3/timetables/raw")
        return Response.json(broadcasts);
      throw new Error("unexpected_animeschedule_request");
    });
    vi.stubGlobal("fetch", fetcher);

    const repository = {
      session: vi.fn().mockResolvedValue({ id: 7, name: "Viewer" }),
      account: vi.fn().mockResolvedValue({ imported: true }),
      entries: vi
        .fn()
        .mockResolvedValue([
          libraryItem(53913, "watching"),
          libraryItem(61987, "completed"),
          libraryItem(40123, "planned"),
          libraryItem(40124, "on_hold"),
          libraryItem(40125, "dropped"),
          libraryItem(21, "watching"),
          libraryItem(40126, "watching"),
        ]),
    } as unknown as MalRepository;
    const service = new ScheduleService(repository);
    const response = await service.schedule(
      new Request(
        "http://localhost/api/schedule?year=2026&week=42&tz=UTC&airType=all",
        { headers: { cookie: "sabame_mal_session=test-session" } },
      ),
    );

    expect(response.status).toBe(200);
    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(
      urls.some(
        (url) =>
          url.pathname === "/api/v3/anime" &&
          url.search === "?years=2026&seasons=fall&page=1",
      ),
    ).toBe(true);
    expect(
      urls.some(
        (url) =>
          url.pathname === "/api/v3/anime" &&
          url.search === "?airing-statuses=ongoing&page=1",
      ),
    ).toBe(true);
    expect(urls.some((url) => url.pathname === "/api/v3/timetables/raw")).toBe(
      true,
    );
    expect(urls.some((url) => url.pathname === "/api/v3/timetables/all")).toBe(
      false,
    );
    expect(await response.json()).toEqual({
      state: "ready",
      season: { year: 2026, season: "fall" },
      matchedAnimeCount: 2,
      items: [
        {
          id: "current-watching:raw:2026-10-14T09:00:00.000Z::3",
          title: "Current Watching",
          route: "current-watching",
          imageVersionRoute: null,
          episodeDate: "2026-10-14T09:00:00.000Z",
          delayedUntil: null,
          delayedText: null,
          episodeNumber: 3,
          subtractedEpisodeNumber: null,
          status: "Upcoming",
          airingStatus: null,
          airType: "Raw",
        },
        {
          id: "one-piece:raw:2026-10-14T09:00:00.000Z::3",
          title: "One Piece",
          route: "one-piece",
          imageVersionRoute: null,
          episodeDate: "2026-10-14T09:00:00.000Z",
          delayedUntil: null,
          delayedText: null,
          episodeNumber: 3,
          subtractedEpisodeNumber: null,
          status: "Upcoming",
          airingStatus: null,
          airType: "Raw",
        },
      ],
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
