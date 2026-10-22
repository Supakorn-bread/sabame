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
export type MediaProviderId = "animeparadise" | "hianime" | "anizone" | "anifume" | "animeruka";
export interface MediaQualityOption { id: string; label: string }
export interface MediaProviderAvailability {
  id: MediaProviderId;
  label: string;
  status: "available" | "unavailable" | "timeout";
  code?: string;
  subtitleLanguage?: "th" | "en" | "none";
  qualities?: MediaQualityOption[];
  selectedQualityId?: string;
  selectedServerId?: string;
}
export interface MediaProviderDiscovery {
  metadata: { animeId: string; episodeNumber: number };
  providers: MediaProviderAvailability[];
  defaultProviderId?: MediaProviderId;
}
export interface MediaResult {
  provider: string;
  video: { url: string; type: "hls" | "mp4"; expiresAt?: number; quality?: string };
  subtitles: SubtitleTrack[];
  qualities?: MediaQualityOption[];
  selectedQualityId?: string;
  selectedServerId?: string;
  embeddedSubtitles?: { language: "th"; label: string; removable: false };
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
  qualities?: MediaQualityOption[];
  selectedQualityId?: string;
  selectedServerId?: string;
  embeddedSubtitles?: MediaResult["embeddedSubtitles"];
}
export interface EpisodeRequest { animeId: string; episodeNumber: number; serverId?: string; qualityId?: string }
export interface MediaServerList {
  provider: "animeruka";
  defaultServerId: string;
  servers: { id: string; label: string }[];
}
export interface MediaProvider {
  id: string;
  requiresEnglishSubtitles?: boolean;
  resolve(episode: EpisodeRequest, signal: AbortSignal): Promise<MediaBundle>;
  resolveAlternatives?(episode: EpisodeRequest, signal: AbortSignal): AsyncIterable<MediaBundle>;
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
