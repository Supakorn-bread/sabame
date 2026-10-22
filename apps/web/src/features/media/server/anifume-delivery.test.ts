// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { deliverResource, prepareDelivery, validateVideo } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { resourceReferer, signResource, validatePolicyResource, verifyResource } from "./resource-security";
const url = "https://a16.rukoluo.com/f/Synthetic/Synthetic-01-q360.mp4?m=syntheticToken000&e=1900000000";
beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "synthetic-secret-".repeat(4)));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("confines Anifume to verified CDN hosts, MP4 paths and observed token query keys", () => {
  for (const host of ["a15.rukoluo.com", "a16.rukoluo.com", "a17.rukoluo.com"]) expect(validatePolicyResource(url.replace("a16.rukoluo.com", host), "anifume", "mp4").hostname).toBe(host);
  for (const value of [url.replace("a16", "a18"), url.replace("/f/", "/other/"), url + "&extra=1", url + "&m=duplicate", url.replace(".mp4?", ".m3u8?"), url + "#fragment"]) expect(() => validatePolicyResource(value, "anifume", "mp4")).toThrow();
  expect(() => validatePolicyResource(url, "default", "mp4")).toThrow();
  expect(() => validatePolicyResource(url, "anifume", "subtitle")).toThrow();
  expect(resourceReferer("anifume")).toBe("https://anifume.com/");
});
it("keeps embedded subtitle metadata while signing an MP4-only delivery ticket", () => {
  const embeddedSubtitles = { language: "th" as const, label: "Thai (embedded)", removable: false as const };
  const result = prepareDelivery({ provider: "anifume", video: { url, type: "mp4" }, subtitles: [], embeddedSubtitles, metadata: { animeId: "mal-123", episodeNumber: 1 }, thaiStatus: "present", selectionReason: "thai_subtitle" });
  expect(result.embeddedSubtitles).toEqual(embeddedSubtitles);
  expect(result.subtitles).toEqual([]);
  expect(verifyResource(new URL(result.video.url, "https://sabame.test").searchParams.get("ticket")!)).toMatchObject({ url, kind: "mp4", policy: "anifume" });
});
it("validates an in-memory MP4 header and serves bounded ranges without upstream cache headers", async () => {
  const body = Buffer.from([0, 0, 0, 24, 102, 116, 121, 112]);
  vi.mocked(fetchResource).mockResolvedValue({ body, status: 206, headers: { "content-range": "bytes 100-107/1000", "cache-control": "max-age=315360000" }, url });
  await validateVideo(url, new AbortController().signal, "anifume");
  expect(fetchResource).toHaveBeenLastCalledWith(url, expect.any(AbortSignal), { policy: "anifume", kind: "mp4", maxBytes: 1_048_576, range: "bytes=0-65535" });
  const signed = signResource({ url, policy: "anifume", kind: "mp4", exp: Date.now() + 60_000 });
  const response = await deliverResource(new Request(new URL(signed, "https://sabame.test"), { headers: { Range: "bytes=100-" } }));
  expect(fetchResource).toHaveBeenLastCalledWith(url, expect.any(AbortSignal), { policy: "anifume", kind: "mp4", maxBytes: 8_388_608, range: "bytes=100-8388707" });
  expect(response.status).toBe(206);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("content-type")).toBe("video/mp4");
  expect(response.headers.get("content-range")).toBe("bytes 100-107/1000");
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(body));
});
