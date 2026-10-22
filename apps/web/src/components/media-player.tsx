"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { normalizeLanguage } from "@/features/media/language";
import type { MediaProviderAvailability, MediaProviderDiscovery, MediaProviderId, MediaQualityOption, MediaResult, MediaServerList } from "@/features/media/types";

interface Props {
  animeId: string; title: string; episode: number; initialPosition: number; imageUrl?: string; providerLoading?: boolean;
  sourceSelection: MediaSourceSelection; onSourceSelectionChange: (source: MediaSourceSelection) => void;
  onPositionChange: (seconds: number, duration: number) => void; onComplete: () => void;
}
interface QualityLevel { index: number; label: string }
export type MediaSourceSelection = "automatic" | MediaProviderId;
type MediaRequestBody =
  | { episodeNumber: number }
  | { episodeNumber: number; provider: Exclude<MediaProviderId, "anifume" | "animeruka"> }
  | { episodeNumber: number; provider: "anifume"; qualityId?: string }
  | { episodeNumber: number; provider: "animeruka"; serverId?: string };
type ProviderDiscoveryState =
  | { key: string; attempt: number; status: "failed"; message: string }
  | { key: string; attempt: number; status: "ready"; discovery: MediaProviderDiscovery };
type OriginDiscovery =
  | { key: string; attempt: number; status: "ready"; serverList: MediaServerList }
  | { key: string; attempt: number; status: "error"; message: string };
