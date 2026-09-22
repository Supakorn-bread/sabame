import { normalizeLanguage } from "./language";
import type { RawSubtitle, SubtitleFormat, SubtitleTrack } from "./types";

export function detectSubtitleFormat(text: string): SubtitleFormat {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (/^WEBVTT(?:\s|$)/.test(trimmed)) return "vtt";
  if (/\d{2}:\d{2}:\d{2},\d{3}\s+-->\s+\d{2}:\d{2}:\d{2},\d{3}/.test(trimmed)) return "srt";
  if (/^\[Script Info\]/im.test(trimmed)) return "ass";
  return "unknown";
}
export function toWebVtt(text: string): string {
  const format = detectSubtitleFormat(text);
  if (format === "vtt") return text.replace(/^\uFEFF/, "");
  if (format !== "srt") throw new Error("unsupported_subtitle_format");
  return `WEBVTT\n\n${text.replace(/^\uFEFF/, "").replaceAll("\r\n", "\n").replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")}`;
}
export type SubtitleProbe = (url: string, signal: AbortSignal) => Promise<SubtitleFormat>;
export async function resolveSubtitles(raw: RawSubtitle[] | undefined, probe: SubtitleProbe, signal: AbortSignal) {
  const tracks: SubtitleTrack[] = await Promise.all((raw ?? []).slice(0, 30).map(async (track) => {
    const language = normalizeLanguage(track.language) === "und" ? normalizeLanguage(track.label) : normalizeLanguage(track.language);
    let format: SubtitleFormat = track.format ?? "unknown";
    let availability: SubtitleTrack["availability"] = "unavailable";
    try {
      format = await probe(track.url, signal);
      availability = format === "unknown" ? "unavailable" : "available";
    } catch { /* Preserve failed tracks as metadata; do not claim absence or select them. */ }
    return { language, label: track.label?.slice(0, 120) || language, url: track.url,
      format, availability, displaySupported: availability === "available" && (format === "vtt" || format === "srt"),
      default: false, syncStatus: "unverified" };
  }));
  const preferred = tracks.find((t) => t.language === "th" && t.displaySupported)
    ?? tracks.find((t) => t.language === "en" && t.displaySupported);
  if (preferred) preferred.default = true;
  return tracks;
}
