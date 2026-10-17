// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { type MediaResult } from "../types";
import { deliverResource, prepareDelivery, probeSubtitle, validateVideo } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { verifyResource } from "./resource-security";

const manifestUrl = "https://hls.dramahot.top/a/master.m3u8";
const subtitleUrl = "https://hls.dramahot.top/a/en.vtt";
const signal = new AbortController().signal;
function ticket(url: string) {
  return verifyResource(new URL(url, "https://sabame.test").searchParams.get("ticket")!);
}
function resource(body: string, url: string) {
  vi.mocked(fetchResource).mockResolvedValueOnce({ body: Buffer.from(body), url, status: 200, headers: {} });
}
function result(): MediaResult {
  return { provider: "hianime", video: { url: manifestUrl, type: "hls" }, metadata: { animeId: "mal-42310", episodeNumber: 1 }, thaiStatus: "absent_in_returned_tracks", selectionReason: "english_subtitle",
    subtitles: [{ language: "en", label: "English", url: subtitleUrl, format: "vtt", default: true, availability: "available", displaySupported: true, syncStatus: "unverified" }] };
}
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv("MEDIA_PROXY_SECRET", "test-secret-".repeat(5)); });
afterEach(() => vi.unstubAllEnvs());
describe("provider delivery policy", () => {
  it("uses the trusted provider for subtitle probes and video validation", async () => {
    resource("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello", subtitleUrl);
    expect(await probeSubtitle(subtitleUrl, signal, "hianime")).toBe("vtt");
    expect(fetchResource).toHaveBeenLastCalledWith(subtitleUrl, signal, { policy: "hianime" });
    resource("#EXTM3U\nhttps://hls1.drama1.cfd/one.ts", manifestUrl);
    await expect(validateVideo(manifestUrl, signal, "hianime")).resolves.toBeUndefined();
    expect(fetchResource).toHaveBeenLastCalledWith(manifestUrl, signal, { policy: "hianime", maxBytes: 1_048_576, range: "bytes=0-65535" });
    resource("#EXTM3U\nhttps://evil.test/one.ts", manifestUrl);
    await expect(validateVideo(manifestUrl, signal, "hianime")).rejects.toThrow("resource_host_not_allowed");
  });
  it("preserves fallback policy from selected result through signed proxy children and English VTT", async () => {
    const prepared = prepareDelivery(result());
    expect(ticket(prepared.video.url)).toMatchObject({ url: manifestUrl, policy: "hianime" });
    expect(ticket(prepared.subtitles[0].url)).toMatchObject({ url: subtitleUrl, kind: "subtitle", policy: "hianime" });
    resource("#EXTM3U\nhttps://hls1.drama1.cfd/one.ts", manifestUrl);
    const manifest = await deliverResource(new Request(new URL(prepared.video.url, "https://sabame.test")));
    const child = (await manifest.text()).split("\n")[1];
    expect(ticket(child)).toMatchObject({ url: "https://hls1.drama1.cfd/one.ts", kind: "segment", policy: "hianime" });
    expect(fetchResource).toHaveBeenLastCalledWith(manifestUrl, expect.any(AbortSignal), { policy: "hianime", maxBytes: 1_048_576 });
    resource("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nHello", subtitleUrl);
    const subtitle = await deliverResource(new Request(new URL(prepared.subtitles[0].url, "https://sabame.test")));
    expect(subtitle.headers.get("content-type")).toBe("text/vtt; charset=utf-8");
    expect(await subtitle.text()).toContain("Hello");
    expect(fetchResource).toHaveBeenLastCalledWith(subtitleUrl, expect.any(AbortSignal), { policy: "hianime", maxBytes: 1_048_576 });
  });
  it("keeps the default policy for AnimeParadise", async () => {
    const url = "https://stream.animeparadise.moe/en.vtt";
    resource("WEBVTT", url);
    await probeSubtitle(url, signal, "animeparadise");
    expect(fetchResource).toHaveBeenLastCalledWith(url, signal, { policy: "default" });
    const original = result();
    expect(ticket(prepareDelivery({ ...original, provider: "animeparadise", video: { url: "https://stream.animeparadise.moe/a.m3u8", type: "hls" }, subtitles: [] }).video.url)).toMatchObject({ policy: "default" });
  });
});
