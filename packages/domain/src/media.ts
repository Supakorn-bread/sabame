export type SubtitleFormat = "vtt" | "srt" | "ass" | "unknown";
export interface SubtitleTrack {
  language: string;
  label: string;
  url: string;
  format: SubtitleFormat;
  default: boolean;
  availability: "available" | "unavailable" | "unknown";
  displaySupported: boolean;
  syncStatus: "unverified";
}
export interface MediaResult {
  provider: string;
  video: { url: string; type: "hls" | "mp4"; expiresAt?: number };
  subtitles: SubtitleTrack[];
  metadata: { animeId: string; episodeNumber: number };
  thaiStatus: "present" | "absent_in_returned_tracks" | "unavailable" | "unknown";
  selectionReason: "thai_subtitle" | "english_subtitle" | "video_only";
}
export interface RawSubtitle {
  language?: string;
  label?: string;
  url: string;
  format?: SubtitleFormat;
}
export interface MediaBundle {
  video: MediaResult["video"];
  subtitles?: RawSubtitle[];
}
export interface EpisodeRequest { animeId: string; episodeNumber: number }
export interface MediaProvider {
  id: string;
  resolve(episode: EpisodeRequest, signal: AbortSignal): Promise<MediaBundle>;
}
/** Future external sources must supply matching evidence; they are never merged automatically. */
export interface ExternalSubtitleCandidate extends RawSubtitle {
  match: { episodeNumber: number; filename?: string; duration?: number; releaseGroup?: string; source?: string; resolution?: string; codec?: string };
  syncStatus: "unverified";
}
export interface ExternalSubtitleProvider {
  id: string;
  search(episode: EpisodeRequest, signal: AbortSignal): Promise<ExternalSubtitleCandidate[]>;
}
export class MediaError extends Error {
  constructor(public code: string) { super(code); this.name = "MediaError"; }
}