type QualityPreference = { key: string; id: string };
type OriginPreference = { key: string; id: string };
const mediaProviderIds: readonly MediaProviderId[] = ["animeparadise", "hianime", "anizone", "anifume", "animeruka"];
const messages: Record<string, string> = {
  metadata_unavailable: "Anime details are temporarily unavailable. Please retry shortly.",
  upstream_unavailable: "The video provider is temporarily unavailable. Please retry shortly.",
  provider_unavailable: "The video provider is temporarily unavailable. Please retry shortly.",
  timeout: "Finding a source took too long. Please retry.",
  resource_timeout: "The video source took too long to respond. Try again.",
  english_subtitle_unavailable: "This source has no usable English subtitles. Try another episode or try again later.",
  mapping_required: "This title or season could not be matched safely. Try another title.",
  no_source: "No playable source is available for this title or season from the current providers. Being in your MAL list does not guarantee video availability.",
  episode_unavailable: "This episode is not available from the current providers.",
  source_expired: "This source has expired. Request a fresh source to continue.",
  media_not_configured: "Media delivery needs server configuration.",
  quality_unavailable: "This source quality is no longer available. Refresh provider availability and choose an offered quality.",
  unsupported_server: "This AnimeRuka server is not supported by Sabame yet. Choose another server.",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMediaProviderId(value: unknown): value is MediaProviderId {
  return typeof value === "string" && mediaProviderIds.some((providerId) => providerId === value);
}

function parseQualityOptions(value: unknown): MediaQualityOption[] | null {
  if (!Array.isArray(value)) return null;
  const options: MediaQualityOption[] = [];
  const seen = new Set<string>();
  for (const option of value) {
    if (!isRecord(option) || typeof option.id !== "string" || !option.id || typeof option.label !== "string" || !option.label || seen.has(option.id)) return null;
    seen.add(option.id);
    options.push({ id: option.id, label: option.label });
  }
  return options;
}

function parseProviderDiscovery(value: unknown, animeId: string, episode: number): MediaProviderDiscovery | null {
  if (!isRecord(value) || !isRecord(value.metadata) || value.metadata.animeId !== animeId || value.metadata.episodeNumber !== episode || !Array.isArray(value.providers)) return null;
  const providers: MediaProviderAvailability[] = [];
  const seen = new Set<MediaProviderId>();
  for (const provider of value.providers) {
    if (!isRecord(provider) || !isMediaProviderId(provider.id) || typeof provider.label !== "string" || !provider.label || seen.has(provider.id)) return null;
    if (provider.status !== "available" && provider.status !== "unavailable" && provider.status !== "timeout") return null;
    if (provider.code !== undefined && typeof provider.code !== "string") return null;
    if (provider.subtitleLanguage !== undefined && provider.subtitleLanguage !== "th" && provider.subtitleLanguage !== "en" && provider.subtitleLanguage !== "none") return null;
    if (provider.selectedServerId !== undefined && (typeof provider.selectedServerId !== "string" || !provider.selectedServerId)) return null;
    let qualities: MediaQualityOption[] | undefined;
    if (provider.qualities !== undefined) {
      const parsed = parseQualityOptions(provider.qualities);
      if (!parsed) return null;
      qualities = parsed;
    }
    if (provider.selectedQualityId !== undefined && (typeof provider.selectedQualityId !== "string" || !qualities?.some(({ id }) => id === provider.selectedQualityId))) return null;
    seen.add(provider.id);
    providers.push({
      id: provider.id,
      label: provider.label,
      status: provider.status,
      ...(typeof provider.code === "string" ? { code: provider.code } : {}),
      ...(provider.subtitleLanguage === "th" || provider.subtitleLanguage === "en" || provider.subtitleLanguage === "none" ? { subtitleLanguage: provider.subtitleLanguage } : {}),
      ...(qualities ? { qualities } : {}),
      ...(typeof provider.selectedQualityId === "string" ? { selectedQualityId: provider.selectedQualityId } : {}),
      ...(typeof provider.selectedServerId === "string" ? { selectedServerId: provider.selectedServerId } : {}),
    });
  }
  if (value.defaultProviderId !== undefined && (!isMediaProviderId(value.defaultProviderId) || !providers.some((provider) => provider.id === value.defaultProviderId && provider.status === "available"))) return null;
  return {
    metadata: { animeId, episodeNumber: episode },
    providers,
    ...(isMediaProviderId(value.defaultProviderId) ? { defaultProviderId: value.defaultProviderId } : {}),
  };
}

function parseMediaServerList(value: unknown): MediaServerList | null {
  if (!isRecord(value) || value.provider !== "animeruka" || typeof value.defaultServerId !== "string" || !Array.isArray(value.servers)) return null;
  const servers: MediaServerList["servers"] = [];
  for (const server of value.servers) {
    if (!isRecord(server) || typeof server.id !== "string" || server.id.length === 0 || typeof server.label !== "string") return null;
    servers.push({ id: server.id, label: server.label });
  }
  if (!servers.some(({ id }) => id === value.defaultServerId)) return null;
  return { provider: "animeruka", defaultServerId: value.defaultServerId, servers };
}

function providerAvailabilityLabel(provider: MediaProviderAvailability): string {
  if (provider.status === "timeout") return "Could not check";
  if (provider.status === "unavailable") return provider.code === "episode_unavailable" || provider.code === "no_source" ? "No episode available" : "Unavailable";
  return provider.subtitleLanguage === "th" ? "Available · Thai subtitles" : provider.subtitleLanguage === "en" ? "Available · English subtitles" : "Available";
}

export function MediaPlayer({ animeId, title, episode, initialPosition, imageUrl, providerLoading = false, sourceSelection, onSourceSelectionChange, onPositionChange, onComplete }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const pending = useRef<AbortController | null>(null);
  const initial = useRef(initialPosition);
  const report = useRef(onPositionChange);
  const completedEpisode = useRef<{ animeId: string; episode: number } | null>(null);
  const hasRequestedSource = useRef(false);
  const lastWrite = useRef(0);
  const episodeKey = JSON.stringify([animeId, episode]);
  const [media, setMedia] = useState<MediaResult | null>(null);
  const [providerDiscovery, setProviderDiscovery] = useState<ProviderDiscoveryState | null>(null);
  const [originDiscovery, setOriginDiscovery] = useState<OriginDiscovery | null>(null);
  const [originPreference, setOriginPreference] = useState<OriginPreference | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [needsPlay, setNeedsPlay] = useState(false);
  const [subtitle, setSubtitle] = useState("off");
  const [failedTracks, setFailedTracks] = useState<number[]>([]);
  const [qualityLevels, setQualityLevels] = useState<QualityLevel[]>([]);
  const [qualitySelection, setQualitySelection] = useState(-1);
  const [videoHeight, setVideoHeight] = useState(0);
  const [qualityPreference, setQualityPreference] = useState<QualityPreference | null>(null);
  const [providerDiscoveryAttempt, setProviderDiscoveryAttempt] = useState(0);
  const [originDiscoveryAttempt, setOriginDiscoveryAttempt] = useState(0);
  const applyHlsQuality = useRef<((level: number) => void) | null>(null);
  const currentProviderDiscovery = providerDiscovery?.key === episodeKey && providerDiscovery.attempt === providerDiscoveryAttempt ? providerDiscovery : null;
  const currentDiscovery = currentProviderDiscovery?.status === "ready" ? currentProviderDiscovery.discovery : null;
  const hasAvailableProvider = currentDiscovery?.providers.some(({ status }) => status === "available") ?? false;
  const requestedProviderRow = sourceSelection === "automatic" ? undefined : currentDiscovery?.providers.find(({ id }) => id === sourceSelection);
  const providerDiscoveryPending = !currentProviderDiscovery;
  const currentSourceSelection: MediaSourceSelection = sourceSelection === "automatic" || (!providerDiscoveryPending && requestedProviderRow?.status !== "available") ? "automatic" : sourceSelection;
  const mediaMatchesEpisode = media?.metadata.animeId === animeId && media.metadata.episodeNumber === episode;
  const currentMedia = mediaMatchesEpisode ? media : null;
  const actualMediaProvider = currentMedia && isMediaProviderId(currentMedia.provider) ? currentMedia.provider : null;
  const controlsProvider = currentSourceSelection === "automatic" ? actualMediaProvider ?? currentDiscovery?.defaultProviderId : currentSourceSelection;
  const anifumeQualityRow = currentDiscovery?.providers.find(({ id }) => id === "anifume");
  const anifumeQualityOptions = currentMedia?.provider === "anifume" && (currentMedia.qualities?.length ?? 0) > 0
    ? currentMedia.qualities ?? []
    : anifumeQualityRow?.qualities ?? [];
  const providerQualityRow = controlsProvider === "anifume" ? anifumeQualityRow : undefined;
  const providerQualityOptions = controlsProvider === "anifume" ? anifumeQualityOptions : [];
  const currentAnifumeQualityId = currentMedia?.provider === "anifume" ? currentMedia.selectedQualityId : undefined;
  const providerQualityId = currentAnifumeQualityId && providerQualityOptions.some(({ id }) => id === currentAnifumeQualityId)
    ? currentAnifumeQualityId
    : qualityPreference?.key === episodeKey && providerQualityOptions.some(({ id }) => id === qualityPreference.id)
      ? qualityPreference.id
      : providerQualityRow?.selectedQualityId;
  const shouldDiscoverOriginServers = currentSourceSelection === "animeruka" || (currentSourceSelection === "automatic" && actualMediaProvider === "animeruka");
  const originDiscoveryKey = shouldDiscoverOriginServers ? episodeKey : null;
  const defaultOriginServerId = currentMedia?.provider === "animeruka" && currentMedia.selectedServerId
    ? currentMedia.selectedServerId
    : currentDiscovery?.providers.find(({ id }) => id === "animeruka")?.selectedServerId;
  const originFetchKey = originDiscoveryKey ? `${originDiscoveryKey}:${originDiscoveryAttempt}` : null;
  const currentOriginDiscovery = originDiscoveryKey && originDiscovery?.key === originDiscoveryKey && originDiscovery.attempt === originDiscoveryAttempt ? originDiscovery : null;
  const currentOriginServers = currentOriginDiscovery?.status === "ready" ? currentOriginDiscovery.serverList : null;
  const selectedOriginServerId = currentMedia?.provider === "animeruka" && currentOriginServers?.servers.some(({ id }) => id === currentMedia.selectedServerId)
    ? currentMedia.selectedServerId
    : originPreference?.key === episodeKey && currentOriginServers?.servers.some(({ id }) => id === originPreference.id)
      ? originPreference.id
      : currentOriginServers?.servers.some(({ id }) => id === defaultOriginServerId)
        ? defaultOriginServerId
        : currentOriginServers?.defaultServerId;
  useEffect(() => { report.current = onPositionChange; }, [onPositionChange]);
  const flush = useCallback((force = false) => {
    const element = video.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    if (force || Date.now() - lastWrite.current >= 5000) { report.current(element.currentTime, element.duration); lastWrite.current = Date.now(); }
  }, []);
  const completeCurrentEpisode = useCallback((fromPlayback = false) => {
    if (fromPlayback && !mediaMatchesEpisode) return;
    if (completedEpisode.current?.animeId === animeId && completedEpisode.current.episode === episode) return;
    if (mediaMatchesEpisode) flush(true);
    completedEpisode.current = { animeId, episode };
    onComplete();
  }, [animeId, episode, flush, mediaMatchesEpisode, onComplete]);
  useEffect(() => () => pending.current?.abort(), [animeId, episode]);
  useEffect(() => {
    if (sourceSelection === "automatic" || !currentProviderDiscovery) return;
    if (currentProviderDiscovery.status === "failed" || requestedProviderRow?.status !== "available") onSourceSelectionChange("automatic");
  }, [currentProviderDiscovery, onSourceSelectionChange, requestedProviderRow?.status, sourceSelection]);
  useEffect(() => {
    const controller = new AbortController();
    const attempt = providerDiscoveryAttempt;
    void (async () => {
      try {
        const query = new URLSearchParams({ episodeNumber: String(episode) });
        const response = await fetch(`/api/anime/${encodeURIComponent(animeId)}/media/providers?${query}`, { signal: controller.signal, cache: "no-store" });
        const payload: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error("Provider availability could not be checked.");
        const discovery = parseProviderDiscovery(payload, animeId, episode);
        if (!discovery) throw new Error("Provider availability returned an invalid response.");
        setProviderDiscovery({ key: episodeKey, attempt, status: "ready", discovery });
      } catch (failure) {
        if (controller.signal.aborted) return;
        setProviderDiscovery({
          key: episodeKey,
          attempt,
          status: "failed",
          message: failure instanceof Error ? failure.message : "Provider availability could not be checked.",
        });
      }
    })();
    return () => controller.abort();
  }, [animeId, episode, episodeKey, providerDiscoveryAttempt]);
  useEffect(() => {
    if (!originDiscoveryKey || !originFetchKey) return;
    const controller = new AbortController();
    const attempt = originDiscoveryAttempt;
    const key = originDiscoveryKey;
    void (async () => {
      try {
        const query = new URLSearchParams({ episodeNumber: String(episode), provider: "animeruka" });
        const response = await fetch(`/api/anime/${encodeURIComponent(animeId)}/media/servers?${query}`, { signal: controller.signal });
        const payload: unknown = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error("AnimeRuka servers are temporarily unavailable. Try again later.");
        const serverList = parseMediaServerList(payload);
        if (!serverList) throw new Error("AnimeRuka returned no usable servers for this episode.");
        setOriginDiscovery({ key, attempt, status: "ready", serverList });
      } catch (failure) {
        if (!controller.signal.aborted) setOriginDiscovery({
          key,
          attempt,
          status: "error",
          message: failure instanceof Error ? failure.message : "Unable to load AnimeRuka servers.",
        });
      }
    })();
    return () => controller.abort();
  }, [animeId, episode, episodeKey, originDiscoveryAttempt, originDiscoveryKey, originFetchKey]);
  useEffect(() => {
    applyHlsQuality.current = null;
    if (!currentMedia) return;
    const element = video.current;
    if (!element) return;
    let disposed = false;
    let destroy = () => {};
    const trackErrors = Array.from(element.querySelectorAll("track")).map((track, index) => {
      const fail = () => { setFailedTracks((failed) => failed.includes(index) ? failed : [...failed, index]); setSubtitle((current) => current === String(index) ? "off" : current); };
      track.addEventListener("error", fail);
      return () => track.removeEventListener("error", fail);
    });
    if (currentMedia.video.type === "hls") {
      void import("hls.js").then(({ default: Hls }) => {
        if (disposed) return;
        if (!Hls.isSupported()) {
          if (element.canPlayType("application/vnd.apple.mpegurl")) element.src = currentMedia.video.url;
          else setError("This browser cannot play HLS video.");
          return;
        }
        const hls = new Hls();
        const applyQuality = (level: number) => { hls.nextLevel = level; };
        const updateQualityLevels = () => {
          const heightCounts = new Map<number, number>();
          for (const level of hls.levels) {
            if (level.height > 0) heightCounts.set(level.height, (heightCounts.get(level.height) ?? 0) + 1);
          }
          setQualityLevels(hls.levels.flatMap(({ height }, index) => height > 0 ? [{
            index,
            label: `${height}p${(heightCounts.get(height) ?? 0) > 1 ? ` (Level ${index + 1})` : ""}`,
          }] : []));
        };
        const handleHlsError = (_: typeof Hls.Events.ERROR, data: { fatal: boolean }) => {
          if (data.fatal && !disposed) setError("Playback failed. Request a fresh source to retry.");
        };
        hls.on(Hls.Events.MANIFEST_PARSED, updateQualityLevels);
        hls.on(Hls.Events.LEVELS_UPDATED, updateQualityLevels);
        hls.on(Hls.Events.ERROR, handleHlsError);
        applyHlsQuality.current = applyQuality;
        destroy = () => {
          hls.off(Hls.Events.MANIFEST_PARSED, updateQualityLevels);
          hls.off(Hls.Events.LEVELS_UPDATED, updateQualityLevels);
          hls.off(Hls.Events.ERROR, handleHlsError);
          if (applyHlsQuality.current === applyQuality) applyHlsQuality.current = null;
          hls.destroy();
        };
        hls.loadSource(currentMedia.video.url); hls.attachMedia(element);
      }).catch(() => { if (!disposed) setError("The video player could not load. Please retry."); });
    } else element.src = currentMedia.video.url;
    const save = () => flush(true);
    window.addEventListener("pagehide", save);
    return () => {
      if (Number.isFinite(element.duration) && element.duration > 0) report.current(element.currentTime, element.duration);
      disposed = true; trackErrors.forEach((cleanup) => cleanup()); window.removeEventListener("pagehide", save); destroy(); element.pause(); element.removeAttribute("src"); element.load();
    };
  }, [currentMedia, flush]);
  useEffect(() => {
    const tracks = video.current?.textTracks;
    if (tracks) for (const [index, track] of Array.from(tracks).entries()) track.mode = String(index) === subtitle ? "showing" : "disabled";
  }, [subtitle, currentMedia]);
  async function resolve(selection: MediaSourceSelection = currentSourceSelection, options: { serverId?: string; qualityId?: string } = {}) {
    if (providerDiscoveryPending || !hasAvailableProvider || (selection !== "automatic" && !currentDiscovery?.providers.some((provider) => provider.id === selection && provider.status === "available"))) return;
    hasRequestedSource.current = true;
    flush(true);
    if (video.current && Number.isFinite(video.current.currentTime)) initial.current = video.current.currentTime;
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setMedia(null); setError(""); setLoading(true); setFailedTracks([]); setNeedsPlay(false);
    setQualityLevels([]); setQualitySelection(-1); setVideoHeight(0); applyHlsQuality.current = null;
    try {
      const selectedServerId = selection === "animeruka" ? selectedOriginServerId ?? currentDiscovery?.providers.find(({ id }) => id === "animeruka")?.selectedServerId : undefined;
      const resolvedServerId = options.serverId ?? selectedServerId;
      const rememberedQualityId = currentMedia?.provider === "anifume" && anifumeQualityOptions.some(({ id }) => id === currentMedia.selectedQualityId)
        ? currentMedia.selectedQualityId
        : qualityPreference?.key === episodeKey && anifumeQualityOptions.some(({ id }) => id === qualityPreference.id)
          ? qualityPreference.id
          : anifumeQualityRow?.selectedQualityId;
      const selectedQualityId = options.qualityId ?? (selection === "anifume" && anifumeQualityOptions.some(({ id }) => id === rememberedQualityId) ? rememberedQualityId : undefined);
      const body: MediaRequestBody = selection === "automatic"
        ? { episodeNumber: episode }
        : selection === "animeruka"
          ? { episodeNumber: episode, provider: selection, ...(resolvedServerId ? { serverId: resolvedServerId } : {}) }
          : selection === "anifume"
            ? { episodeNumber: episode, provider: selection, ...(selectedQualityId ? { qualityId: selectedQualityId } : {}) }
            : { episodeNumber: episode, provider: selection };
      const response = await fetch(`/api/anime/${encodeURIComponent(animeId)}/media`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: controller.signal });
      const data: unknown = await response.json();
      if (controller.signal.aborted) return;
      const errorCode = isRecord(data) && isRecord(data.error) && typeof data.error.code === "string" ? data.error.code : "";
      if (!response.ok) throw new Error(messages[errorCode] ?? "No playable source is available right now. Please retry later.");
      if (!isRecord(data) || !isMediaProviderId(data.provider) || !isRecord(data.metadata) || data.metadata.animeId !== animeId || data.metadata.episodeNumber !== episode) {
        throw new Error("The video provider returned a different episode.");
      }
      const result = data as unknown as MediaResult;
      const supported = result.subtitles.filter((track) => track.displaySupported);
      const preferredThai = supported.findIndex((track) => normalizeLanguage(track.language) === "th");
      const preferredEnglish = supported.findIndex((track) => normalizeLanguage(track.language) === "en");
      const providerDefault = supported.findIndex((track) => track.default);
      const preferred = preferredThai >= 0 ? preferredThai : preferredEnglish >= 0 ? preferredEnglish : providerDefault;
      setSubtitle(preferred >= 0 ? String(preferred) : "off");
      setMedia(result);
    } catch (failure) {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "Unable to load media.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  function changeSource(selection: MediaSourceSelection) {
    if (selection === currentSourceSelection) return;
    if (selection !== "automatic" && !currentDiscovery?.providers.some((provider) => provider.id === selection && provider.status === "available")) return;
    onSourceSelectionChange(selection);
    if (hasRequestedSource.current) void resolve(selection);
  }
  function changeOriginServer(serverId: string) {
    if (currentOriginDiscovery?.status !== "ready" || !currentOriginDiscovery.serverList.servers.some((server) => server.id === serverId)) return;
    setOriginPreference({ key: episodeKey, id: serverId });
    if (currentSourceSelection !== "animeruka") onSourceSelectionChange("animeruka");
    if (hasRequestedSource.current) void resolve("animeruka", { serverId });
  }
  function changeAnifumeQuality(qualityId: string) {
    if (!providerQualityOptions.some(({ id }) => id === qualityId)) return;
    setQualityPreference({ key: episodeKey, id: qualityId });
    if (currentSourceSelection !== "anifume") onSourceSelectionChange("anifume");
    if (hasRequestedSource.current) void resolve("anifume", { qualityId });
  }
  const tracks = currentMedia?.subtitles.filter((track) => track.displaySupported) ?? [];
  const selectedProviderQuality = providerQualityOptions.find(({ id }) => id === providerQualityId);
  const providerQualityLabel = selectedProviderQuality?.label ?? (currentMedia?.provider === "anifume" ? currentMedia.video.quality : undefined);
  const qualityLabel = providerQualityLabel ? "Quality: " + providerQualityLabel : videoHeight > 0 ? "Quality: " + videoHeight + "p" : "Quality is controlled by the source.";
  const hasAnifumeQualitySelector = controlsProvider === "anifume" && providerQualityOptions.length > 1;
  const hasHlsQualitySelector = currentMedia?.video.type === "hls" && qualityLevels.length > 1;
  const hasProviderTimeout = currentDiscovery?.providers.some(({ status }) => status === "timeout") ?? false;
  const canRetryProviderDiscovery = currentProviderDiscovery?.status === "failed" || hasProviderTimeout || !hasAvailableProvider || Boolean(error);
  const isLoading = providerLoading || loading;
  const loadingMessage = loading ? "Finding source…" : "Checking provider catalog…";
  function startPlayback() {
    if (providerDiscoveryPending || !hasAvailableProvider) return;
    if (sourceSelection !== currentSourceSelection) onSourceSelectionChange(currentSourceSelection);
    void resolve(currentSourceSelection);
  }
  const playbackNotConfirmed = providerDiscoveryPending || !hasAvailableProvider;
  return <section className="glass-panel overflow-hidden rounded-xl" aria-label={title + " player"}>
    <div className="relative flex aspect-video items-center justify-center bg-black">
      {currentMedia ? <video ref={video} controls playsInline aria-label={title + " episode " + episode} className="h-full w-full" poster={imageUrl}
        onLoadedMetadata={() => {
          const element = video.current;
          if (!element || !Number.isFinite(element.duration)) return;
          setVideoHeight(element.videoHeight);
          element.currentTime = Math.min(initial.current, Math.max(0, element.duration - 0.1));
          void element.play().catch(() => setNeedsPlay(true));
        }} onTimeUpdate={() => flush()} onPause={() => flush(true)} onSeeked={() => flush(true)} onEnded={() => completeCurrentEpisode(true)}
        onPlay={() => setNeedsPlay(false)} onError={() => setError("Playback failed or the source expired. Request a fresh source to retry.")}>
        {tracks.map((track, index) => <track key={track.language + "-" + index} kind="subtitles" src={track.url} srcLang={track.language} label={track.label} default={String(index) === subtitle} />)}
      </video> : isLoading ? <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-white">
        <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-2 border-white/35 border-t-white motion-reduce:animate-none" />
        <span>{loadingMessage}</span>
      </div> : <div className="absolute inset-0 grid place-items-center bg-cover bg-center" style={imageUrl ? { backgroundImage: 'linear-gradient(#0008,#000b), url("' + imageUrl + '")' } : undefined}>
        <button type="button" onClick={startPlayback} disabled={playbackNotConfirmed} className={`rounded-full bg-white px-6 py-3 font-bold text-black disabled:opacity-60 ${providerDiscoveryPending ? "disabled:cursor-wait" : "disabled:cursor-not-allowed"}`}>Play episode</button>
      </div>}
    </div>
    <div className="space-y-3 p-4 text-sm">
      <p className="font-semibold">Episode {episode}</p>
      {error && <p role="alert">{error}</p>}
      {needsPlay && <button type="button" onClick={() => void video.current?.play().catch(() => setError("Playback could not start. Use the video controls to retry."))} className="rounded border px-4 py-2">Play video</button>}
      <label className="flex flex-wrap items-center gap-3">Video source<select aria-label="Video source" aria-describedby="provider-availability" className="rounded border bg-[var(--bg)] p-2" value={currentSourceSelection} onChange={(event) => {
        const value = event.target.value;
        changeSource(value === "automatic" ? value : isMediaProviderId(value) ? value : "automatic");
      }}>
        <option value="automatic">Auto (Thai first)</option>
        {currentSourceSelection !== "automatic" && !currentDiscovery?.providers.some(({ id }) => id === currentSourceSelection) && <option value={currentSourceSelection} disabled>{currentSourceSelection} · Checking availability…</option>}
        {currentDiscovery?.providers.map((provider) => <option key={provider.id} value={provider.id} disabled={provider.status !== "available"}>
          {provider.label}{provider.status === "available" && provider.id === currentDiscovery.defaultProviderId ? " · Auto pick" : " · " + providerAvailabilityLabel(provider)}
        </option>)}
      </select></label>
      <section id="provider-availability" aria-label="Provider availability" className="space-y-2">
        <p className="font-medium">Provider availability</p>
        {!currentProviderDiscovery
          ? <p role="status">Checking provider availability…</p>
          : currentProviderDiscovery.status === "failed"
            ? <div className="flex flex-wrap items-center gap-3"><p role="alert">{currentProviderDiscovery.message}</p><p role="status">Provider availability could not be confirmed. Retry to check for a playable video source.</p><button type="button" onClick={() => setProviderDiscoveryAttempt((attempt) => attempt + 1)} className="rounded border px-3 py-2">Retry provider availability</button></div>
            : currentProviderDiscovery.discovery.providers.length > 0
              ? <ul className="space-y-1">{currentProviderDiscovery.discovery.providers.map((provider) => <li key={provider.id} className="flex flex-wrap gap-x-2">
                <span>{provider.label}</span><span className="text-[var(--text-soft)]">{providerAvailabilityLabel(provider)}</span>
                {provider.id === currentProviderDiscovery.discovery.defaultProviderId && provider.status === "available" && <span className="text-[var(--text-soft)]">Auto pick</span>}
                {provider.id === "anifume" && provider.qualities && provider.qualities.length > 0 && <span className="text-[var(--text-soft)]">Qualities: {provider.qualities.map(({ label }) => label).join(", ")}</span>}
              </li>)}</ul>
              : <p role="status">No provider results were returned for this episode.</p>}
        {currentProviderDiscovery?.status === "ready" && !hasAvailableProvider && <p role="status">{hasProviderTimeout
          ? "No playable video is confirmed yet. Some provider checks could not finish; retry availability."
          : "No provider confirmed a playable video for this episode. Retry provider availability."}</p>}
        {canRetryProviderDiscovery && currentProviderDiscovery?.status !== "failed" && <div className="flex flex-wrap items-center gap-3">
          {hasProviderTimeout && <p role="status">Some provider checks could not finish.</p>}
          <button type="button" onClick={() => setProviderDiscoveryAttempt((attempt) => attempt + 1)} className="rounded border px-3 py-2">Retry provider availability</button>
        </div>}
      </section>
      {shouldDiscoverOriginServers && (currentOriginDiscovery?.status === "ready"
        ? <label className="flex flex-wrap items-center gap-3">AnimeRuka server<select aria-label="AnimeRuka server" className="rounded border bg-[var(--bg)] p-2" value={selectedOriginServerId ?? currentOriginDiscovery.serverList.defaultServerId} onChange={(event) => changeOriginServer(event.target.value)}>
          {currentOriginDiscovery.serverList.servers.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        : currentOriginDiscovery?.status === "error"
          ? <div className="flex flex-wrap items-center gap-3"><p role="alert">{currentOriginDiscovery.message}</p><button type="button" onClick={() => setOriginDiscoveryAttempt((attempt) => attempt + 1)} className="rounded border px-3 py-2">Retry server discovery</button></div>
          : <p role="status">Loading AnimeRuka servers…</p>)}
      {hasAnifumeQualitySelector
        ? <label className="flex flex-wrap items-center gap-3">Video quality<select aria-label="Video quality" className="rounded border bg-[var(--bg)] p-2" value={providerQualityId ?? ""} onChange={(event) => changeAnifumeQuality(event.target.value)}>
          {!providerQualityId && <option value="" disabled>Provider default</option>}
          {providerQualityOptions.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        : hasHlsQualitySelector
          ? <label className="flex flex-wrap items-center gap-3">Video quality<select aria-label="Video quality" className="rounded border bg-[var(--bg)] p-2" value={String(qualitySelection)} onChange={(event) => {
            const level = Number(event.target.value);
            setQualitySelection(level);
            applyHlsQuality.current?.(level);
          }}><option value={-1}>Auto</option>{qualityLevels.map(({ index, label }) => <option key={index} value={index}>{label}</option>)}</select></label>
          : (controlsProvider === "anifume" || Boolean(currentMedia)) && <p className="text-[var(--text-soft)]">{qualityLabel}</p>}
      {currentMedia && <>
        {(!currentMedia.embeddedSubtitles || tracks.length > 0) && <label className="flex flex-wrap items-center gap-3">Subtitles<select aria-label="Subtitles" className="rounded border bg-[var(--bg)] p-2" value={subtitle} onChange={(event) => setSubtitle(event.target.value)}><option value="off">Off</option>{tracks.map((track, index) => <option key={index} value={index} disabled={failedTracks.includes(index)}>{track.label}{failedTracks.includes(index) ? " (unavailable)" : ""}</option>)}</select></label>}
        <p role="status" className="text-[var(--text-soft)]">{currentMedia.embeddedSubtitles ? "Thai subtitles are embedded in this video and cannot be turned off." : currentMedia.thaiStatus === "present" ? "Thai track returned for this episode. Timing is unverified." : currentMedia.thaiStatus === "absent_in_returned_tracks" ? "No Thai subtitle in the returned tracks." : currentMedia.thaiStatus === "unavailable" ? "A Thai track was returned but its URL is unavailable." : "Thai subtitle availability is unknown."} {currentMedia.subtitles.some((track) => track.format === "ass") && "ASS tracks are not supported by this player yet."} {failedTracks.length > 0 && "A subtitle failed to load; select another track or retry."}</p>
        {tracks.length > 0 && <p className="text-xs text-[var(--text-soft)]">External subtitle timing has not been verified against this video.</p>}
      </>}
      {(error || currentMedia) && <button type="button" disabled={loading || !hasAvailableProvider || providerDiscoveryPending} onClick={() => void resolve()} className="mr-3 rounded border px-4 py-2">Request fresh source</button>}
      <button type="button" onClick={() => completeCurrentEpisode()} className="rounded border px-4 py-2">Mark episode complete</button>
    </div>
  </section>;
}
