// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn(async () => ({})) }));
vi.mock("./providers", () => ({ mediaProviders: ["animeparadise", "hianime", "anizone", "anifume", "animeruka"].map((id) => ({ id, resolve: vi.fn() })) }));
vi.mock("./delivery", () => ({ probeSubtitle: vi.fn(async () => "vtt"), validateVideo: vi.fn(async () => {}) }));
import { GET } from "@/app/api/anime/[animeId]/media/providers/route";
import { mediaProviders } from "./providers";
import { validateVideo } from "./delivery";
import { discoverMediaProviders } from "./provider-discovery";
import { readMediaRequest } from "./api";
import { MediaError } from "../types";

const context = { params: Promise.resolve({ animeId: "mal-123" }) };
const request = (query = "episodeNumber=2") => new Request(`https://sabame.test/api/anime/mal-123/media/providers?${query}`);
beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  for (const provider of mediaProviders) vi.mocked(provider.resolve).mockRejectedValue(new MediaError("no_source"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it("reports only natively validated episode sources as available and recommends Thai", async () => {
  vi.mocked(mediaProviders[0].resolve).mockResolvedValue({ video: { url: "https://example.com/dead.mp4", type: "mp4" } });
  vi.mocked(mediaProviders[1].resolve).mockResolvedValue({ video: { url: "https://example.com/english.m3u8", type: "hls" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }] });
  vi.mocked(mediaProviders[3].resolve).mockResolvedValue({ video: { url: "https://example.com/thai.mp4", type: "mp4", quality: "720p" }, embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false }, qualities: [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }], selectedQualityId: "720p" });
  vi.mocked(validateVideo).mockRejectedValueOnce(new MediaError("invalid_video"));
  const response = await GET(request(), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ metadata: { animeId: "mal-123", episodeNumber: 2 }, defaultProviderId: "anifume", providers: [
    { id: "animeparadise", label: "AnimeParadise", status: "unavailable", code: "invalid_video" },
    { id: "hianime", label: "HiAnime", status: "available", subtitleLanguage: "en" },
    { id: "anizone", label: "Anizone", status: "unavailable", code: "no_source" },
    { id: "anifume", label: "Anifume (Thai)", status: "available", subtitleLanguage: "th", qualities: [{ id: "360p", label: "360p" }, { id: "720p", label: "720p" }], selectedQualityId: "720p" },
    { id: "animeruka", label: "AnimeRuka", status: "unavailable", code: "no_source" },
  ] });
});
it("bounds concurrent stalled providers to one timeout window and distinguishes absence", async () => {
  vi.useFakeTimers();
  const signals: AbortSignal[] = [];
  for (const provider of mediaProviders.slice(0, 4)) vi.mocked(provider.resolve).mockImplementation(async (_episode, signal) => { signals.push(signal); return new Promise(() => {}); });
  const pending = GET(request(), context);
  await vi.advanceTimersByTimeAsync(12_001);
  const response = await pending;
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ metadata: { animeId: "mal-123", episodeNumber: 2 }, providers: [
    { id: "animeparadise", label: "AnimeParadise", status: "timeout", code: "timeout" },
    { id: "hianime", label: "HiAnime", status: "timeout", code: "timeout" },
    { id: "anizone", label: "Anizone", status: "timeout", code: "timeout" },
    { id: "anifume", label: "Anifume (Thai)", status: "timeout", code: "timeout" },
    { id: "animeruka", label: "AnimeRuka", status: "unavailable", code: "no_source" },
  ] });
  expect(signals.map((signal) => signal.aborted)).toEqual([true, true, true, true]);
});
it.each(["", "episodeNumber=0", "episodeNumber=1&episodeNumber=2", "episodeNumber=1&provider=anifume", "episodeNumber=1.5", "episodeNumber=10000"])("rejects ambiguous or unsupported discovery query %s", async (query) => {
  expect((await GET(request(query), context)).status).toBe(400);
  expect(mediaProviders.every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});
it("accepts bounded source quality IDs only for explicit Anifume requests", async () => {
  const body = (payload: unknown) => new Request("https://sabame.test/media", { method: "POST", body: JSON.stringify(payload) });
  expect(await readMediaRequest(body({ episodeNumber: 2, provider: "anifume", qualityId: "1080p" }))).toEqual({ episodeNumber: 2, provider: "anifume", qualityId: "1080p" });
  for (const payload of [{ episodeNumber: 2, qualityId: "720p" }, { episodeNumber: 2, provider: "animeruka", qualityId: "720p" }, { episodeNumber: 2, provider: "anifume", qualityId: "https://evil.test/video.mp4" }, { episodeNumber: 2, provider: "anifume", qualityId: 720 }]) await expect(readMediaRequest(body(payload))).rejects.toThrow("invalid_request");
});

it("keeps a provider available when a current native backup succeeds and reports the selected origin", async () => {
  const result = await discoverMediaProviders({ animeId: "mal-123", episodeNumber: 2 }, [{ id: "animeruka", resolve: async () => { throw new MediaError("unsupported_server"); }, async *resolveAlternatives() { yield { selectedServerId: "3", video: { url: "https://example.com/private-origin.m3u8", type: "hls" }, embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } }; } }], { signal: new AbortController().signal, validateVideo: async () => {}, probeSubtitle: async () => "vtt" });
  expect(result).toEqual({ metadata: { animeId: "mal-123", episodeNumber: 2 }, providers: [{ id: "animeruka", label: "AnimeRuka", status: "available", subtitleLanguage: "th", selectedServerId: "3" }], defaultProviderId: "animeruka" });
  expect(JSON.stringify(result)).not.toContain("private-origin");
});
