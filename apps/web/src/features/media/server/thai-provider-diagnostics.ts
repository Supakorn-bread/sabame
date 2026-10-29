import "server-only";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import { isPublicAddress } from "@/features/media/server/resource-security";

// Temporary diagnostic for this test deployment only. Never accepts a target URL.
const targets = [
  { provider: "anifume", page: "search", url: "https://anifume.com/search/Tensei+shitara+Ken+deshita+Season+2" },
  { provider: "anifume", page: "detail", url: "https://anifume.com/41686" },
  { provider: "animeruka", page: "search", url: "https://animeruka.com/?s=Tensei+shitara+Ken+deshita+Season+2" },
  { provider: "animeruka", page: "detail", url: "https://animeruka.com/anime/tensei-shitara-ken-deshita-season-2/" },
  { provider: "anizone", page: "search", url: "https://anizone.to/anime?search=Futari+wa+Precure" },
  { provider: "anizone", page: "detail", url: "https://anizone.to/anime/qc8ez4ta" },
] as const;
type Target = typeof targets[number];
const maxBytes = 131_072;
const safeErrors = new Set(["ENOTFOUND", "EAI_AGAIN", "ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENETUNREACH", "EHOSTUNREACH", "CERT_HAS_EXPIRED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "ERR_TLS_CERT_ALTNAME_INVALID", "UND_ERR_CONNECT_TIMEOUT", "PRIVATE_ADDRESS"]);

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "network_error";
  if ("name" in error && (error.name === "TimeoutError" || error.name === "AbortError")) return "timeout";
  if ("code" in error && typeof error.code === "string" && safeErrors.has(error.code)) return error.code;
  return "cause" in error ? errorCode(error.cause) : "network_error";
}

function summarize(status: number, headers: Headers, body: string, bytes: number, truncated: boolean) {
  const cloudflare = /cloudflare/i.test(headers.get("server") ?? "");
  const challenge = headers.get("cf-mitigated") === "challenge" || /\/cdn-cgi\/challenge-platform|\bcf-chl-|<title>\s*Just a moment|verify you are human/i.test(body);
  const contentType = (headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  const location = headers.get("location");
  return {
    status,
    headers: {
      server: cloudflare ? "cloudflare" : headers.has("server") ? "other" : null,
      contentType: ["text/html", "application/json", "text/plain"].includes(contentType) ? contentType : "other",
      cloudflareChallenge: headers.get("cf-mitigated") === "challenge",
      redirectPresent: location !== null,
    },
    classification: challenge ? "challenge" : /access denied|sorry, you have been blocked/i.test(body) ? "access_denied" : /<html\b|<!doctype html/i.test(body) ? "html" : "other",
    markers: { heading: /<h1\b/i.test(body), links: /<a\b/i.test(body), thaiSubtitle: body.includes("ซับไทย") },
    inspectedBytes: bytes,
    truncated,
  };
}

async function fetchProviderPage(target: Target, signal: AbortSignal) {
  // Match each adapter's request headers. Manual mode exposes redirect status without following it.
  const response = await fetch(target.url, {
    signal,
    redirect: "manual",
    cache: "no-store",
    ...(target.provider === "anifume" ? { headers: { "User-Agent": "Mozilla/5.0" } } : {}),
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  try {
    if (reader) for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const remaining = maxBytes - size;
      chunks.push(value.subarray(0, remaining));
      size += Math.min(remaining, value.length);
      if (size >= maxBytes) { truncated = true; break; }
    }
  } finally { await reader?.cancel().catch(() => {}); reader?.releaseLock(); }
  return summarize(response.status, response.headers, Buffer.concat(chunks).toString("utf8"), size, truncated);
}

async function fetchAnimeruka(target: Target, signal: AbortSignal) {
  const url = new URL(target.url);
  let onAbort: () => void = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
  });
  const addresses = await Promise.race([lookup(url.hostname, { all: true }), aborted])
    .finally(() => signal.removeEventListener("abort", onAbort));
  signal.throwIfAborted();
  if (!addresses.length || addresses.some(({ address }) => !isPublicAddress(address))) throw Object.assign(new Error(), { code: "PRIVATE_ADDRESS" });
  const pinned = addresses[0];
  return new Promise<ReturnType<typeof summarize>>((resolve, reject) => {
    // Same Node HTTPS transport, DNS pinning and headers as resource-fetch.ts.
    const req = httpsRequest(url, {
      signal,
      family: pinned.family,
      lookup: (_host, options, callback) => options.all ? callback(null, [pinned]) : callback(null, pinned.address, pinned.family),
      headers: { Referer: "https://animemami.xyz/", "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache", "Accept-Encoding": "identity" },
    }, (response) => {
      const headers = new Headers();
      for (const name of ["server", "content-type", "cf-mitigated", "location"]) {
        const value = response.headers[name];
        if (typeof value === "string") headers.set(name, value);
      }
      const chunks: Buffer[] = [];
      let size = 0;
      const finish = (truncated: boolean) => resolve(summarize(response.statusCode ?? 502, headers, Buffer.concat(chunks).toString("utf8"), size, truncated));
      response.on("data", (chunk: Buffer) => {
        const remaining = maxBytes - size;
        chunks.push(chunk.subarray(0, remaining));
        size += Math.min(remaining, chunk.length);
        if (size >= maxBytes) { finish(true); response.destroy(); }
      });
      response.on("end", () => finish(false));
      response.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

let started = false;
export async function diagnoseThaiProviders() {
  if (started) return;
  started = true;
  const results = await Promise.all(targets.map(async (target) => {
    const start = Date.now();
    try {
      const signal = AbortSignal.timeout(8_000);
      const result = await (target.provider === "animeruka" ? fetchAnimeruka(target, signal) : fetchProviderPage(target, signal));
      return { provider: target.provider, page: target.page, ...result, elapsedMs: Date.now() - start };
    } catch (error) {
      return { provider: target.provider, page: target.page, error: errorCode(error), elapsedMs: Date.now() - start };
    }
  }));
  const result = { checkedAt: new Date().toISOString(), results };
  console.info(JSON.stringify({ event: "thai_provider_diagnostic", ...result }));
}
