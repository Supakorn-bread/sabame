// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
vi.mock("./hianime", () => ({ getHianimeEpisodes: vi.fn(), hianimeAdapter: { id: "hianime", resolve: vi.fn() } }));
vi.mock("./sdk", () => ({ animeParadise: { search: vi.fn(), fetchContentUnits: vi.fn(), resolveStream: vi.fn() }, mappingClient: { resolveProviderMediaId: vi.fn() } }));
import { fetchMetadata } from "./catalog";
import { getHianimeEpisodes } from "./hianime";
import { animeParadise, mappingClient } from "./sdk";
import { animeParadiseAdapter, getProviderEpisodes } from "./providers";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { english: "Test Season 2" }, year: 2025, episodeCount: 12 });
  vi.mocked(mappingClient.resolveProviderMediaId).mockResolvedValue({ providerId: "animeparadise", rawMediaId: "test", matchedTitle: "Test Season 2", method: "fuzzy" });
  vi.mocked(animeParadise.search).mockResolvedValue([{ id: "animeparadise:test", title: "Test Season 2", year: 2025, catalogType: "ANIME", providerId: "animeparadise" }]);
  vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ id: `animeparadise:episode-${index + 1}:test`, title: `Episode ${index + 1}`, number: index + 1 })));
  vi.mocked(animeParadise.resolveStream).mockResolvedValue({ type: "video", streams: [{ sourceUrl: "https://stream.animeparadise.moe/master", isHLS: true, quality: "auto", subtitles: [{ language: "th", label: "Theatre", url: "https://stream.animeparadise.moe/sub" }] }] });
});
const resolve = (animeId = "mal-1", episodeNumber = 1) => animeParadiseAdapter.resolve({ animeId, episodeNumber }, new AbortController().signal);
describe("SDK provider boundary", () => {
  it("uses reviewed seed mappings without depending on fuzzy title matching", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue(Array.from({ length: 8 }, (_, index) => ({ id: `animeparadise:demon-${index + 1}`, title: `Episode ${index + 1}`, number: index + 1 })));
    await resolve("last-shrine", 8);
    expect(animeParadise.fetchContentUnits).toHaveBeenCalledWith("animeparadise:n65FbTbSr8ul9KIH", expect.any(Object));
    expect(animeParadise.resolveStream).toHaveBeenCalledWith("animeparadise:demon-8", "sub", expect.any(Object));
    expect(mappingClient.resolveProviderMediaId).not.toHaveBeenCalled();
  });
  it("maps the combined Mushoku tracker season to its explicit second cour", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ id: `animeparadise:cour-2-${index + 1}`, title: `Episode ${index + 1}`, number: index + 1 })));
    await resolve("moonlit-recipe", 13);
    expect(animeParadise.fetchContentUnits).toHaveBeenCalledWith("animeparadise:083jwmRQ17PMS4jy", expect.any(Object));
    expect(animeParadise.resolveStream).toHaveBeenCalledWith("animeparadise:cour-2-1", "sub", expect.any(Object));
  });
  it("reports a missing provider catalog entry as no_source", async () => {
    await expect(resolve("neon-requiem", 1)).rejects.toThrow("no_source");
    expect(animeParadise.search).not.toHaveBeenCalled();
    expect(animeParadise.fetchContentUnits).not.toHaveBeenCalled();
  });
  it("searches canonical MAL titles even when their demo has no reviewed source", async () => {
    const result = await resolve("mal-42310", 1);
    expect(result.video).toEqual({ url: "https://stream.animeparadise.moe/master", type: "hls" });
    expect(animeParadise.search).toHaveBeenCalledWith("Test Season 2", expect.any(Object));
  });
  it("fails closed when a reviewed provider entry changes episode count", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue([{ id: "animeparadise:changed", title: "Episode 1", number: 1 }]);
    await expect(resolve("last-shrine", 1)).rejects.toThrow("mapping_required");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
  it("uses actual SDK episode URNs with strict matching and corrects inferred language", async () => {
    const result = await resolve();
    expect(animeParadise.resolveStream).toHaveBeenCalledWith("animeparadise:episode-1:test", "sub", expect.objectContaining({ strictEpisodeMatching: true, episodeAbsoluteMatching: "never" }));
    expect(result.subtitles?.[0].language).toBe("und");
  });
  it("resolves an exact MAL synonym without a fuzzy mapping or duplicate searches", async () => {
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { english: "Official Title", romaji: "Official Title" }, synonyms: ["Test Season 2"], episodeCount: 12 });
    vi.mocked(mappingClient.resolveProviderMediaId).mockResolvedValue(null);
    vi.mocked(animeParadise.search).mockImplementation(async (query) => query === "Test Season 2" ? [{ id: "animeparadise:test", title: "Test Season 2", catalogType: "ANIME", providerId: "animeparadise" }] : []);
    await resolve();
    expect(animeParadise.search).toHaveBeenCalledTimes(2);
    expect(animeParadise.resolveStream).toHaveBeenCalledWith("animeparadise:episode-1:test", "sub", expect.any(Object));
    expect(mappingClient.resolveProviderMediaId).not.toHaveBeenCalled();
  });
  it("reports no source only when provider searches finish with no results", async () => {
    vi.mocked(animeParadise.search).mockResolvedValue([]);
    await expect(resolve()).rejects.toThrow("no_source");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
  it("keeps an exact alias match when another search fails", async () => {
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { english: "Official Title", romaji: "Test Season 2" }, year: 2025, episodeCount: 12 });
    vi.mocked(animeParadise.search).mockImplementation(async (query) => {
      if (query === "Official Title") throw new Error("upstream failure");
      return [{ id: "animeparadise:test", title: "Test Season 2", year: 2025, catalogType: "ANIME", providerId: "animeparadise" }];
    });
    expect((await resolve()).video).toEqual({ url: "https://stream.animeparadise.moe/master", type: "hls" });
  });
  it("does not claim there is no source when alias searches fail", async () => {
    vi.mocked(fetchMetadata).mockResolvedValue({ id: "mal:anime:1", providerId: "mal", catalogType: "ANIME", title: { english: "Official Title", romaji: "Test Season 2" }, episodeCount: 12 });
    vi.mocked(animeParadise.search).mockImplementation(async (query) => {
      if (query === "Official Title") throw new Error("upstream failure");
      return [];
    });
    await expect(resolve()).rejects.toThrow("provider_unavailable");
  });
  it("plays an exact episode from a partially available catalog", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue([{ id: "animeparadise:episode-1:test", title: "Episode 1", number: 1 }]);
    expect((await resolve()).video).toEqual({ url: "https://stream.animeparadise.moe/master", type: "hls" });
    await expect(resolve("mal-1", 2)).rejects.toThrow("episode_unavailable");
  });
  it("rejects partial catalogs with episode numbers outside the identified season", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue([{ id: "animeparadise:episode-13:test", title: "Episode 13", number: 13 }]);
    await expect(resolve("mal-1", 13)).rejects.toThrow("mapping_required");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
  it("rejects a different season even when the SDK supplies a mapping", async () => {
    vi.mocked(mappingClient.resolveProviderMediaId).mockResolvedValue({ providerId: "animeparadise", rawMediaId: "wrong", matchedTitle: "Test Season 1", method: "fuzzy" });
    vi.mocked(animeParadise.search).mockResolvedValue([{ id: "animeparadise:wrong", title: "Test Season 1", providerId: "animeparadise", catalogType: "ANIME" }]);
    await expect(resolve()).rejects.toThrow("mapping_required");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
  it("rejects competing exact matches and year mismatches", async () => {
    vi.mocked(animeParadise.search).mockResolvedValue([{ id: "animeparadise:test", title: "Test Season 2", year: 2024, catalogType: "ANIME", providerId: "animeparadise" }]);
    await expect(resolve()).rejects.toThrow("mapping_required");
    const hit = { title: "Test Season 2", catalogType: "ANIME" as const, providerId: "animeparadise" };
    vi.mocked(animeParadise.search).mockResolvedValue([{ ...hit, id: "animeparadise:test" }, { ...hit, id: "animeparadise:duplicate" }]);
    await expect(resolve()).rejects.toThrow("mapping_required");
  });
  it("does not substitute the closest episode", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue(Array.from({ length: 11 }, (_, index) => ({ id: `animeparadise:episode-${index + 2}:test`, title: `Episode ${index + 2}`, number: index + 2 })));
    await expect(resolve()).rejects.toThrow("episode_unavailable");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
  it("lists provider episodes rather than filling the metadata episode count", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue([
      { id: "animeparadise:episode-4:test", title: "Fourth", number: 4 },
      { id: "animeparadise:episode-1:test", title: "First", number: 1 },
    ]);
    expect(await getProviderEpisodes("mal-1", new AbortController().signal)).toEqual([{ number: 1, title: "First" }, { number: 4, title: "Fourth" }]);
    expect(getHianimeEpisodes).not.toHaveBeenCalled();
  });
  it("uses verified fallback inventory when the primary provider has no source", async () => {
    vi.mocked(getHianimeEpisodes).mockResolvedValue([{ number: 1, title: "Let You Down" }]);
    expect(await getProviderEpisodes("neon-requiem", new AbortController().signal)).toEqual([{ number: 1, title: "Let You Down" }]);
    expect(getHianimeEpisodes).toHaveBeenCalledWith("neon-requiem", expect.any(AbortSignal));
  });
  it("uses verified fallback inventory after a primary provider failure", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockRejectedValue(new Error("unavailable"));
    vi.mocked(getHianimeEpisodes).mockResolvedValue([{ number: 3, title: "Third" }]);
    expect(await getProviderEpisodes("mal-1", new AbortController().signal)).toEqual([{ number: 3, title: "Third" }]);
  });
  it("omits ambiguous episode numbers from provider availability", async () => {
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue([
      { id: "animeparadise:a", title: "First", number: 1 },
      { id: "animeparadise:b", title: "Duplicate", number: 1 },
      { id: "animeparadise:c", title: "Second", number: 2 },
    ]);
    expect(await getProviderEpisodes("mal-1", new AbortController().signal)).toEqual([{ number: 2, title: "Second" }]);
  });
  it("lists reviewed split seasons with canonical episode numbers", async () => {
    expect((await getProviderEpisodes("moonlit-recipe", new AbortController().signal)).map((episode) => episode.number)).toEqual(Array.from({ length: 24 }, (_, index) => index + 1));
  });
});
