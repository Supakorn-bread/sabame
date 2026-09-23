import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { fetchSeasonRoutes } from "./anime-catalog";

beforeEach(() => vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "secret-app-token"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function anime(route: string, malId?: number) {
  return {
    route,
    websites: malId ? { mal: "https://myanimelist.net/anime/" + malId + "/title" } : {},
  };
}

describe("AnimeSchedule current-season crosswalk", () => {
  it("requests documented season pages and maps only exact MAL website IDs to routes", async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page"));
      if (page === 1) {
        return Promise.resolve(Response.json({
          page: 1,
          totalAmount: 3,
          anime: [anime("fall-title-one", 101), anime("without-mal")],
        }));
      }
      return Promise.resolve(Response.json({
        page: 2,
        totalAmount: 3,
        anime: [anime("fall-title-two", 202)],
      }));
    });
    vi.stubGlobal("fetch", fetcher);

    const result = await fetchSeasonRoutes({ year: 2091, season: "fall" });

    expect(fetcher).toHaveBeenCalledTimes(2);
    const [url, options] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/api/v3/anime?years=2091&seasons=fall&page=1");
    expect(options.headers).toEqual({ Accept: "application/json", Authorization: "Bearer secret-app-token" });
    expect(result.get(101)).toEqual(["fall-title-one"]);
    expect(result.get(202)).toEqual(["fall-title-two"]);
    expect(result.has(0)).toBe(false);
  });

  it("shares only public season metadata through the cache", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({
      page: 1,
      totalAmount: 1,
      anime: [anime("one-title", 301)],
    }));
    vi.stubGlobal("fetch", fetcher);

    const first = await fetchSeasonRoutes({ year: 2092, season: "winter" });
    const second = await fetchSeasonRoutes({ year: 2092, season: "winter" });

    expect(second).toBe(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails explicitly instead of caching an incomplete catalog as empty", async () => {
    const fetcher = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.searchParams.get("page") === "1") {
        return Promise.resolve(Response.json({ page: 1, totalAmount: 3, anime: [anime("one-title", 401), anime("no-map")] }));
      }
      return Promise.resolve(Response.json({ page: 2, totalAmount: 3, anime: [] }));
    });
    vi.stubGlobal("fetch", fetcher);

    await expect(fetchSeasonRoutes({ year: 2093, season: "spring" })).rejects.toMatchObject({ code: "invalid_payload" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("rejects malformed page identity and an unconfigured server token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ page: 2, totalAmount: 1, anime: [anime("wrong-page", 501)] })));
    await expect(fetchSeasonRoutes({ year: 2094, season: "summer" })).rejects.toMatchObject({ code: "invalid_payload" });

    vi.stubEnv("ANIMESCHEDULE_API_TOKEN", "");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(fetchSeasonRoutes({ year: 2095, season: "fall" })).rejects.toMatchObject({ code: "not_configured" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});