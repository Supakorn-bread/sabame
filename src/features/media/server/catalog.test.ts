// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./sdk", () => ({ metadataProvider: { search: vi.fn(), fetchMediaInfo: vi.fn() } }));
import { metadataProvider } from "./sdk";
import { catalogAnime, fetchMetadata, getCatalogDetail, searchCatalog } from "./catalog";

beforeEach(() => vi.clearAllMocks());

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
