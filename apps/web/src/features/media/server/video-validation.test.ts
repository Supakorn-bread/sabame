// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { validateVideo } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { MediaError } from "../types";
const base = "https://seiryuu.vid-cdn.xyz/00000000-0000-0000-0000-000000000001";
const source = `${base}/master.m3u8`;
const variant = `${base}/video/720/playlist.m3u8`;
const segment = `${base}/video/720/00000.ts`;
const signal = () => new AbortController().signal;
const resource = (url: string, body: string | Buffer) => ({ url, body: Buffer.from(body), status: 200, headers: {} });
const ts = () => { const body = Buffer.alloc(188 * 5); for (const offset of [0, 188, 376, 564, 752]) body[offset] = 0x47; return body; };
beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "synthetic-secret-".repeat(4)));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("validates a master, its first variant and actual media bytes", async () => {
  vi.mocked(fetchResource).mockResolvedValueOnce(resource(source, "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1280x720\nvideo/720/playlist.m3u8"))
    .mockResolvedValueOnce(resource(variant, "#EXTM3U\n#EXTINF:10,\n00000.ts"))
    .mockResolvedValueOnce(resource(segment, ts()));
  await expect(validateVideo(source, signal(), "anizone")).resolves.toBeUndefined();
  expect(vi.mocked(fetchResource).mock.calls.map(([url]) => url)).toEqual([source, variant, segment]);
});
it("rejects a reachable catalog manifest whose video segment is unavailable", async () => {
  vi.mocked(fetchResource).mockResolvedValueOnce(resource(variant, "#EXTM3U\n#EXTINF:10,\n00000.ts")).mockRejectedValueOnce(new MediaError("provider_unavailable"));
  await expect(validateVideo(variant, signal(), "anizone")).rejects.toThrow("provider_unavailable");
});
it.each(["#EXTM3U\n#EXT-X-ENDLIST", "<html>challenge</html>"])("rejects non-playable source body %s", async (body) => {
  vi.mocked(fetchResource).mockResolvedValue(resource(source, body));
  await expect(validateVideo(source, signal(), "anizone")).rejects.toThrow();
});
it("rejects a successful segment response containing HTML", async () => {
  vi.mocked(fetchResource).mockResolvedValueOnce(resource(variant, "#EXTM3U\n#EXTINF:10,\n00000.ts")).mockResolvedValueOnce(resource(segment, "<html>challenge</html>"));
  await expect(validateVideo(variant, signal(), "anizone")).rejects.toThrow("invalid_video");
});
it("validates the current AES key as well as encrypted segment bytes", async () => {
  const key = `${base}/keys/synthetic1.key`;
  vi.mocked(fetchResource).mockResolvedValueOnce(resource(variant, '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../../keys/synthetic1.key"\n#EXTINF:10,\n00000.ts'))
    .mockResolvedValueOnce(resource(segment, Buffer.alloc(1024, 7))).mockResolvedValueOnce(resource(key, Buffer.alloc(16, 8)));
  await expect(validateVideo(variant, signal(), "anizone")).resolves.toBeUndefined();
  expect(vi.mocked(fetchResource).mock.calls.map(([url]) => url)).toEqual([variant, segment, key]);
});
