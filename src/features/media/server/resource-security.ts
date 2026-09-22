import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { MediaError } from "../types";

export type ResourceKind = "hls" | "mp4" | "subtitle" | "segment";
export interface ResourceTicket { url: string; kind: ResourceKind; exp: number }
export function allowedHosts() {
  return new Set(["stream.animeparadise.moe", "api.animeparadise.moe",
    ...(process.env.MEDIA_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)]);
}
export function validateResourceUrl(value: string, hosts = allowedHosts()): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new MediaError("invalid_resource"); }
  if (url.protocol !== "https:" || url.port && url.port !== "443" || url.username || url.password || !hosts.has(url.hostname) || isIP(url.hostname)) throw new MediaError("resource_host_not_allowed");
  return url;
}
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 2) || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) || a === 203 && b === 0 && c === 113);
  }
  // Only global-unicast IPv6, excluding transition/documentation/special allocations.
  if (isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^200[12]:/i.test(address) && !/^3fff:/i.test(address);
  return false;
}
function secret() {
  const value = process.env.MEDIA_PROXY_SECRET;
  if (!value || value.length < 32) throw new MediaError("media_not_configured");
  return value;
}
export function signResource(ticket: ResourceTicket): string {
  validateResourceUrl(ticket.url);
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `/api/media/resource?ticket=${payload}.${signature}`;
}
export function verifyResource(value: string, now = Date.now()): ResourceTicket {
  if (value.length > 16_384) throw new MediaError("invalid_ticket");
  const [payload, signature, extra] = value.split(".");
  if (!payload || !signature || extra) throw new MediaError("invalid_ticket");
  const expected = createHmac("sha256", secret()).update(payload).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new MediaError("invalid_ticket");
  let ticket: ResourceTicket;
  try { ticket = JSON.parse(Buffer.from(payload, "base64url").toString()); } catch { throw new MediaError("invalid_ticket"); }
  if (!ticket || !["hls", "mp4", "subtitle", "segment"].includes(ticket.kind) || typeof ticket.url !== "string" || !Number.isFinite(ticket.exp)) throw new MediaError("invalid_ticket");
  if (ticket.exp <= now || ticket.exp > now + 31 * 60_000) throw new MediaError("source_expired");
  validateResourceUrl(ticket.url);
  return ticket;
}
export function rewriteHls(text: string, parent: ResourceTicket): string {
  if (!text.trimStart().startsWith("#EXTM3U")) throw new MediaError("invalid_manifest");
  if (/^#EXT-X-(?:SESSION-)?KEY:.*METHOD=(?!NONE(?:,|$))/m.test(text)) throw new MediaError("encrypted_media_unsupported");
  const child = (value: string, kind: ResourceKind = "segment") => signResource({ url: new URL(value, parent.url).href, kind, exp: parent.exp });
  return text.split(/\r?\n/).map((line) => {
    if (!line.trim()) return line;
    if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${child(uri, line.startsWith("#EXT-X-MEDIA:") ? "hls" : "segment")}"`);
    return child(line.trim());
  }).join("\n");
}
