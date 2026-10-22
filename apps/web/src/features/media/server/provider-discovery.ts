import "server-only";
import { mediaPreference, resolveProviderCandidates, type MediaResolutionOptions } from "../resolver";
import { type EpisodeRequest, type MediaProvider, type MediaProviderDiscovery, type MediaProviderAvailability, type MediaProviderId } from "../types";

const labels: Record<MediaProviderId, string> = { animeparadise: "AnimeParadise", hianime: "HiAnime", anizone: "Anizone", anifume: "Anifume (Thai)", animeruka: "AnimeRuka" };
export async function discoverMediaProviders(episode: EpisodeRequest, providers: MediaProvider[], options: MediaResolutionOptions): Promise<MediaProviderDiscovery> {
  const candidates = await resolveProviderCandidates(episode, providers, options);
  const rows: MediaProviderAvailability[] = candidates.map((candidate) => {
    const id = candidate.provider as MediaProviderId;
    const identity = { id, label: labels[id] };
    if (!("media" in candidate)) return { ...identity, status: candidate.code === "timeout" || candidate.code === "resource_timeout" ? "timeout" : "unavailable", code: candidate.code };
    const result = candidate.media;
    return { ...identity, status: "available", subtitleLanguage: result.selectionReason === "thai_subtitle" ? "th" : result.selectionReason === "english_subtitle" ? "en" : "none",
      ...(result.selectedServerId ? { selectedServerId: result.selectedServerId } : {}),
      ...(result.qualities ? { qualities: result.qualities, selectedQualityId: result.selectedQualityId } : {}) };
  });
  const ready = candidates.flatMap((candidate) => "media" in candidate ? [candidate.media] : []).sort((left, right) => mediaPreference(right) - mediaPreference(left));
  return { metadata: { animeId: episode.animeId, episodeNumber: episode.episodeNumber }, providers: rows,
    ...(ready[0] ? { defaultProviderId: ready[0].provider as MediaProviderId } : {}) };
}
