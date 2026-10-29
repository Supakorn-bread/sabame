// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn(async () => ({})) }));
vi.mock("./providers", () => ({ mediaProviders: [{ id: "animeparadise", resolve: vi.fn() }, { id: "hianime", resolve: vi.fn() }, { id: "anizone", resolve: vi.fn() }, { id: "anifume", resolve: vi.fn() }, { id: "animeruka", resolve: vi.fn() }] }));
vi.mock("./delivery", () => ({ prepareDelivery: (result: unknown) => result, probeSubtitle: vi.fn(async () => "vtt"), validateVideo: vi.fn(async () => {}) }));
vi.mock("./bilibili", () => ({ appendBilibiliThaiSubtitle: vi.fn(async (result: unknown) => result) }));
vi.mock("./subdl", () => ({ appendSubdlThaiSubtitle: vi.fn(async (result: unknown) => result) }));
import { POST } from "@/app/api/anime/[animeId]/media/route";
import { mediaProviders } from "./providers";
import { MediaError } from "../types";
import { appendBilibiliThaiSubtitle } from "./bilibili";
import { appendSubdlThaiSubtitle } from "./subdl";

beforeEach(() => {
  vi.stubEnv("RENDER", "");
  vi.stubEnv("RENDER_EXTERNAL_URL", "");
  for (const provider of mediaProviders) vi.mocked(provider.resolve).mockRejectedValue(new MediaError("no_source"));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

it.each(["https://sabame.onrender.com", "https://sabame.onrender.com/"])("accepts browser playback behind Render HTTPS termination with %s", async (externalUrl) => {
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_EXTERNAL_URL", externalUrl);
  vi.mocked(mediaProviders[0].resolve).mockResolvedValue({ video: { url: "https://example.com/source.mp4", type: "mp4" }, subtitles: [] });
  const response = await POST(new Request("http://localhost:10000/api/anime/mal-21/media", {
    method: "POST", headers: { Origin: "https://sabame.onrender.com" }, body: JSON.stringify({ episodeNumber: 1, provider: "animeparadise" }),
  }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "animeparadise" });
});

it.each(["https://evil.test", "null", "http://localhost:10000", "https://sabame.onrender.com.evil.test"])("rejects foreign Render origin %s despite forged forwarding headers", async (origin) => {
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://sabame.onrender.com");
  const response = await POST(new Request("http://localhost:10000/api/anime/mal-21/media", {
    method: "POST", headers: { Origin: origin, Host: "evil.test", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ episodeNumber: 1 }),
  }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  expect(mediaProviders.every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});

it.each(["not-a-url", "http://sabame.onrender.com", "https://user:password@sabame.onrender.com", "https://sabame.onrender.com/watch", "https://sabame.onrender.com?query=1", "https://sabame.onrender.com#fragment"])("rejects malformed Render external URL %s", async (externalUrl) => {
  vi.stubEnv("RENDER", "true");
  vi.stubEnv("RENDER_EXTERNAL_URL", externalUrl);
  const response = await POST(new Request("http://localhost:10000/api/anime/mal-21/media", {
    method: "POST", headers: { Origin: "https://sabame.onrender.com" }, body: JSON.stringify({ episodeNumber: 1 }),
  }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
  expect(mediaProviders.every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});

it.each(["", "false"])("uses the request origin outside Render (%s)", async (render) => {
  vi.stubEnv("RENDER", render);
  vi.stubEnv("RENDER_EXTERNAL_URL", "https://other.onrender.com");
  vi.mocked(mediaProviders[0].resolve).mockResolvedValue({ video: { url: "https://example.com/source.mp4", type: "mp4" }, subtitles: [] });
  const response = await POST(new Request("http://localhost:3000/api/anime/mal-21/media", {
    method: "POST", headers: { Origin: "http://localhost:3000" }, body: JSON.stringify({ episodeNumber: 1, provider: "animeparadise" }),
  }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(200);
});

it("rejects a foreign origin outside Render", async () => {
  const response = await POST(new Request("http://localhost:3000/api/anime/mal-21/media", {
    method: "POST", headers: { Origin: "https://evil.test", "X-Forwarded-Host": "evil.test", "X-Forwarded-Proto": "https" }, body: JSON.stringify({ episodeNumber: 1 }),
  }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(400);
  expect(mediaProviders.every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});

it("automatically prioritizes slower Thai playback over fast English", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(mediaProviders[0].resolve).mockResolvedValue({ video: { url: "https://example.com/master.m3u8", type: "hls" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }] });
  vi.mocked(mediaProviders[3].resolve).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ video: { url: "https://example.com/video.mp4", type: "mp4" }, embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } }), 8_000)));
  const pending = POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  await vi.advanceTimersByTimeAsync(8_001);
  const response = await pending;
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "anifume", selectionReason: "thai_subtitle", metadata: { animeId: "mal-21", episodeNumber: 1 } });
});

it("reserves time for Anizone when both earlier providers stall", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  const signals: AbortSignal[] = [];
  for (const provider of mediaProviders.slice(0, 2)) vi.mocked(provider.resolve).mockImplementation((_episode, signal) => { signals.push(signal); return new Promise(() => {}); });
  vi.mocked(mediaProviders[2].resolve).mockResolvedValue({ video: { url: "https://example.com/master.m3u8", type: "hls" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }] });
  const pending = POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  await vi.advanceTimersByTimeAsync(19_000);
  const response = await pending;
  expect(signals.map((signal) => signal.aborted)).toEqual([true, true]);
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "anizone", subtitles: [{ language: "en", default: true }] });
});

