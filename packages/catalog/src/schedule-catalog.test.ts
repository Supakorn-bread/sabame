import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchScheduleRoutes } from "./schedule-catalog.js";

beforeEach(() => vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "secret-app-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function anime(route: string, mal?: number | string) {
  return {
    route,
    websites: typeof mal === "number"
      ? { mal: "https://myanimelist.net/anime/" + mal + "/title" }
      : typeof mal === "string" ? { mal } : {},
  };
}

describe("AnimeSchedule current-season and ongoing crosswalk", () => {
  it("requests both catalogs, keeps aliases, and deduplicates overlapping routes", async () => {
    const longRoute = "r" + "x".repeat(217);
    const tooLongRoute = "r" + "x".repeat(512);
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      if (url.searchParams.get("airing-statuses") === "ongoing") {
        return Promise.resolve(Response.json({
          page: 1,
          totalAmount: 3,
          anime: [anime("one-piece", 21), anime("shared-route", 301), anime("shared-alias", 301)],
        }));
      }
      if (page === 1) {
        return Promise.resolve(Response.json({
          page: 1,
          totalAmount: 6,
          anime: [anime("fall-title-one", 101), anime("shared-route", 301), anime("without-mal")],
        }));
      }
      return Promise.resolve(Response.json({
        page: 2,
        totalAmount: 6,
        anime: [anime("fall-title-two", 202), anime(longRoute, 404), anime(tooLongRoute, 405)],
      }));
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchScheduleRoutes({ year: 2091, season: "fall" });

    const urls = fetcher.mock.calls.map(([input]) => new URL(String(input)));
    expect(urls.some((url) => url.searchParams.get("years") === "2091"
      && url.searchParams.get("seasons") === "fall"
      && !url.searchParams.has("airing-statuses"))).toBe(true);
    expect(urls.some((url) => url.searchParams.get("airing-statuses") === "ongoing"
      && !url.searchParams.has("years")
      && !url.searchParams.has("seasons"))).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const [, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(options.headers).toEqual({ Accept: "application/json", Authorization: "Bearer secret-app-token" });
    expect([...result]).toEqual([
      [101, ["fall-title-one"]],
      [301, ["shared-route", "shared-alias"]],
      [202, ["fall-title-two"]],
      [404, [longRoute]],
      [21, ["one-piece"]],
    ]);
    expect(result.has(405)).toBe(false);
  });

  it("normalizes scheme-less MAL links while rejecting other hosts, schemes, and paths", async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return Promise.resolve(Response.json(url.searchParams.has("airing-statuses")
        ? { page: 1, totalAmount: 0, anime: [] }
        : {
          page: 1,
          totalAmount: 10,
          anime: [
            anime("bare-mal", "myanimelist.net/anime/53913/title"),
            anime("bare-www-mal", "www.myanimelist.net/anime/70126/title"),
            anime("https-mal", "https://myanimelist.net/anime/61987/title"),
            anime("www-mal", "https://www.myanimelist.net/anime/70125/title"),
            anime("mal-alias", "myanimelist.net/anime/53913/title"),
            anime("suffix-host", "https://myanimelist.net.evil.example/anime/80001/title"),
            anime("userinfo-host", "https://myanimelist.net@evil.example/anime/80002/title"),
            anime("http-mal", "http://myanimelist.net/anime/80003/title"),
            anime("unsafe-scheme", "javascript:alert(1)"),
            anime("wrong-path", "myanimelist.net/manga/80004/title"),
          ],
        }));
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchScheduleRoutes({ year: 2096, season: "spring" });

    expect([...result]).toEqual([
      [53913, ["bare-mal", "mal-alias"]],
      [70126, ["bare-www-mal"]],
      [61987, ["https-mal"]],
      [70125, ["www-mal"]],
    ]);
  });

  it("shares the complete current-season and ongoing crosswalk through the cache", async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return Promise.resolve(Response.json(url.searchParams.has("airing-statuses")
        ? { page: 1, totalAmount: 0, anime: [] }
        : { page: 1, totalAmount: 1, anime: [anime("one-title", 301)] }));
    });
    vi.stubGlobal("fetch", fetcher);

    const first = await fetchScheduleRoutes({ year: 2092, season: "winter" });
    const second = await fetchScheduleRoutes({ year: 2092, season: "winter" });

    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["season", "ongoing"] as const)(
    "retries both catalogs after the %s catalog page fails",
    async (failedFilter) => {
      let failedAttempt = 0;
      const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
        const url = new URL(String(input));
        const page = Number(url.searchParams.get("page"));
        const isOngoing = url.searchParams.has("airing-statuses");
        const isFailedFilter = (failedFilter === "ongoing") === isOngoing;
        if (!isFailedFilter) {
          return Promise.resolve(Response.json({
            page: 1,
            totalAmount: 1,
            anime: [anime(isOngoing ? "ongoing-title" : "season-title", isOngoing ? 401 : 501)],
          }));
        }
        if (page === 1) {
          failedAttempt += 1;
          return Promise.resolve(Response.json({
            page: 1,
            totalAmount: 3,
            anime: failedFilter === "ongoing"
              ? [anime("ongoing-one", 401), anime("ongoing-two", 402)]
              : [anime("season-one", 501), anime("season-two", 502)],
          }));
        }
        return Promise.resolve(Response.json({
          page: 2,
          totalAmount: 3,
          anime: failedAttempt === 1
            ? []
            : [anime(failedFilter === "ongoing" ? "ongoing-three" : "season-three", failedFilter === "ongoing" ? 403 : 503)],
        }));
      });
      vi.stubGlobal("fetch", fetcher);

      const selection = { year: failedFilter === "season" ? 2093 : 2094, season: "spring" as const };
      await expect(fetchScheduleRoutes(selection))
        .rejects.toMatchObject({ code: "invalid_payload" });
      const result = await fetchScheduleRoutes(selection);

      expect(fetcher).toHaveBeenCalledTimes(6);
      expect([...result]).toEqual(failedFilter === "season"
        ? [
          [501, ["season-one"]],
          [502, ["season-two"]],
          [503, ["season-three"]],
          [401, ["ongoing-title"]],
        ]
        : [
          [501, ["season-title"]],
          [401, ["ongoing-one"]],
          [402, ["ongoing-two"]],
          [403, ["ongoing-three"]],
        ]);
    },
  );

  it("rejects malformed page identity and an unconfigured server token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ page: 2, totalAmount: 1, anime: [anime("wrong-page", 501)] })));
    await expect(fetchScheduleRoutes({ year: 2094, season: "summer" })).rejects.toMatchObject({ code: "invalid_payload" });

    vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchScheduleRoutes({ year: 2095, season: "fall" })).rejects.toMatchObject({ code: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
