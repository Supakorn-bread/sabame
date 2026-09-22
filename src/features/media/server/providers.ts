import "server-only";
import { exactEpisode, normalizeTitle } from "../identity";
import { normalizeLanguage } from "../language";
import { MediaError, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";
import { animeParadiseSeedSegment, hasAnimeParadiseSeedConfiguration } from "./seed-provider-mappings";
import { animeParadise, mappingClient } from "./sdk";

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
      const titles = Object.values(metadata.title).filter((value): value is string => typeof value === "string" && Boolean(value));
      const aliases = new Set(titles.map(normalizeTitle));
      const [mapping, searches] = await Promise.all([
        mappingClient.resolveProviderMediaId(metadata, animeParadise, options),
        Promise.all(titles.slice(0, 2).map((title) => animeParadise.search(title, options))),
      ]);
      if (!mapping && searches.every((results) => results.length === 0)) throw new MediaError("no_source");
      if (!mapping || !aliases.has(normalizeTitle(mapping.matchedTitle))) throw new MediaError("mapping_required");
      // SDK fuzzy scores alone cannot establish season identity. Reject competing exact matches.
      const matches = new Map(searches.flat().filter((hit) => aliases.has(normalizeTitle(hit.title)) && (!hit.year || !metadata.year || hit.year === metadata.year)).map((hit) => [hit.id, hit]));
      const urn = `animeparadise:${mapping.rawMediaId}`;
      if (matches.size !== 1 || !matches.has(urn)) throw new MediaError("mapping_required");
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
