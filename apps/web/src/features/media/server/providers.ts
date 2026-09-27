import "server-only";
import { exactEpisode, normalizeTitle } from "../identity";
import { normalizeLanguage } from "../language";
import { MediaError, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";
import { animeParadiseSeedSegment, hasAnimeParadiseSeedConfiguration } from "./seed-provider-mappings";
import { animeParadise } from "./sdk";

async function resolveAnimeParadiseUnit(urn: string, episodeNumber: number, expectedUnitCount: number | undefined, options: { signal: AbortSignal; strictEpisodeMatching: boolean; episodeAbsoluteMatching: "never" }) {
  const units = await animeParadise.fetchContentUnits(urn, options);
  if (expectedUnitCount !== undefined && units.length !== expectedUnitCount) throw new MediaError("mapping_required");
  const unit = exactEpisode(units, episodeNumber, expectedUnitCount);
  if (!unit) throw new MediaError("episode_unavailable");
  return unit;
}

export const animeParadiseAdapter: MediaProvider = {
  id: "animeparadise",
  async resolve(episode, signal) {
    const options = { signal, strictEpisodeMatching: true, episodeAbsoluteMatching: "never" as const };
    const seedSegment = animeParadiseSeedSegment(episode.animeId, episode.episodeNumber);
    let unit;
    if (hasAnimeParadiseSeedConfiguration(episode.animeId)) {
      if (!seedSegment) throw new MediaError("no_source");
      unit = await resolveAnimeParadiseUnit(
        `animeparadise:${seedSegment.rawMediaId}`,
        episode.episodeNumber - seedSegment.providerEpisodeOffset,
        seedSegment.expectedUnitCount,
        options,
      );
    } else {
      const metadata = await fetchMetadata(episode.animeId, signal);
      const titles = [...new Map([
        metadata.title.english, metadata.title.romaji, metadata.title.userPreferred,
        ...(metadata.synonyms ?? []), metadata.title.native,
      ].filter((value): value is string => typeof value === "string" && Boolean(value.trim()))
        .map((title) => [normalizeTitle(title), title])).values()];
      const aliases = new Set(titles.map(normalizeTitle));
      if (!titles.length) throw new MediaError("mapping_required");
      // Search each alias once. Exact results establish identity without a second
      // fuzzy search pass, which can miss synonyms or exhaust the request budget.
      const searches = await Promise.all(titles.slice(0, 4).map((title) => animeParadise.search(title, options)));
      if (searches.every((results) => results.length === 0)) throw new MediaError("no_source");
      const matches = new Map(searches.flat().filter((hit) => hit.catalogType === "ANIME" && aliases.has(normalizeTitle(hit.title)) && (!hit.year || !metadata.year || hit.year === metadata.year)).map((hit) => [hit.id, hit]));
      if (matches.size !== 1) throw new MediaError("mapping_required");
      const urn = matches.keys().next().value!;
      unit = await resolveAnimeParadiseUnit(urn, episode.episodeNumber, metadata.episodeCount, options);
    }
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
export const mediaProviders: MediaProvider[] = [animeParadiseAdapter];
