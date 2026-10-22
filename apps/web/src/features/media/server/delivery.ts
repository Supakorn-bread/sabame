import "server-only";
import { subdlSrtToWebVtt } from "./subdl-subtitles";
import { detectSubtitleFormat, toWebVtt } from "../subtitles";
import { MediaError, type MediaResult } from "../types";
import { fetchResource } from "./resource-fetch";
import { deliveryPolicyForProvider, rewriteHls, signResource, verifyResource } from "./resource-security";
import { bilibiliJsonToWebVtt } from "./bilibili-subtitles";
import { anizoneAssToWebVtt } from "./anizone-subtitles";
import { decodeAnimerukaManifest } from "./animeruka-manifest";

export async function probeSubtitle(url: string, signal: AbortSignal, providerId?: string) {
  const resource = await fetchResource(url, signal, { policy: deliveryPolicyForProvider(providerId), ...(providerId === "anizone" ? { kind: "subtitle" as const } : {}) });
  const text = resource.body.toString("utf8");
  if (providerId === "anizone" && detectSubtitleFormat(text) === "ass") { anizoneAssToWebVtt(text); return "vtt"; }
  return detectSubtitleFormat(text);
}
export async function validateVideo(url: string, signal: AbortSignal, providerId?: string) {
  const policy = deliveryPolicyForProvider(providerId);
  const resource = await fetchResource(url, signal, { policy, ...(policy === "anizone" || policy === "animeruka" ? { kind: "hls" as const } : policy === "anifume" ? { kind: "mp4" as const } : {}), maxBytes: 1_048_576, ...(policy !== "animeruka" ? { range: "bytes=0-65535" } : {}) });
  const inspectPlaylist = async (body: Buffer, sourceUrl: string, depth: number): Promise<void> => {
    const text = policy === "animeruka" ? decodeAnimerukaManifest(body) : body.toString("utf8");
    const rewritten = rewriteHls(text, { url: sourceUrl, kind: "hls", policy, exp: Date.now() + 30 * 60_000 });
    const lines = rewritten.split(/\r?\n/);
    const first = lines.find((line) => line && !line.startsWith("#"));
    if (!first || depth > 2) throw new MediaError("invalid_manifest");
    const ticket = verifyResource(new URL(first, "https://sabame.invalid").searchParams.get("ticket") ?? "");
    const master = lines.some((line) => line.startsWith("#EXT-X-STREAM-INF:"));
    const child = await fetchResource(ticket.url, signal, { policy, ...(policy === "anizone" || policy === "animeruka" ? { kind: master ? "hls" as const : "segment" as const } : {}), maxBytes: master ? 1_048_576 : 33_554_432, ...(master ? {} : { range: "bytes=0-65535" }) });
    if (master) return inspectPlaylist(child.body, child.url, depth + 1);
    const keyLine = lines.find((line) => line.startsWith("#EXT-X-KEY:") && line.includes("METHOD=AES-128"));
    if (keyLine) {
      const signed = /URI="([^"]+)"/.exec(keyLine)?.[1] ?? "";
      const key = verifyResource(new URL(signed, "https://sabame.invalid").searchParams.get("ticket") ?? "");
      const bytes = await fetchResource(key.url, signal, { policy, kind: "key", maxBytes: 16 });
      if (bytes.body.length !== 16 || bytes.status !== 200 || child.body.length < 16 || child.body.length % 16 !== 0) throw new MediaError("invalid_video");
    } else {
      const ts = child.body.length >= 940 && [0, 188, 376, 564, 752].every((offset) => child.body[offset] === 0x47);
      const mp4 = ["ftyp", "styp", "moof"].includes(child.body.subarray(4, 8).toString());
      if (!ts && (policy === "animeruka" || !mp4)) throw new MediaError("invalid_video");
    }
  };
  const text = policy === "animeruka" ? decodeAnimerukaManifest(resource.body) : resource.body.toString("utf8");
  if (text.trimStart().startsWith("#EXTM3U")) await inspectPlaylist(resource.body, resource.url, 0);
  else if (resource.body.subarray(4, 8).toString() !== "ftyp") throw new MediaError("invalid_video");
}
export function prepareDelivery(result: MediaResult): MediaResult {
  const exp = Date.now() + 30 * 60_000;
  const policy = deliveryPolicyForProvider(result.provider);
  return { ...result, video: { ...result.video, expiresAt: exp, url: signResource({ url: result.video.url, kind: result.video.type, policy, exp }) },
    subtitles: result.subtitles.map((track) => ({ ...track, url: track.availability === "available" ? signResource({ url: track.url, kind: "subtitle", policy, exp }) : "" })) };
}
export function boundedRange(value: string | null): string {
  if (!value) return "bytes=0-8388607";
  const match = /^bytes=(\d+)-(\d*)$/.exec(value);
  if (!match) throw new MediaError("invalid_range");
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start + 8_388_607;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || end < start) throw new MediaError("invalid_range");
  return `bytes=${start}-${Math.min(end, start + 8_388_607)}`;
}
export async function deliverResource(request: Request) {
  const ticket = verifyResource(new URL(request.url).searchParams.get("ticket") ?? "");
  const resource = await fetchResource(ticket.url, request.signal, {
    policy: ticket.policy,
    ...(["anizone", "anifume", "animeruka", "bilibili", "subdl"].includes(ticket.policy) ? { kind: ticket.kind } : {}),
    maxBytes: ticket.kind === "key" ? 16 : ticket.kind === "mp4" ? 8_388_608 : ticket.kind === "segment" ? 33_554_432 : 1_048_576,
    ...(ticket.kind === "mp4" ? { range: boundedRange(request.headers.get("range")) } : {}),
  });
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  if (ticket.kind === "key") {
    if (resource.body.length !== 16 || resource.status !== 200) throw new MediaError("invalid_resource");
    headers.set("Content-Type", "application/octet-stream");
    return new Response(new Uint8Array(resource.body), { headers });
  }
  if (ticket.kind === "subtitle") {
    headers.set("Content-Type", "text/vtt; charset=utf-8");
    if (ticket.policy === "subdl") {
      const subtitle = subdlSrtToWebVtt(resource.body);
      if (subtitle.hash !== ticket.subtitleHash) throw new MediaError("source_expired");
      return new Response(subtitle.vtt, { headers });
    }
    const text = resource.body.toString("utf8");
    if (ticket.policy === "anizone" && detectSubtitleFormat(text) === "ass") return new Response(anizoneAssToWebVtt(text), { headers });
    return new Response(ticket.policy === "bilibili" ? bilibiliJsonToWebVtt(text, ticket.subtitleOffsetMs!) : toWebVtt(text), { headers });
  }
  if (ticket.policy === "animeruka" && ticket.kind === "hls" || resource.body.subarray(0, 128).toString().trimStart().startsWith("#EXTM3U")) {
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    const text = ticket.policy === "animeruka" ? decodeAnimerukaManifest(resource.body) : resource.body.toString("utf8");
    return new Response(rewriteHls(text, { ...ticket, url: resource.url }), { headers });
  }
  if (ticket.kind === "hls") throw new MediaError("invalid_manifest");
  if (ticket.policy === "animeruka" && (resource.body.length < 940 || [0, 188, 376, 564, 752].some((offset) => resource.body[offset] !== 0x47))) throw new MediaError("invalid_video");
  headers.set("Content-Type", ticket.kind === "mp4" ? "video/mp4" : ticket.policy === "animeruka" ? "video/mp2t" : "application/octet-stream");
  if (resource.headers["content-range"]) headers.set("Content-Range", resource.headers["content-range"]);
  headers.set("Accept-Ranges", "bytes");
  return new Response(new Uint8Array(resource.body), { status: resource.status, headers });
}
