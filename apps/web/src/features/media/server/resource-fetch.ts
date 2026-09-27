import "server-only";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import { MediaError } from "../types";
import { isPublicAddress, validateResourceUrl } from "./resource-security";

export interface ResourceBody { body: Buffer; status: number; headers: IncomingHttpHeaders; url: string }
/** DNS is validated on every redirect and pinned in the actual TLS connection. */
export async function fetchResource(value: string, signal: AbortSignal, options: { maxBytes?: number; range?: string; redirects?: number } = {}): Promise<ResourceBody> {
  signal.throwIfAborted();
  const url = validateResourceUrl(value);
  const addresses = await lookup(url.hostname, { all: true });
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw new MediaError("private_resource_address");
  const pinned = addresses[0];
  const maxBytes = options.maxBytes ?? 1_048_576;
  const result = await new Promise<ResourceBody>((resolve, reject) => {
    const req = request(url, {
      signal,
      family: pinned.family,
      headers: { Referer: "https://animeparadise.moe/", "Accept-Encoding": "identity", ...(options.range ? { Range: options.range } : {}) },
      lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
    }, (res) => {
      const status = res.statusCode ?? 502;
      if ([301, 302, 303, 307, 308].includes(status)) {
        res.destroy(); resolve({ body: Buffer.alloc(0), status, headers: res.headers, url: url.href }); return;
      }
      if (status !== 200 && status !== 206) { res.destroy(); reject(new MediaError("upstream_unavailable")); return; }
      if (Number(res.headers["content-length"] ?? 0) > maxBytes) { res.destroy(); reject(new MediaError("resource_too_large")); return; }
      const parts: Buffer[] = [];
      let size = 0;
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > maxBytes) { res.destroy(new MediaError("resource_too_large")); } else parts.push(chunk); });
      res.on("error", reject);
      res.on("end", () => resolve({ body: Buffer.concat(parts), status, headers: res.headers, url: url.href }));
    });
    const timer = setTimeout(() => req.destroy(new MediaError("resource_timeout")), 12_000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end();
  });
  if (result.status >= 300) {
    if ((options.redirects ?? 0) >= 3 || !result.headers.location) throw new MediaError("redirect_limit");
    return fetchResource(new URL(result.headers.location, url).href, signal, { ...options, redirects: (options.redirects ?? 0) + 1 });
  }
  return result;
}