it("resolves an explicitly selected Anizone source without external subtitle augmentation", async () => {
  vi.mocked(mediaProviders[2].resolve).mockResolvedValue({ video: { url: "https://example.com/master.m3u8", type: "hls" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }, { language: "es", url: "https://example.com/es.vtt" }] });
  const response = await POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 2, provider: "anizone" }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(mediaProviders[0].resolve).not.toHaveBeenCalled();
  expect(mediaProviders[1].resolve).not.toHaveBeenCalled();
  expect(appendBilibiliThaiSubtitle).not.toHaveBeenCalled();
  expect(appendSubdlThaiSubtitle).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "anizone", subtitles: [{ language: "en", default: true }, { language: "es", default: false }], metadata: { episodeNumber: 2 } });
});

it("rejects an unknown requested provider", async () => {
  const response = await POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1, provider: "untrusted" }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "invalid_request" } });
});

it("resolves explicitly selected Anifume without overlaying external subtitles", async () => {
  vi.mocked(mediaProviders[3].resolve).mockResolvedValue({ video: { url: "https://example.com/video.mp4", type: "mp4" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } });
  const response = await POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 2, provider: "anifume" }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(mediaProviders.slice(0, 3).every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
  expect(appendBilibiliThaiSubtitle).not.toHaveBeenCalled();
  expect(appendSubdlThaiSubtitle).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "anifume", subtitles: [], embeddedSubtitles: { language: "th", removable: false }, thaiStatus: "present" });
});

it("automatically includes native Thai providers when earlier sources are absent", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(mediaProviders[3].resolve).mockResolvedValue({ video: { url: "https://example.com/video.mp4", type: "mp4" }, embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } });
  const response = await POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "anifume", selectionReason: "thai_subtitle" });
});

it("resolves the selected AnimeRuka origin without overlaying subtitles or including origin IDs in response metadata", async () => {
  vi.mocked(mediaProviders[4].resolve).mockResolvedValue({ video: { url: "https://example.com/video.m3u8", type: "hls" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } });
  const response = await POST(new Request("https://sabame.test/api/anime/mal-123/media", { method: "POST", body: JSON.stringify({ episodeNumber: 2, provider: "animeruka", serverId: "2" }) }), { params: Promise.resolve({ animeId: "mal-123" }) });
  expect(mediaProviders[4].resolve).toHaveBeenCalledWith({ animeId: "mal-123", episodeNumber: 2, serverId: "2" }, expect.any(AbortSignal));
  expect(mediaProviders.slice(0, 4).every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
  expect(appendBilibiliThaiSubtitle).not.toHaveBeenCalled();
  expect(appendSubdlThaiSubtitle).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect((await response.json()).metadata).toEqual({ animeId: "mal-123", episodeNumber: 2 });
});

it("preserves an explicitly unsupported AnimeRuka origin error without provider fallback", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(mediaProviders[4].resolve).mockRejectedValue(new MediaError("unsupported_server"));
  const response = await POST(new Request("https://sabame.test/api/anime/mal-123/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1, provider: "animeruka", serverId: "2" }) }), { params: Promise.resolve({ animeId: "mal-123" }) });
  expect(response.status).toBe(502);
  expect(await response.json()).toMatchObject({ error: { code: "unsupported_server" } });
  expect(mediaProviders.slice(0, 4).every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});

it("reports an exhausted resource timeout as a gateway timeout", async () => {
  vi.spyOn(console, "info").mockImplementation(() => {});
  for (const provider of mediaProviders) vi.mocked(provider.resolve).mockRejectedValue(new MediaError("resource_timeout"));
  const response = await POST(new Request("https://sabame.test/api/anime/mal-2890/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-2890" }) });
  expect(response.status).toBe(504);
  expect(await response.json()).toMatchObject({ error: { code: "resource_timeout" } });
});

it.each(["animeparadise", "hianime"])("accepts explicitly selected %s without fallback", async (id) => {
  const selected = mediaProviders.find((provider) => provider.id === id)!;
  vi.mocked(selected.resolve).mockResolvedValue({ video: { url: "https://example.com/source.mp4", type: "mp4" }, subtitles: [] });
  const response = await POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1, provider: id }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: id });
  expect(mediaProviders.filter((provider) => provider.id !== id).every((provider) => vi.mocked(provider.resolve).mock.calls.length === 0)).toBe(true);
});

it("makes an enriched Thai track the sole default ahead of returned English", async () => {
  vi.mocked(mediaProviders[0].resolve).mockResolvedValue({ video: { url: "https://example.com/source.mp4", type: "mp4" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }] });
  vi.mocked(appendBilibiliThaiSubtitle).mockImplementationOnce(async (result) => ({ ...result, thaiStatus: "present", subtitles: [...result.subtitles, { language: "th", label: "Thai (Bilibili)", url: "/api/media/resource?ticket=synthetic", format: "vtt", availability: "available", displaySupported: true, syncStatus: "unverified", default: false }] }));
  const response = await POST(new Request("https://sabame.test/api/anime/mal-123/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1, provider: "animeparadise" }) }), { params: Promise.resolve({ animeId: "mal-123" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ selectionReason: "thai_subtitle", subtitles: [{ language: "en", default: false }, { language: "th", default: true }] });
});
