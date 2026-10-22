// @vitest-environment node
import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isPublicAddress, rewriteHls, signResource, validateResourceUrl, verifyResource } from "./resource-security";
import { boundedRange } from "./delivery";

beforeEach(() => vi.stubEnv("MEDIA_PROXY_SECRET", "test-secret-".repeat(5)));
afterEach(() => vi.unstubAllEnvs());
const ticket = () => ({ url: "https://stream.animeparadise.moe/a/master.m3u8", kind: "hls" as const, policy: "default" as const, exp: Date.now() + 60_000 });
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
    expect(verifyResource(value(inline))).toEqual({ url: "https://stream.animeparadise.moe/a/sub.m3u8", kind: "hls", exp: parent.exp, policy: "default" });
    expect(verifyResource(value(output.split("\n")[3])).url).toBe("https://stream.animeparadise.moe/a/low/index.m3u8");
  });
  it("rejects unapproved HLS child hosts and encrypted streams", () => {
    expect(() => rewriteHls("#EXTM3U\nhttps://evil.test/segment.ts", ticket())).toThrow();
    expect(() => rewriteHls('#EXTM3U\n#EXT-X-KEY:METHOD=SAMPLE-AES,URI="key"', ticket())).toThrow("encrypted_media_unsupported");
  });
  it("preserves signed legacy AnimeParadise tickets under the default policy only", () => {
    const source = ticket();
    const legacy = { url: source.url, kind: source.kind, exp: source.exp };
    const encode = (body: typeof legacy) => {
      const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
      return `${payload}.${createHmac("sha256", process.env.MEDIA_PROXY_SECRET!).update(payload).digest("base64url")}`;
    };
    expect(verifyResource(encode(legacy))).toEqual(source);
    expect(() => verifyResource(encode({ ...legacy, url: "https://hls.dramahot.top/a" }))).toThrow("resource_host_not_allowed");
  });
  it("keeps the fallback policy on every signed HLS child", () => {
    const parent = { ...ticket(), url: "https://hls.dramahot.top/a/master.m3u8", policy: "hianime" as const };
    const output = rewriteHls('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="en.m3u8"\nhttps://hls1.drama1.cfd/one.ts', parent);
    const inline = /URI="([^"]+)"/.exec(output)![1];
    expect(verifyResource(value(inline))).toEqual({ ...parent, url: "https://hls.dramahot.top/a/en.m3u8" });
    expect(verifyResource(value(output.split("\n")[2]))).toEqual({ ...parent, kind: "segment", url: "https://hls1.drama1.cfd/one.ts" });
    expect(() => rewriteHls("#EXTM3U\nhttps://stream.animeparadise.moe/one.ts", parent)).toThrow("resource_host_not_allowed");
    expect(() => rewriteHls("#EXTM3U\nhttps://hls1.drama1.cfd.evil.test/one.ts", parent)).toThrow("resource_host_not_allowed");
    expect(() => rewriteHls('#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key"', parent)).toThrow("encrypted_media_unsupported");
  });
  it("rejects a changed or unknown signed delivery policy", () => {
    const signed = value(signResource(ticket()));
    const [payload, signature] = signed.split(".");
    const changed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString()), policy: "hianime" })).toString("base64url");
    expect(() => verifyResource(`${changed}.${signature}`)).toThrow("invalid_ticket");
    const unknown = Buffer.from(JSON.stringify({ ...ticket(), policy: "arbitrary" })).toString("base64url");
    const unknownSignature = createHmac("sha256", process.env.MEDIA_PROXY_SECRET!).update(unknown).digest("base64url");
    expect(() => verifyResource(`${unknown}.${unknownSignature}`)).toThrow("invalid_ticket");
    expect(() => signResource({ ...ticket(), url: "https://hls.dramahot.top/a" })).toThrow("resource_host_not_allowed");
  });
  it("caps MP4 ranges without downloading the whole video", () => {
    expect(boundedRange("bytes=100-99999999")).toBe("bytes=100-8388707");
    expect(boundedRange("bytes=100-")).toBe("bytes=100-8388707");
    expect(() => boundedRange("bytes=0-1,3-4")).toThrow("invalid_range");
  });
  it("confines Bilibili tickets to JSON subtitle assets and bounded signed offsets", () => {
    const source = { url: "https://s.bstarstatic.com/ogv/subtitle/a02ad1fc80c80166c21a2acd65d999278dd5e699.json?auth_key=current", kind: "subtitle" as const, policy: "bilibili" as const, subtitleOffsetMs: 1084, exp: Date.now() + 60_000 };
    expect(verifyResource(value(signResource(source)))).toEqual(source);
    for (const subtitleOffsetMs of [-60_000, -1700, 0, 2500, 60_000]) expect(verifyResource(value(signResource({ ...source, subtitleOffsetMs })))).toEqual({ ...source, subtitleOffsetMs });
    const signed = (body: object) => {
      const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
      return `${payload}.${createHmac("sha256", process.env.MEDIA_PROXY_SECRET!).update(payload).digest("base64url")}`;
    };
    for (const change of [{ kind: "hls" }, { kind: "mp4" }, { kind: "segment" }, { url: "https://s.bstarstatic.com/other/a.json" }, { url: "https://s.bstarstatic.com/ogv/subtitle/a02ad1fc80c80166c21a2acd65d999278dd5e699.ass" }, { url: "https://s.bstarstatic.com.evil.test/ogv/subtitle/a02ad1fc80c80166c21a2acd65d999278dd5e699.json" }, { subtitleOffsetMs: 60_001 }, { subtitleOffsetMs: -60_001 }, { subtitleOffsetMs: 1.5 }, { subtitleOffsetMs: undefined }]) {
      expect(() => signResource({ ...source, ...change } as typeof source)).toThrow();
      expect(() => verifyResource(signed({ ...source, ...change }))).toThrow();
    }
    expect(() => signResource({ ...source, policy: "default" })).toThrow("resource_host_not_allowed");
    expect(() => signResource({ ...ticket(), policy: "bilibili", subtitleOffsetMs: 1084 })).toThrow();
  });
});
