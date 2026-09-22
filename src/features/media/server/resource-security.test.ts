// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isPublicAddress, rewriteHls, signResource, validateResourceUrl, verifyResource } from "./resource-security";
import { boundedRange } from "./delivery";

beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "test-secret-".repeat(5)));
afterEach(() => vi.unstubAllEnvs());
const ticket = () => ({ url: "https://stream.animeparadise.moe/a/master.m3u8", kind: "hls" as const, exp: Date.now() + 60_000 });
function value(url: string) { return new URL(url, "https://sabame.test").searchParams.get("ticket")!; }
describe("signed media resources", () => {
  it("round trips and rejects tampering, malformed tickets and expiry", () => {
    const source = ticket(); const signed = value(signResource(source));
    expect(verifyResource(signed)).toEqual(source);
    expect(() => verifyResource(`${signed}x`)).toThrow("invalid_ticket");
    expect(() => verifyResource(signed, source.exp + 1)).toThrow("source_expired");
    expect(() => verifyResource("invalid")).toThrow("invalid_ticket");
  });
  it.each(["http://stream.animeparadise.moe/a", "https://evil.test/a", "https://stream.animeparadise.moe.evil.test/a", "https://user:pass@stream.animeparadise.moe/a", "https://127.0.0.1/a", "https://stream.animeparadise.moe:444/a"])("rejects unsafe URL %s", (url) => expect(() => validateResourceUrl(url)).toThrow());
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1", "2001:db8::1", "2002:7f00:1::"])("rejects private/special address %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it("accepts public IPv4 and IPv6", () => { expect(isPublicAddress("1.1.1.1")).toBe(true); expect(isPublicAddress("2606:4700:4700::1111")).toBe(true); });
  it("rewrites child playlists, segments and inline URIs with inherited expiry", () => {
    const parent = ticket();
    const output = rewriteHls('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="sub.m3u8"\n#EXT-X-STREAM-INF:BANDWIDTH=800000\nlow/index.m3u8\n', parent);
    const inline = /URI="([^"]+)"/.exec(output)![1];
    expect(verifyResource(value(inline))).toEqual({ url: "https://stream.animeparadise.moe/a/sub.m3u8", kind: "hls", exp: parent.exp });
    expect(verifyResource(value(output.split("\n")[3])).url).toBe("https://stream.animeparadise.moe/a/low/index.m3u8");
  });
  it("rejects unapproved HLS child hosts and encrypted streams", () => {
    expect(() => rewriteHls("#EXTM3U\nhttps://evil.test/segment.ts", ticket())).toThrow();
    expect(() => rewriteHls('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"', ticket())).toThrow("encrypted_media_unsupported");
  });
  it("caps MP4 ranges without downloading the whole video", () => {
    expect(boundedRange("bytes=100-99999999")).toBe("bytes=100-8388707");
    expect(boundedRange("bytes=100-")).toBe("bytes=100-8388707");
    expect(() => boundedRange("bytes=0-1,3-4")).toThrow("invalid_range");
  });
});
