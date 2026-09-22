// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn() }));
vi.mock("./sdk", () => ({ animeParadise: { search: vi.fn(), fetchContentUnits: vi.fn(), resolveStream: vi.fn() }, mappingClient: { resolveProviderMediaId: vi.fn() } }));
import { fetchMetadata } from "./catalog";
import { animeParadise, mappingClient } from "./sdk";
import { animeParadiseAdapter } from "./providers";

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
  it("rejects a different season even when the SDK supplies a mapping", async () => {
    vi.mocked(mappingClient.resolveProviderMediaId).mockResolvedValue({ providerId: "animeparadise", rawMediaId: "wrong", matchedTitle: "Test Season 1", method: "fuzzy" });
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
    vi.mocked(animeParadise.fetchContentUnits).mockResolvedValue(Array.from({ length: 12 }, (_, index) => ({ id: `animeparadise:episode-${index + 2}:test`, title: `Episode ${index + 2}`, number: index + 2 })));
    await expect(resolve()).rejects.toThrow("episode_unavailable");
    expect(animeParadise.resolveStream).not.toHaveBeenCalled();
  });
});
