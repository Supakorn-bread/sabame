import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { MediaError } from "../types";

export type ResourceKind = "hls" | "mp4" | "subtitle" | "segment" | "key";
export type DeliveryPolicyId = "default" | "hianime" | "anizone" | "anifume" | "animeruka" | "bilibili" | "subdl";
export interface ResourceTicket { url: string; kind: ResourceKind; exp: number; policy: DeliveryPolicyId; subtitleOffsetMs?: number; subtitleHash?: string }
export function deliveryPolicyForProvider(providerId?: string): DeliveryPolicyId {
  return providerId === "animeruka" ? "animeruka" : providerId === "anifume" ? "anifume" : providerId === "anizone" ? "anizone" : providerId === "hianime" ? "hianime" : "default";
}
export function resourceReferer(policy: DeliveryPolicyId): string | undefined {
  if (policy === "bilibili" || policy === "subdl") return undefined;
  if (policy === "anizone") return "https://anizone.to/";
  if (policy === "anifume") return "https://anifume.com/";
  if (policy === "animeruka") return "https://animemami.xyz/";
  return policy === "hianime" ? "https://zokoanime.video/" : "https://animeparadise.moe/";
}
export function allowedHosts(policy: DeliveryPolicyId = "default") {
  if (policy === "animeruka") return new Set(["animeruka.com", "animemami.xyz", "cdn2.maimeorder.com"]);
  if (policy === "anifume") return new Set(["a12.rukoluo.com", "a13.rukoluo.com", "a15.rukoluo.com", "a16.rukoluo.com", "a17.rukoluo.com"]);
  if (policy === "anizone") return new Set(["seiryuu.vid-cdn.xyz"]);
  if (policy === "subdl") return new Set(["dl.subdl.com"]);
  if (policy === "bilibili") return new Set(["s.bstarstatic.com"]);
  if (policy === "hianime") return new Set(["hls.dramahot.top", "hls1.drama1.cfd"]);
  return new Set(["stream.animeparadise.moe", "api.animeparadise.moe",
    ...(process.env.MEDIA_ALLOWED_HOSTS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)]);
}
export function validateResourceUrl(value: string, hosts = allowedHosts()): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new MediaError("invalid_resource"); }
  if (url.protocol !== "https:" || url.port && url.port !== "443" || url.username || url.password || !hosts.has(url.hostname) || isIP(url.hostname)) throw new MediaError("resource_host_not_allowed");
  return url;
}
export function validatePolicyResource(value: string, policy: DeliveryPolicyId, kind?: ResourceKind): URL {
  const url = validateResourceUrl(value, allowedHosts(policy));
  if (kind === "key" && policy !== "anizone") throw new MediaError("encrypted_media_unsupported");
  if (policy === "anizone") {
    const asset = "[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}";
    const paths: Partial<Record<ResourceKind, string>> = {
      hls: "(?:master\\.m3u8|(?:video/[1-9]\\d{2,3}|audio/\\d+_[A-Za-z-]{2,20})/playlist\\.m3u8)",
      subtitle: "subtitles/\\d+_[A-Za-z-]{2,20}\\.(?:ass|vtt|srt)",
      segment: "(?:video/[1-9]\\d{2,3}|audio/\\d+_[A-Za-z-]{2,20})/\\d{5,8}\\.ts",
      key: "keys/[A-Za-z0-9_-]{6,100}\\.key",
    };
    if (!kind || !paths[kind] || !new RegExp(`^/${asset}/${paths[kind]}$`).test(url.pathname) || url.search || url.hash) throw new MediaError("invalid_resource");
  }
  if (policy === "animeruka") {
    if (url.hash) throw new MediaError("invalid_resource");
    if (kind === "hls" || kind === "segment") {
      const path = kind === "hls" ? /^\/hls\/[A-Za-z0-9_=]{20,512}\.txt$/ : /^\/hls\/blob\/([a-f0-9]{32}-\d{4})\/\1-\d{3,5}\.webp$/;
      if (url.hostname !== "cdn2.maimeorder.com" || url.search || !path.test(url.pathname)) throw new MediaError("invalid_resource");
    } else if (kind !== undefined) throw new MediaError("invalid_resource");
    else if (url.hostname === "animeruka.com") {
      const query = [...url.searchParams.keys()];
      const valid = url.pathname === "/" && query.join() === "s" && (url.searchParams.get("s")?.length ?? 0) <= 200
        || /^\/(?:anime|ep)\/[a-z0-9-]{1,180}\/$/.test(url.pathname) && !url.search
        || /^\/wp-json\/dooplayer\/v2\/[1-9]\d{0,9}\/tv\/[1-9]\d{0,2}$/.test(url.pathname) && (query.length === 0 || query.join() === "v" && /^[a-f0-9]{8}$/.test(url.searchParams.get("v") ?? ""));
      if (!valid) throw new MediaError("invalid_resource");
    } else if (url.hostname !== "animemami.xyz" || !/^\/v\/[A-Za-z0-9_-]{10,80}$/.test(url.pathname) || url.search) throw new MediaError("invalid_resource");
  }
  if (policy === "bilibili" && (kind !== "subtitle" || !/^\/ogv\/subtitle\/[a-f0-9]{32,64}\.json$/.test(url.pathname) || url.hash)) throw new MediaError("invalid_resource");
  if (policy === "anifume" && (kind !== "mp4" || !/^\/f\/(?:1\/)?[A-Za-z0-9_-]{1,160}\/[A-Za-z0-9_-]{1,200}\.mp4$/.test(url.pathname) || url.hash || [...url.searchParams.keys()].sort().join() !== "e,m" || !/^[A-Za-z0-9_-]{10,100}$/.test(url.searchParams.get("m") ?? "") || !/^\d{10}$/.test(url.searchParams.get("e") ?? ""))) throw new MediaError("invalid_resource");
  if (policy === "subdl" && (kind !== "subtitle" || !/^\/subtitle\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}$/.test(url.pathname) || url.search || url.hash)) throw new MediaError("invalid_resource");
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
  validatePolicyResource(ticket.url, ticket.policy, ticket.kind);
  if (ticket.policy === "bilibili" && (!Number.isSafeInteger(ticket.subtitleOffsetMs) || Math.abs(ticket.subtitleOffsetMs!) > 60_000)) throw new MediaError("invalid_ticket");
  if (ticket.policy === "subdl" && !/^[a-f0-9]{64}$/.test(ticket.subtitleHash ?? "")) throw new MediaError("invalid_ticket");
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
  if (ticket && typeof ticket === "object" && ticket.policy === undefined) ticket.policy = "default";
  if (!ticket || !["hls", "mp4", "subtitle", "segment", "key"].includes(ticket.kind) || typeof ticket.url !== "string" || !["default", "hianime", "anizone", "anifume", "animeruka", "bilibili", "subdl"].includes(ticket.policy) || !Number.isFinite(ticket.exp) || ticket.policy === "bilibili" && (!Number.isSafeInteger(ticket.subtitleOffsetMs) || Math.abs(ticket.subtitleOffsetMs!) > 60_000)) throw new MediaError("invalid_ticket");
  if (ticket.policy === "subdl" && !/^[a-f0-9]{64}$/.test(ticket.subtitleHash ?? "")) throw new MediaError("invalid_ticket");
  if (ticket.exp <= now || ticket.exp > now + 31 * 60_000) throw new MediaError("source_expired");
  validatePolicyResource(ticket.url, ticket.policy, ticket.kind);
  return ticket;
}
export function rewriteHls(text: string, parent: ResourceTicket): string {
  if (!text.trimStart().startsWith("#EXTM3U")) throw new MediaError("invalid_manifest");
  const child = (value: string, kind: ResourceKind = "segment") => {
    const url = new URL(value, parent.url);
    if (parent.policy === "anizone" && url.pathname.split("/")[1] !== new URL(parent.url).pathname.split("/")[1]) throw new MediaError("invalid_resource");
    return signResource({ url: url.href, kind, exp: parent.exp, policy: parent.policy });
  };
  return text.split(/\r?\n/).map((line) => {
    line = line.trim();
    if (!line.trim()) return line;
    if (/^#EXT-X-(?:SESSION-)?KEY:/i.test(line)) {
      const attrs = new Map<string, string>();
      const source = line.slice(line.indexOf(":") + 1);
      let cursor = 0;
      const pattern = /([A-Z0-9-]+)=("[^"\r\n]*"|[^,\s]+)(?:,|$)/gy;
      for (;;) {
        const match = pattern.exec(source);
        if (!match) break;
        if (attrs.has(match[1])) throw new MediaError("encrypted_media_unsupported");
        attrs.set(match[1], match[2].replace(/^"|"$/g, "")); cursor = pattern.lastIndex;
      }
      if (cursor !== source.length || !attrs.has("METHOD")) throw new MediaError("encrypted_media_unsupported");
      if (attrs.get("METHOD") === "NONE" && attrs.size === 1 && !line.startsWith("#EXT-X-SESSION-KEY:")) return line;
      if (parent.policy !== "anizone" || !line.startsWith("#EXT-X-KEY:") || attrs.get("METHOD") !== "AES-128" || !attrs.has("URI") || attrs.has("KEYFORMAT") && attrs.get("KEYFORMAT") !== "identity" || attrs.has("KEYFORMATVERSIONS") && attrs.get("KEYFORMATVERSIONS") !== "1" || attrs.has("IV") && !/^0x[a-f0-9]{1,32}$/i.test(attrs.get("IV")!)) throw new MediaError("encrypted_media_unsupported");
      if ([...attrs.keys()].some((name) => !["METHOD", "URI", "IV", "KEYFORMAT", "KEYFORMATVERSIONS"].includes(name)) || !/URI="[^"]+"/.test(line)) throw new MediaError("encrypted_media_unsupported");
      return line.replace(/URI="([^"]+)"/, (_, uri: string) => `URI="${child(uri, "key")}"`);
    }
    if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_, uri: string) => `URI="${child(uri, line.startsWith("#EXT-X-MEDIA:") || uri.split("?", 1)[0].endsWith(".m3u8") ? "hls" : "segment")}"`);
    return child(line, parent.policy === "anizone" && line.endsWith(".m3u8") ? "hls" : "segment");
  }).join("\n");
}
