// @vitest-environment node
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));

beforeEach(() => {
  vi.resetModules();
  vi.mocked(lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }] as never);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.stubGlobal("fetch", vi.fn(async () => new Response("<html><h1>ซับไทย</h1></html>", { headers: { "content-type": "text/html", "set-cookie": "secret-cookie" } })));
  vi.mocked(request).mockImplementation(((url: URL, options: unknown, callback: (response: Readable) => void) => {
    const req = new EventEmitter();
    return Object.assign(req, { end() {
      const response = Object.assign(Readable.from([Buffer.from("<html><title>Just a moment...</title></html>")]), {
        statusCode: 403,
        headers: { server: "cloudflare", "content-type": "text/html", "cf-mitigated": "challenge", "set-cookie": "secret-cookie", location: "https://secret.test/token" },
      });
      callback(response);
    } });
  }) as typeof request);
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks(); });

describe("fixed Thai provider diagnostic", () => {
  it("uses the provider transports once and logs classifications without upstream text, cookies or redirect URLs", async () => {
    const { diagnoseThaiProviders } = await import("./thai-provider-diagnostics");
    await diagnoseThaiProviders();
    await diagnoseThaiProviders();
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(request).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledWith("https://anifume.com/41686", expect.objectContaining({ redirect: "manual", cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } }));
    const anizoneCalls = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith("https://anizone.to/"));
    expect(anizoneCalls.map(([url]) => String(url))).toEqual([
      "https://anizone.to/anime?search=Futari+wa+Precure",
      "https://anizone.to/anime/qc8ez4ta",
    ]);
    for (const [, options] of anizoneCalls) expect(options).toEqual({ signal: expect.any(AbortSignal), redirect: "manual", cache: "no-store" });
    expect(request).toHaveBeenCalledWith(expect.objectContaining({ hostname: "animeruka.com" }), expect.objectContaining({ headers: { Referer: "https://animemami.xyz/", "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache", "Accept-Encoding": "identity" }, lookup: expect.any(Function) }), expect.any(Function));
    const logged = vi.mocked(console.info).mock.calls[0][0] as string;
    expect(logged).not.toMatch(/secret|Just a moment|ซับไทย|https:/);
    expect(JSON.parse(logged).results).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "animeruka", status: 403, classification: "challenge", headers: expect.objectContaining({ server: "cloudflare", cloudflareChallenge: true, redirectPresent: true }) }),
      expect.objectContaining({ provider: "anifume", status: 200, classification: "html" }),
      expect.objectContaining({ provider: "anizone", page: "search", status: 200, classification: "html" }),
      expect.objectContaining({ provider: "anizone", page: "detail", status: 200, classification: "html" }),
    ]));
  });
  it("bounds inspected body bytes and excludes raw network errors", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("x".repeat(200_000))).mockRejectedValueOnce(new Error("secret-token-url", { cause: Object.assign(new Error("secret-token"), { code: "ENOTFOUND" }) }));
    const { diagnoseThaiProviders } = await import("./thai-provider-diagnostics");
    await diagnoseThaiProviders();
    const logged = vi.mocked(console.info).mock.calls[0][0] as string;
    expect(logged).not.toContain("secret");
    expect(JSON.parse(logged).results).toEqual(expect.arrayContaining([
      expect.objectContaining({ inspectedBytes: 131_072, truncated: true }),
      expect.objectContaining({ error: "ENOTFOUND" }),
    ]));
  });
  it("rejects private DNS addresses before opening a connection", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    const { diagnoseThaiProviders } = await import("./thai-provider-diagnostics");
    await diagnoseThaiProviders();
    expect(request).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"error":"PRIVATE_ADDRESS"'));
  });
});
