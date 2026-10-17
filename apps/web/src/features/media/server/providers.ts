import "server-only";
import { exactEpisode, normalizeTitle } from "../identity";
import { normalizeLanguage } from "../language";
import { MediaError, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";
import { getHianimeEpisodes, hianimeAdapter } from "./hianime";
import { animeParadiseSeedSegments, hasAnimeParadiseSeedConfiguration } from "./seed-provider-mappings";
import { animeParadise } from "./sdk";

async function fetchAnimeParadiseUnits(animeId: string, signal: AbortSignal, episodeNumber?: number) {
  const options = { signal, strictEpisodeMatching: true, episodeAbsoluteMatching: "never" as const };
  if (hasAnimeParadiseSeedConfiguration(animeId)) {
    const segments = animeParadiseSeedSegments(animeId).filter((segment) => episodeNumber === undefined || episodeNumber >= segment.episodeStart && episodeNumber <= segment.episodeEnd);
    if (!segments.length) throw new MediaError("no_source");
    return (await Promise.all(segments.map(async (segment) => {
      const units = await animeParadise.fetchContentUnits(`animeparadise:${segment.rawMediaId}`, options);
      if (units.length !== segment.expectedUnitCount || units.some((unit) => unit.number < 1 || unit.number > segment.expectedUnitCount)) throw new MediaError("mapping_required");
      return units.map((unit) => ({ ...unit, number: unit.number + segment.providerEpisodeOffset }));
    }))).flat();
  }
  const metadata = await fetchMetadata(animeId, signal);
  const titles = [...new Map([
    metadata.title.english, metadata.title.romaji, metadata.title.userPreferred,
    ...(metadata.synonyms ?? []), metadata.title.native,
  ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
    .map((title) => [normalizeTitle(title), title])).values()];
  const aliases = new Set(titles.map(normalizeTitle));
  if (!titles.length) throw new MediaError("mapping_required");
  const searches = await Promise.allSettled(titles.slice(0, 4).map((title) => animeParadise.search(title, options)));
  signal.throwIfAborted();
  const hits = searches.flatMap((search) => search.status === "fulfilled" ? search.value : []);
  if (!hits.length) throw new MediaError(searches.some((search) => search.status === "rejected") ? "provider_unavailable" : "no_source");
  const matches = new Map(hits.filter((hit) => hit.catalogType === "ANIME" && aliases.has(normalizeTitle(hit.title)) && (!hit.year || !metadata.year || hit.year === metadata.year)).map((hit) => [hit.id, hit]));
  if (matches.size !== 1) throw new MediaError("mapping_required");
  const units = await animeParadise.fetchContentUnits(matches.keys().next().value!, options);
  const episodeCount = metadata.episodeCount;
  if (episodeCount && (units.length > episodeCount || units.some((unit) => unit.number > episodeCount))) throw new MediaError("mapping_required");
  return units;
}

export async function getProviderEpisodes(animeId: string, signal: AbortSignal) {
  try {
    const units = await fetchAnimeParadiseUnits(animeId, signal);
    const episodes = units.filter((unit) => Number.isSafeInteger(unit.number) && unit.number > 0 && exactEpisode(units, unit.number))
      .sort((left, right) => left.number - right.number)
      .slice(0, 2000)
      .map(({ number, title }) => ({ number, title }));
    if (episodes.length) return episodes;
  } catch { signal.throwIfAborted(); }
  return getHianimeEpisodes(animeId, signal);
}

export const animeParadiseAdapter: MediaProvider = {
  id: "animeparadise",
  async resolve(episode, signal) {
    const options = { signal, strictEpisodeMatching: true, episodeAbsoluteMatching: "never" as const };
    const units = await fetchAnimeParadiseUnits(episode.animeId, signal, episode.episodeNumber);
    const unit = exactEpisode(units, episode.episodeNumber);
    if (!unit) throw new MediaError("episode_unavailable");
    const payload = await animeParadise.resolveStream(unit.id, "sub", options);
    if (payload.type !== "video" || !Array.isArray(payload.streams)) throw new MediaError("invalid_video");
    const stream = payload.streams.find((item) => typeof item.sourceUrl === "string" && item.sourceUrl.startsWith("https://"));
    if (!stream) throw new MediaError("no_source");
    return { video: { url: stream.sourceUrl, type: stream.isHLS ? "hls" : "mp4" },
      subtitles: stream.subtitles?.filter((track) => typeof track.url === "string").map((track) => ({
        ...track,
        // AP SDK 1.1.0 synthesizes language with label.slice(0,2). Trust recognized labels only.
        language: normalizeLanguage(track.label),
      })) };
  },
};
/** Enable providers only after their adapter and delivery host policy have been verified. */
export const mediaProviders: MediaProvider[] = [animeParadiseAdapter, hianimeAdapter];
