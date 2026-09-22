// @vitest-environment node
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("node:https", () => ({ request: vi.fn() }));
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { fetchResource } from "./resource-fetch";

const url = "https://stream.animeparadise.moe/a";
beforeEach(() => { vi.resetAllMocks(); vi.mocked(lookup).mockResolvedValue([{ address: "1.1.1.1", family: 4 }] as never); });
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
