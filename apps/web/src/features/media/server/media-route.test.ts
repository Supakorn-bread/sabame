// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./catalog", () => ({ fetchMetadata: vi.fn(async () => ({})) }));
vi.mock("./providers", () => ({ mediaProviders: [{ id: "animeparadise", resolve: vi.fn() }, { id: "hianime", resolve: vi.fn() }] }));
vi.mock("./delivery", () => ({ prepareDelivery: (result: unknown) => result, probeSubtitle: vi.fn(async () => "vtt"), validateVideo: vi.fn(async () => {}) }));
import { POST } from "@/app/api/anime/[animeId]/media/route";
import { mediaProviders } from "./providers";

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.clearAllMocks(); });

it("allows the primary provider to exceed 12 seconds with a registered fallback", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(mediaProviders[0].resolve).mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve({ video: { url: "https://example.com/master.m3u8", type: "hls" }, subtitles: [{ language: "en", url: "https://example.com/en.vtt" }] }), 13_000)));
  const pending = POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  await vi.advanceTimersByTimeAsync(13_001);
  const response = await pending;
  expect(mediaProviders[1].resolve).not.toHaveBeenCalled();
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ provider: "animeparadise", selectionReason: "english_subtitle", metadata: { animeId: "mal-21", episodeNumber: 1 } });
});

it("gives fallback only the remaining overall budget after a slow primary failure", async () => {
  vi.useFakeTimers();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.mocked(mediaProviders[0].resolve).mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(new Error("upstream")), 20_000)));
  let fallbackSignal: AbortSignal | undefined;
  vi.mocked(mediaProviders[1].resolve).mockImplementation((_episode, signal) => { fallbackSignal = signal; return new Promise(() => {}); });
  const pending = POST(new Request("https://sabame.test/api/anime/mal-21/media", { method: "POST", body: JSON.stringify({ episodeNumber: 1 }) }), { params: Promise.resolve({ animeId: "mal-21" }) });
  await vi.advanceTimersByTimeAsync(20_001);
  expect(mediaProviders[1].resolve).toHaveBeenCalledOnce();
  expect(fallbackSignal?.aborted).toBe(false);
  await vi.advanceTimersByTimeAsync(9_000);
  const response = await pending;
  expect(response.status).toBe(504);
  expect(fallbackSignal?.aborted).toBe(true);
  expect(await response.json()).toMatchObject({ error: { code: "timeout" } });
});
