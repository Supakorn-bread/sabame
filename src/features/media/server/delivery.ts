import "server-only";
import { detectSubtitleFormat, toWebVtt } from "../subtitles";
import { MediaError, type MediaResult } from "../types";
import { fetchResource } from "./resource-fetch";
import { rewriteHls, signResource, verifyResource } from "./resource-security";

export async function probeSubtitle(url: string, signal: AbortSignal) {
  const resource = await fetchResource(url, signal);
  return detectSubtitleFormat(resource.body.toString("utf8"));
}
export async function validateVideo(url: string, signal: AbortSignal) {
  const resource = await fetchResource(url, signal, { maxBytes: 1_048_576, range: "bytes=0-65535" });
  const text = resource.body.toString("utf8");
  if (text.trimStart().startsWith("#EXTM3U")) {
    rewriteHls(text, { url: resource.url, kind: "hls", exp: Date.now() + 30 * 60_000 });
  } else if (resource.body.subarray(4, 8).toString() !== "ftyp") throw new MediaError("invalid_video");
}
export function prepareDelivery(result: MediaResult): MediaResult {
  const exp = Date.now() + 30 * 60_000;
  return { ...result, video: { ...result.video, expiresAt: exp, url: signResource({ url: result.video.url, kind: result.video.type, exp }) },
    subtitles: result.subtitles.map((track) => ({ ...track, url: track.availability === "available" ? signResource({ url: track.url, kind: "subtitle", exp }) : "" })) };
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
    maxBytes: ticket.kind === "mp4" ? 8_388_608 : ticket.kind === "segment" ? 33_554_432 : 1_048_576,
    ...(ticket.kind === "mp4" ? { range: boundedRange(request.headers.get("range")) } : {}),
  });
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
  if (ticket.kind === "subtitle") {
    headers.set("Content-Type", "text/vtt; charset=utf-8");
    return new Response(toWebVtt(resource.body.toString("utf8")), { headers });
  }
  if (resource.body.subarray(0, 128).toString().trimStart().startsWith("#EXTM3U")) {
    headers.set("Content-Type", "application/vnd.apple.mpegurl");
    return new Response(rewriteHls(resource.body.toString("utf8"), { ...ticket, url: resource.url }), { headers });
  }
  if (ticket.kind === "hls") throw new MediaError("invalid_manifest");
  headers.set("Content-Type", ticket.kind === "mp4" ? "video/mp4" : "application/octet-stream");
  if (resource.headers["content-range"]) headers.set("Content-Range", resource.headers["content-range"]);
  headers.set("Accept-Ranges", "bytes");
  return new Response(new Uint8Array(resource.body), { status: resource.status, headers });
}
