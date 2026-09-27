// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./metadata-sdk.js", () => ({ metadataProvider: { search: vi.fn(), fetchMediaInfo: vi.fn() } }));
import { metadataProvider } from "./metadata-sdk.js";
import { catalogAnime, fetchMetadata, getCatalogDetail, searchCatalog } from "./catalog.js";

beforeEach(() => { vi.clearAllMocks(); vi.stubEnv("MAL_CLIENT_ID", ""); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("official MAL playback metadata", () => {
  it("loads canonical details with alternate titles without calling Jikan", async () => {
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({
      id: 51179, title: "Mushoku Tensei II: Isekai Ittara Honki Dasu", num_episodes: 12,
      alternative_titles: { en: "Mushoku Tensei: Jobless Reincarnation Season 2", ja: "無職転生 II", synonyms: ["Mushoku Tensei 2", "", 123] },
      start_date: "2023-07-10", nsfw: "white",
    })));
    await expect(fetchMetadata("mal-51179", new AbortController().signal)).resolves.toMatchObject({
      id: "mal:anime:51179", mappings: { mal: 51179 }, episodeCount: 12, year: 2023,
      title: { english: "Mushoku Tensei: Jobless Reincarnation Season 2", romaji: "Mushoku Tensei II: Isekai Ittara Honki Dasu", native: "無職転生 II" },
      synonyms: ["Mushoku Tensei 2"],
    });
    expect(metadataProvider.fetchMediaInfo).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/v2/anime/51179?"), expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ "X-MAL-CLIENT-ID": "test-client" }) }));
  });

  it("rejects a response for a different MAL identity", async () => {
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ id: 900002, title: "Different season" })));
    await expect(fetchMetadata("mal-900001", new AbortController().signal)).rejects.toThrow("invalid_metadata");
  });

  it("distinguishes a metadata outage from a missing source and retries failures", async () => {
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ id: 900003, title: "Recovered title", num_episodes: 0 })));
    await expect(fetchMetadata("mal-900003", new AbortController().signal)).rejects.toThrow("metadata_unavailable");
    await expect(fetchMetadata("mal-900003", new AbortController().signal)).resolves.toMatchObject({ episodeCount: undefined });
  });

  it("rejects explicit adult metadata and missing IDs", async () => {
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(Response.json({ id: 900004, title: "Filtered title", nsfw: "black" }))
      .mockResolvedValueOnce(new Response(null, { status: 404 })));
    await expect(fetchMetadata("mal-900004", new AbortController().signal)).rejects.toThrow("anime_not_found");
    await expect(fetchMetadata("mal-900005", new AbortController().signal)).rejects.toThrow("anime_not_found");
  });
});

describe("catalog identity", () => {
  it("uses official MAL v2 search when MAL_CLIENT_ID is configured", async () => {
    const previous = process.env.MAL_CLIENT_ID;
    process.env.MAL_CLIENT_ID = "test-client-id";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: [{ node: {
      id: 1, title: "Cowboy Bebop", num_episodes: 26, mean: 8.75,
      main_picture: { large: "https://cdn.myanimelist.net/images/anime/1/1l.jpg" },
      genres: [{ name: "Action" }],
    } }] })));
    try {
      await expect(searchCatalog("Cowboy", new AbortController().signal)).resolves.toMatchObject([{ id: "mal-1", title: "Cowboy Bebop", totalEpisodes: 26, score: "8.75" }]);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("https://api.myanimelist.net/v2/anime?"), expect.objectContaining({ headers: expect.objectContaining({ "X-MAL-CLIENT-ID": "test-client-id" }) }));
      expect(metadataProvider.search).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.MAL_CLIENT_ID;
      else process.env.MAL_CLIENT_ID = previous;
      vi.unstubAllGlobals();
    }
  });

  it("uses anime-sdk MalMeta search when MAL_CLIENT_ID is absent", async () => {
    const previous = process.env.MAL_CLIENT_ID;
    delete process.env.MAL_CLIENT_ID;
    vi.mocked(metadataProvider.search).mockResolvedValueOnce([{ id: "mal:anime:2", providerId: "mal", catalogType: "ANIME", title: { english: "Samurai Champloo" }, mappings: { mal: 2 } }]);
    try {
      await expect(searchCatalog("Samurai", new AbortController().signal)).resolves.toMatchObject([{ id: "mal-2", title: "Samurai Champloo" }]);
      expect(metadataProvider.search).toHaveBeenCalledWith("Samurai", expect.any(Object));
    } finally {
      if (previous === undefined) delete process.env.MAL_CLIENT_ID;
      else process.env.MAL_CLIENT_ID = previous;
    }
  });

  it("uses the verified MAL ID for a seed without a fragile title search", async () => {
    vi.mocked(metadataProvider.fetchMediaInfo).mockResolvedValue({ id: "mal:anime:52991", providerId: "mal", catalogType: "ANIME", title: { english: "Frieren: Beyond Journey's End" }, episodeCount: 28 });
    expect((await fetchMetadata("skyward-bloom", new AbortController().signal)).id).toBe("mal:anime:52991");
    expect(metadataProvider.fetchMediaInfo).toHaveBeenCalledWith("mal:anime:52991", expect.any(Object));
    expect(metadataProvider.search).not.toHaveBeenCalled();
  });
  it("uses safe seed metadata when Jikan details are temporarily unavailable", async () => {
    vi.mocked(metadataProvider.fetchMediaInfo).mockRejectedValueOnce(new Error("Jikan 504"));
    await expect(fetchMetadata("neon-requiem", new AbortController().signal)).resolves.toMatchObject({
      id: "mal:anime:42310", episodeCount: 10, mappings: { mal: 42310 },
    });
  });
  it("keeps the MAL identity even when a title also exists in the demo", async () => {
    const metadata = { id: "mal:anime:52991", providerId: "mal", catalogType: "ANIME" as const, title: { english: "Frieren: Beyond Journey's End" }, episodeCount: 28 };
    expect(catalogAnime(metadata).id).toBe("mal-52991");
    vi.mocked(metadataProvider.fetchMediaInfo).mockResolvedValue(metadata);
    expect((await getCatalogDetail("mal-52991", new AbortController().signal)).id).toBe("mal-52991");
    expect((await getCatalogDetail("skyward-bloom", new AbortController().signal)).id).toBe("skyward-bloom");
  });
  it("preserves distinct seasons and unknown episode counts", () => {
    expect(catalogAnime({ id: "mal:anime:999", providerId: "mal", catalogType: "ANIME", title: { english: "Frieren Season 2" } })).toMatchObject({ id: "mal-999", totalEpisodes: null });
  });
  it("does not merge mismatched counts, accept untrusted artwork or retain HTML", () => {
    expect(catalogAnime({ id: "mal:anime:999", providerId: "mal", catalogType: "ANIME", title: { english: "Frieren: Beyond Journey's End" }, episodeCount: 12, cover: { large: "https://evil.test/a" }, description: "<b>Synopsis</b>" })).toMatchObject({ id: "mal-999", coverUrl: undefined, synopsis: "Synopsis" });
  });
});
