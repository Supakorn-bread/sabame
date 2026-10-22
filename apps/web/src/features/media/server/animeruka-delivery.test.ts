// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { decodeAnimerukaManifest } from "./animeruka-manifest";
import { deliverResource, prepareDelivery, validateVideo } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { rewriteHls, signResource, validatePolicyResource, verifyResource } from "./resource-security";

const url = "https://cdn2.maimeorder.com/hls/SyntheticManifestToken000000==.txt";
const asset = "abcdef0123456789abcdef0123456789-1234";
const segment = `blob/${asset}/${asset}-001.webp`;
const manifest = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:11\n#EXTINF:11.0,\n${segment}\n#EXT-X-ENDLIST\n`;
const wrapper = (text = manifest) => Buffer.from(JSON.stringify({ p: Buffer.from(text).toString("base64") }));
beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "synthetic-secret-".repeat(4)));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

describe("AnimeRuka native HLS policy", () => {
  it("permits only reviewed CDN paths and kinds and keeps them outside the default policy", () => {
    expect(validatePolicyResource(url, "animeruka", "hls").href).toBe(url);
    const child = new URL(segment, url).href;
    expect(validatePolicyResource(child, "animeruka", "segment").href).toBe(child);
    for (const value of [url.replace("cdn2", "cdn3"), url + "?x=1", url + "#x", url.replace("/hls/", "/other/"), url.replace(".txt", ".m3u8")]) expect(() => validatePolicyResource(value, "animeruka", "hls")).toThrow();
    for (const kind of ["mp4", "subtitle", "segment", "key"] as const) expect(() => validatePolicyResource(url, "animeruka", kind)).toThrow();
    expect(() => validatePolicyResource(child.replace(`${asset}-001`, `${asset.replace("1234", "1235")}-001`), "animeruka", "segment")).toThrow();
    expect(() => validatePolicyResource(url, "default", "hls")).toThrow();
  });
  it("confines pinned control discovery to public same-provider routes", () => {
    for (const value of ["https://animeruka.com/?s=Synthetic+Season", "https://animeruka.com/anime/synthetic-season/", "https://animeruka.com/ep/synthetic-season-ep-1/", "https://animeruka.com/wp-json/dooplayer/v2/123/tv/1?v=1234abcd", "https://animemami.xyz/v/syntheticVideo01"]) expect(validatePolicyResource(value, "animeruka").href).toBe(value);
    for (const value of ["https://animeruka.com/wp-admin/admin-ajax.php", "https://animeruka.com/?s=X&s=Y", "https://animeruka.com/wp-json/dooplayer/v2/123/tv/1?v=1234abcd&extra=1", "https://animemami.xyz/error/no_video", "https://animemami.xyz/v/syntheticVideo01?x=1", "https://cdn2.maimeorder.com/"]) expect(() => validatePolicyResource(value, "animeruka")).toThrow();
    expect(() => signResource({ url: "https://animemami.xyz/v/syntheticVideo01", policy: "animeruka", kind: "hls", exp: Date.now() + 60_000 })).toThrow();
  });
  it("decodes only the public canonical base64 wrapper and rejects invalid data", () => {
    expect(decodeAnimerukaManifest(wrapper())).toBe(manifest);
    for (const body of [Buffer.from(manifest), Buffer.from('{"p":"***"}'), Buffer.from('{"p":"IyBFVlNM"}'), Buffer.from('{"p":"","extra":1}'), Buffer.from('<html>challenge</html>'), wrapper("<html>not HLS</html>"), Buffer.from(JSON.stringify({ p: Buffer.from(manifest).toString("base64").replace(/=+$/, "") }))]) expect(() => decodeAnimerukaManifest(body)).toThrow("invalid_manifest");
    expect(() => decodeAnimerukaManifest(Buffer.alloc(1_048_577))).toThrow("resource_too_large");
  });
  it("signs relative TS resources, preserves expiry and rejects encryption and external resources", () => {
    const parent = { url, kind: "hls" as const, policy: "animeruka" as const, exp: Date.now() + 60_000 };
    const rewritten = rewriteHls(manifest, parent);
    const child = rewritten.split("\n").find((line) => line.startsWith("/api/"))!;
    expect(verifyResource(new URL(child, "https://sabame.test").searchParams.get("ticket")!)).toEqual({ url: new URL(segment, url).href, kind: "segment", exp: parent.exp, policy: "animeruka" });
    expect(() => rewriteHls(manifest.replace(segment, "https://evil.test/video.ts"), parent)).toThrow();
    expect(() => rewriteHls(manifest.replace("#EXTINF", '#EXT-X-KEY:METHOD=AES-128,URI="key.key"\n#EXTINF'), parent)).toThrow("encrypted_media_unsupported");
  });
  it("validates and delivers the decoded manifest with signed no-store resources", async () => {
    vi.mocked(fetchResource).mockResolvedValue({ body: wrapper(), status: 200, headers: { "content-type": "application/json", "cache-control": "max-age=315360000" }, url });
    const bytes = Buffer.alloc(188 * 5); for (const offset of [0, 188, 376, 564, 752]) bytes[offset] = 0x47;
    vi.mocked(fetchResource).mockResolvedValueOnce({ body: wrapper(), status: 200, headers: {}, url }).mockResolvedValueOnce({ body: bytes, status: 206, headers: {}, url: new URL(segment, url).href });
    await validateVideo(url, new AbortController().signal, "animeruka");
    expect(fetchResource).toHaveBeenLastCalledWith(new URL(segment, url).href, expect.any(AbortSignal), { policy: "animeruka", kind: "segment", maxBytes: 33_554_432, range: "bytes=0-65535" });
    const prepared = prepareDelivery({ provider: "animeruka", video: { url, type: "hls" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false }, metadata: { animeId: "mal-123", episodeNumber: 1 }, thaiStatus: "present", selectionReason: "thai_subtitle" });
    const response = await deliverResource(new Request(new URL(prepared.video.url, "https://sabame.test")));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-type")).toBe("application/vnd.apple.mpegurl");
    const text = await response.text();
    expect(text).toContain("#EXTINF:11.0,");
    expect(text).toContain("/api/media/resource?ticket=");
    expect(text).not.toContain("maimeorder");
  });
  it("checks MPEG-TS bytes and serves them with their real MIME type", async () => {
    const body = Buffer.alloc(188 * 5); for (const offset of [0, 188, 376, 564, 752]) body[offset] = 0x47;
    const child = new URL(segment, url).href;
    vi.mocked(fetchResource).mockResolvedValue({ body, status: 200, headers: { "content-type": "image/webp" }, url: child });
    const signed = signResource({ url: child, kind: "segment", policy: "animeruka", exp: Date.now() + 60_000 });
    const response = await deliverResource(new Request(new URL(signed, "https://sabame.test")));
    expect(response.headers.get("content-type")).toBe("video/mp2t");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array(body));
    vi.mocked(fetchResource).mockResolvedValue({ body: Buffer.from("<html>not video</html>"), status: 200, headers: {}, url: child });
    await expect(deliverResource(new Request(new URL(signed, "https://sabame.test")))).rejects.toThrow("invalid_video");
  });
});
