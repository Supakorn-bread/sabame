// @vitest-environment node
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { fetchResource } from "./resource-fetch";

const url = "https://stream.animeparadise.moe/a";
beforeEach(() => { vi.resetAllMocks(); vi.mocked(lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }] as never); });
afterEach(() => { vi.useRealTimers(); });
function hang() {
  vi.mocked(request).mockImplementationOnce(((_url: unknown, options: { signal: AbortSignal }) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error?: Error) => void };
    req.destroy = (error) => { if (error) req.emit("error", error); req.emit("close"); };
    req.end = () => { options.signal.addEventListener("abort", () => req.destroy(options.signal.reason), { once: true }); };
    return req;
  }) as never);
}
function respond(body: string, status = 200, headers: Record<string, string> = {}) {
  vi.mocked(request).mockImplementationOnce(((_url: unknown, options: { lookup: (...args: unknown[]) => void }, callback: (response: unknown) => void) => {
    const req = new EventEmitter() as EventEmitter & { end: () => void; destroy: (error?: Error) => void };
    req.destroy = (error) => { if (error) req.emit("error", error); req.emit("close"); };
    req.end = () => queueMicrotask(() => {
      options.lookup("stream.animeparadise.moe", {}, (_error: unknown, address: string) => expect(address).toBe("1.1.1.1"));
      const res = Object.assign(Readable.from([Buffer.from(body)]), { statusCode: status, headers });
      res.on("close", () => req.emit("close"));
      callback(res);
    });
    return req;
  }) as never);
}
describe("bounded resource transport", () => {
  it("retries a timed out resource once after validating DNS again", async () => {
    vi.useFakeTimers();
    hang();
    respond("WEBVTT");
    const pending = fetchResource(url, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(12_000);
    expect((await pending).body.toString()).toBe("WEBVTT");
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("stops after the second resource timeout", async () => {
    vi.useFakeTimers();
    hang();
    hang();
    const pending = expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("resource_timeout");
    await vi.advanceTimersByTimeAsync(24_000);
    await pending;
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("does not retry after caller cancellation", async () => {
    vi.useFakeTimers();
    hang();
    const controller = new AbortController();
    const pending = expect(fetchResource(url, controller.signal)).rejects.toThrow("cancelled by caller");
    await vi.advanceTimersByTimeAsync(1);
    controller.abort(new Error("cancelled by caller"));
    await pending;
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects private DNS on the retry before opening another connection", async () => {
    vi.useFakeTimers();
    hang();
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never).mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }] as never);
    const pending = expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("private_resource_address");
    await vi.advanceTimersByTimeAsync(12_000);
    await pending;
    expect(lookup).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledOnce();
  });
  it("does not retry rejected HTTP responses", async () => {
    respond("unavailable", 503);
    await expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("upstream_unavailable");
    expect(request).toHaveBeenCalledOnce();
  });
  it("pins the TLS lookup to the validated address", async () => {
    respond("WEBVTT");
    expect((await fetchResource(url, new AbortController().signal)).body.toString()).toBe("WEBVTT");
    expect(lookup).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects private DNS before opening a connection", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "127.0.0.1", family: 4 }] as never);
    await expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("private_resource_address");
    expect(request).not.toHaveBeenCalled();
  });
  it("revalidates DNS after redirects and rejects rebinding", async () => {
    respond("", 302, { location: "/other" });
    vi.mocked(lookup).mockResolvedValueOnce([{ address: "1.1.1.1", family: 4 }] as never).mockResolvedValueOnce([{ address: "10.0.0.1", family: 4 }] as never);
    await expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("private_resource_address");
    expect(request).toHaveBeenCalledOnce();
  });
  it("rejects redirects outside the host policy", async () => {
    respond("", 302, { location: "https://evil.test/a" });
    await expect(fetchResource(url, new AbortController().signal)).rejects.toThrow("resource_host_not_allowed");
  });
  it("uses the fixed fallback referer on every allowed redirect", async () => {
    respond("", 302, { location: "https://hls1.drama1.cfd/one.ts" });
    respond("segment");
    expect((await fetchResource("https://hls.dramahot.top/master.m3u8", new AbortController().signal, { policy: "hianime" })).body.toString()).toBe("segment");
    expect(lookup).toHaveBeenNthCalledWith(1, "hls.dramahot.top", { all: true });
    expect(lookup).toHaveBeenNthCalledWith(2, "hls1.drama1.cfd", { all: true });
    for (const [, options] of vi.mocked(request).mock.calls) {
      expect(options).toMatchObject({ headers: { Referer: "https://zokoanime.video/", "Accept-Encoding": "identity" } });
    }
  });
  it.each(["https://stream.animeparadise.moe/a", "https://evil.test/a", "https://hls1.drama1.cfd.evil.test/a"])("rejects fallback redirects outside its exact hosts %s", async (location) => {
    respond("", 302, { location });
    await expect(fetchResource("https://hls.dramahot.top/master.m3u8", new AbortController().signal, { policy: "hianime" })).rejects.toThrow("resource_host_not_allowed");
    expect(request).toHaveBeenCalledOnce();
  });
  it("keeps DNS checks for fallback hosts", async () => {
    vi.mocked(lookup).mockResolvedValue([{ address: "10.0.0.1", family: 4 }] as never);
    await expect(fetchResource("https://hls.dramahot.top/master.m3u8", new AbortController().signal, { policy: "hianime" })).rejects.toThrow("private_resource_address");
    expect(request).not.toHaveBeenCalled();
  });
  it("enforces body limits even without content-length", async () => {
    respond("too large");
    await expect(fetchResource(url, new AbortController().signal, { maxBytes: 3 })).rejects.toThrow("resource_too_large");
  });
  it("rejects pre-cancelled requests", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(fetchResource(url, controller.signal)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });
});
