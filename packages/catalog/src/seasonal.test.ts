// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const selection = { year: 2026, season: "summer" as const };
beforeEach(() => { vi.resetModules(); vi.stubEnv("MAL_CLIENT_ID", "season-test-client"); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("seasonal catalog API", () => {
  it("normalizes real season data, excludes invalid/adult entries, deduplicates and caches successes", async () => {
    const node = { id: 1, title: "Original title", alternative_titles: { en: "English title" }, main_picture: { large: "https://cdn.myanimelist.net/images/anime/1.jpg" }, num_episodes: 12, mean: 8.5, genres: [{ name: "Adventure" }], studios: [{ name: "Studio" }], media_type: "tv", start_date: "2026-04-10", num_list_users: 1000 };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ node }, { node }, { node: { ...node, id: 2, nsfw: "black" } }, { node: { title: "Invalid" } }], paging: {} })));
    const { fetchSeasonalCatalog } = await import("./seasonal.js");
    const result = await fetchSeasonalCatalog(selection, 1, new AbortController().signal);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: "mal-1", title: "English title", score: "8.50", totalEpisodes: 12, format: "tv", studios: ["Studio"], genres: ["Adventure"], continuing: true });
    expect(result.nextPage).toBeNull();
    await fetchSeasonalCatalog(selection, 1, new AbortController().signal);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/anime/season/2026/summer?"), expect.objectContaining({ headers: expect.objectContaining({ "X-MAL-CLIENT-ID": "season-test-client" }) }));
  });
  it("uses safe local page numbers rather than following an upstream URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => Response.json({ data: [], paging: { next: "https://untrusted.test/private" } })));
    const { fetchSeasonalCatalog } = await import("./seasonal.js");
    expect((await fetchSeasonalCatalog(selection, 1, new AbortController().signal)).nextPage).toBe(2);
    await fetchSeasonalCatalog(selection, 2, new AbortController().signal);
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain("offset=500");
    expect(vi.mocked(fetch).mock.calls[1][0]).not.toContain("untrusted");
  });
  it("uses Jikan seasonal data without MAL configuration, preserving pagination and unknown counts", async () => {
    vi.stubEnv("MAL_CLIENT_ID", "");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ mal_id: 3, title: "Original", title_english: "New anime", episodes: null, type: "Movie", images: { jpg: { large_image_url: "https://cdn.myanimelist.net/images/anime/3.jpg" } }, synopsis: "Story", aired: { from: "2026-07-12T00:00:00Z" }, studios: [{ name: "Studio" }], members: 500 }], pagination: { has_next_page: true } })));
    const { fetchSeasonalCatalog } = await import("./seasonal.js");
    expect(await fetchSeasonalCatalog(selection, 1, new AbortController().signal)).toMatchObject({ items: [{ id: "mal-3", title: "New anime", totalEpisodes: null, format: "movie", continuing: false }], nextPage: 2 });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("api.jikan.moe/v4/seasons/2026/summer"), expect.anything());
  });
  it("does not cache failures or aborted results", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 503 })).mockResolvedValue(Response.json({ data: [], paging: {} })));
    const { fetchSeasonalCatalog } = await import("./seasonal.js");
    await expect(fetchSeasonalCatalog(selection, 1, controller.signal)).rejects.toThrow("seasonal_unavailable");
    await expect(fetchSeasonalCatalog(selection, 1, controller.signal)).resolves.toEqual({ items: [], nextPage: null });
    controller.abort();
    await expect(fetchSeasonalCatalog(selection, 1, controller.signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
