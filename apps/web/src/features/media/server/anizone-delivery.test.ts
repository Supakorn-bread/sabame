// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./resource-fetch", () => ({ fetchResource: vi.fn() }));
import { deliverResource, prepareDelivery, probeSubtitle } from "./delivery";
import { fetchResource } from "./resource-fetch";
import { rewriteHls, signResource, validatePolicyResource, verifyResource } from "./resource-security";
const base = "https://seiryuu.vid-cdn.xyz/00000000-0000-0000-0000-000000000001";
const source = () => ({ url: `${base}/video/480/playlist.m3u8`, kind: "hls" as const, policy: "anizone" as const, exp: Date.now() + 60_000 });
function ticket(signed: string) { return verifyResource(new URL(signed, "https://sabame.test").searchParams.get("ticket")!); }
const resource = (body: string | Buffer) => ({ body: Buffer.from(body), status: 200, headers: {}, url: `${base}/subtitles/0_en.ass` });
beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "synthetic-secret-".repeat(4)));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("Anizone delivery policy", () => {
  it("rewrites master variants and audio playlists with the correct resource kind", () => {
    const master = { ...source(), url: `${base}/master.m3u8` };
    const output = rewriteHls('#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="audio/0_ja/playlist.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=100\nvideo/480/playlist.m3u8', master);
    expect(ticket(/URI="([^"]+)"/.exec(output)![1])).toEqual({ ...master, url: `${base}/audio/0_ja/playlist.m3u8` });
    expect(ticket(output.split("\n")[3])).toEqual({ ...master, url: `${base}/video/480/playlist.m3u8` });
  });
  it("signs only standard identity AES-128 keys while preserving IV and expiry", () => {
    const parent = source();
    const output = rewriteHls('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="../../keys/synthetic1.key",IV=0x01,KEYFORMAT="identity"\n00000.ts', parent);
    expect(ticket(/URI="([^"]+)"/.exec(output)![1])).toEqual({ ...parent, url: `${base}/keys/synthetic1.key`, kind: "key" });
    expect(output).toContain('IV=0x01,KEYFORMAT="identity"');
    expect(ticket(output.split("\n")[2])).toEqual({ ...parent, url: `${base}/video/480/00000.ts`, kind: "segment" });
  });
  it.each([
    '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="../../keys/synthetic1.key"',
    '#EXT-X-KEY:METHOD=AES-256,URI="../../keys/synthetic1.key"',
    '#EXT-X-KEY:METHOD=AES-128,URI="../../keys/synthetic1.key",KEYFORMAT="com.apple.streamingkeydelivery"',
    '#EXT-X-SESSION-KEY:METHOD=AES-128,URI="../../keys/synthetic1.key"',
    '#EXT-X-KEY:METHOD=AES-128,METHOD=NONE,URI="../../keys/synthetic1.key"',
    '#EXT-X-KEY:METHOD=AES-128',
    '#EXT-X-KEY:METHOD=AES-128,URI="../../keys/synthetic1.key",IV=nothex',
    '#EXT-X-KEY:METHOD=AES-128,URI="skd://license/key"',
    '#EXT-X-KEY:METHOD=AES-128,URI="https://evil.test/key"',
    '#EXT-X-KEY:METHOD=AES-128,URI="../../subtitles/0_en.ass"',
  ])("rejects unsupported or malformed key metadata %s", (line) => expect(() => rewriteHls(`#EXTM3U\n${line}`, source())).toThrow());
  it("rejects cross-asset resources and confines each kind to its observed path", () => {
    for (const [path, kind] of [["keys/synthetic1.key?token=a", "key"], ["keys/synthetic1.key", "segment"], ["master.m3u8", "key"], ["subtitles/0_en.ass", "hls"], ["video/480/00000.ts", "subtitle"]] as const) expect(() => validatePolicyResource(`${base}/${path}`, "anizone", kind)).toThrow();
    expect(() => rewriteHls(`#EXTM3U\n${base.replace(/1$/, "2")}/video/480/00000.ts`, source())).toThrow("invalid_resource");
    expect(() => signResource({ ...source(), policy: "default", kind: "key" })).toThrow();
    expect(() => validatePolicyResource(`${base}/master.m3u8`, "default", "hls")).toThrow();
  });
  it("delivers an exact 16-byte key with no-store and propagates key restrictions to the fetcher", async () => {
    vi.mocked(fetchResource).mockResolvedValue(resource(Buffer.alloc(16, 7)));
    const response = await deliverResource(new Request(new URL(signResource({ ...source(), kind: "key", url: `${base}/keys/synthetic1.key` }), "https://sabame.test")));
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual(Array(16).fill(7));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(fetchResource).toHaveBeenCalledWith(`${base}/keys/synthetic1.key`, expect.any(AbortSignal), { policy: "anizone", kind: "key", maxBytes: 16 });
  });
  it.each([0, 15, 17])("rejects a key body with %i bytes", async (length) => {
    vi.mocked(fetchResource).mockResolvedValue(resource(Buffer.alloc(length)));
    await expect(deliverResource(new Request(new URL(signResource({ ...source(), kind: "key", url: `${base}/keys/synthetic1.key` }), "https://sabame.test")))).rejects.toThrow("invalid_resource");
  });
  it("advertises converted ASS as VTT only after successful validation and serves identical conversion", async () => {
    vi.mocked(fetchResource).mockResolvedValue(resource("[Script Info]\n[Events]\nFormat: Start, End, Text\nDialogue: 0:00:01.00,0:00:02.00,Synthetic <text>"));
    expect(await probeSubtitle(`${base}/subtitles/0_en.ass`, new AbortController().signal, "anizone")).toBe("vtt");
    expect(await probeSubtitle("https://stream.animeparadise.moe/sub.ass", new AbortController().signal, "animeparadise")).toBe("ass");
    const response = await deliverResource(new Request(new URL(signResource({ ...source(), kind: "subtitle", url: `${base}/subtitles/0_en.ass` }), "https://sabame.test")));
    expect(await response.text()).toBe("WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSynthetic &lt;text&gt;\n");
    expect(response.headers.get("content-type")).toBe("text/vtt; charset=utf-8");
    vi.mocked(fetchResource).mockResolvedValue(resource("[Script Info]\n[Events]"));
    await expect(probeSubtitle(`${base}/subtitles/0_en.ass`, new AbortController().signal, "anizone")).rejects.toThrow("invalid_subtitle");
  });
  it("preserves Anizone policy on prepared video and subtitle tickets", () => {
    const prepared = prepareDelivery({ provider: "anizone", video: { url: `${base}/master.m3u8`, type: "hls" }, subtitles: [{ url: `${base}/subtitles/0_en.ass`, language: "en", label: "English", format: "vtt", default: true, displaySupported: true, availability: "available", syncStatus: "unverified" }], metadata: { animeId: "mal-1", episodeNumber: 1 }, thaiStatus: "absent_in_returned_tracks", selectionReason: "english_subtitle" });
    expect(ticket(prepared.video.url).policy).toBe("anizone");
    expect(ticket(prepared.subtitles[0].url).policy).toBe("anizone");
  });
});
