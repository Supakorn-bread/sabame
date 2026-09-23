import "server-only";
import type { IMediaMetadata, IMetaSearchResult } from "anime-sdk";
import { ANIME_CATALOG, getAnimeById } from "@/features/tracker/seed";
import type { Anime } from "@/features/tracker/types";
import { normalizeTitle } from "../identity";
import { MediaError } from "../types";
import { metadataProvider } from "./sdk";
import seedArtwork from "@/features/tracker/seed-artwork.json";

class TtlCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  get(key: string) { const item = this.values.get(key); if (item && item.expires > Date.now()) return item.value; this.values.delete(key); }
  set(key: string, value: T) { if (this.values.size >= 100) this.values.delete(this.values.keys().next().value!); this.values.set(key, { value, expires: Date.now() + 5 * 60_000 }); }
}
type SearchRecord = IMetaSearchResult | IMediaMetadata;
const searches = new TtlCache<SearchRecord[]>();
const details = new TtlCache<IMediaMetadata>();
type SeedId = keyof typeof seedArtwork;
function seedMalId(animeId: string) {
  return animeId in seedArtwork ? seedArtwork[animeId as SeedId].malId : undefined;
}
function seedMetadata(seed: Anime, malId: number): IMediaMetadata {
  return {
    id: `mal:anime:${malId}`,
    providerId: "mal",
    catalogType: "ANIME",
    title: { english: seed.title, romaji: seed.subtitle || undefined },
    description: seed.synopsis,
    cover: seed.coverUrl ? { large: seed.coverUrl } : undefined,
    episodeCount: seed.totalEpisodes ?? undefined,
    durationMinutes: seed.episodeMinutes || undefined,
    genres: seed.genres,
    score: seed.score ? Number(seed.score) * 10 : undefined,
    mappings: { mal: malId },
  };
}
function names(item: IMetaSearchResult) { return Object.values(item.title).filter((name): name is string => typeof name === "string" && Boolean(name)); }
function seedFor(item: IMetaSearchResult) {
  const titles = names(item).map(normalizeTitle);
  const count = (item as IMediaMetadata).episodeCount;
  const matches = ANIME_CATALOG.filter((seed) => titles.includes(normalizeTitle(seed.title)) && (count === undefined || count === seed.totalEpisodes));
  return matches.length === 1 ? matches[0] : undefined;
}
export function catalogAnime(item: IMetaSearchResult | IMediaMetadata): Anime {
  const full = item as IMediaMetadata;
  const seed = seedFor(item);
  const mal = item.mappings?.mal ?? Number(item.id.split(":").at(-1));
  if (!Number.isSafeInteger(mal) || mal < 1 || item.isAdult || item.catalogType !== "ANIME") throw new MediaError("invalid_metadata");
  const cover = item.cover?.large ?? item.cover?.medium;
  return {
    id: `mal-${mal}`, title: item.title.english ?? item.title.romaji ?? item.title.native ?? `Anime ${mal}`,
    subtitle: item.title.romaji ?? "", synopsis: (full.description ?? "").replace(/<[^>]*>/g, "").slice(0, 10_000),
    genres: full.genres ?? [], totalEpisodes: full.episodeCount && full.episodeCount > 0 ? full.episodeCount : null,
    episodeMinutes: full.durationMinutes ?? 0, accent: seed?.accent ?? "violet",
    coverUrl: cover?.startsWith("https://cdn.myanimelist.net/") ? cover : undefined,
    score: typeof item.score === "number" ? (item.score / 10).toFixed(2) : undefined,
  };
}
function safeRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

export function officialMalMetadata(value: unknown): IMediaMetadata {
  const node = safeRecord(value);
  if (!node) throw new MediaError("invalid_metadata");
  const id = node?.id;
  const title = node?.title;
  if (!Number.isSafeInteger(id) || (id as number) < 1 || typeof title !== "string" || !title.trim()) throw new MediaError("invalid_metadata");
  const alternatives = safeRecord(node.alternative_titles);
  const english = typeof alternatives?.en === "string" && alternatives.en.trim() ? alternatives.en : undefined;
  const native = typeof alternatives?.ja === "string" && alternatives.ja.trim() ? alternatives.ja : undefined;
  const synonyms = Array.isArray(alternatives?.synonyms) ? alternatives.synonyms.filter((name): name is string => typeof name === "string" && Boolean(name.trim())).slice(0, 20) : [];
  const year = typeof node.start_date === "string" && /^\d{4}(?:-|$)/.test(node.start_date) ? Number(node.start_date.slice(0, 4)) : undefined;
  const picture = safeRecord(node?.main_picture);
  const mean = typeof node.mean === "number" && Number.isFinite(node.mean) && node.mean >= 0 && node.mean <= 10 ? node.mean : undefined;
  const episodeCount = Number.isSafeInteger(node.num_episodes) && (node.num_episodes as number) > 0 ? node.num_episodes as number : undefined;
  const genres = Array.isArray(node.genres) ? node.genres.flatMap((genre) => {
    const name = safeRecord(genre)?.name;
    return typeof name === "string" && name.length <= 80 ? [name] : [];
  }).slice(0, 20) : undefined;
  return {
    id: `mal:anime:${id}`,
    providerId: "mal",
    catalogType: "ANIME",
    title: { english: english ?? title, romaji: title, native },
    synonyms,
    year,
    description: typeof node.synopsis === "string" ? node.synopsis : undefined,
    cover: {
      large: typeof picture?.large === "string" ? picture.large : undefined,
      medium: typeof picture?.medium === "string" ? picture.medium : undefined,
    },
    episodeCount,
    durationMinutes: typeof node.average_episode_duration === "number" && node.average_episode_duration > 0 ? Math.round(node.average_episode_duration / 60) : undefined,
    genres,
    score: mean === undefined ? undefined : mean * 10,
    isAdult: node.nsfw === "black",
    mappings: { mal: id as number },
  };
}

const MAL_FIELDS = "id,title,main_picture,alternative_titles,start_date,synopsis,mean,num_episodes,genres,average_episode_duration,nsfw";

async function searchOfficialMal(query: string, signal: AbortSignal, clientId: string) {
  const params = new URLSearchParams({
    q: query,
    limit: "20",
    fields: MAL_FIELDS,
  });
  const response = await fetch(`https://api.myanimelist.net/v2/anime?${params}`, {
    headers: { Accept: "application/json", "X-MAL-CLIENT-ID": clientId },
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`mal_search_${response.status}`);
  const root = safeRecord(await response.json());
  if (!root || !Array.isArray(root.data)) throw new MediaError("invalid_metadata");
  return root.data.slice(0, 20).flatMap((entry) => {
    try { return [officialMalMetadata(safeRecord(entry)?.node)]; }
    catch { return []; }
  });
}

async function fetchOfficialMal(malId: number, signal: AbortSignal, clientId: string) {
  const response = await fetch(`https://api.myanimelist.net/v2/anime/${malId}?${new URLSearchParams({ fields: MAL_FIELDS })}`, {
    headers: { Accept: "application/json", "X-MAL-CLIENT-ID": clientId },
    signal,
    cache: "no-store",
    redirect: "error",
  });
  if (response.status === 404) throw new MediaError("anime_not_found");
  if (!response.ok) throw new MediaError("metadata_unavailable");
  const metadata = officialMalMetadata(await response.json());
  if (metadata.mappings?.mal !== malId) throw new MediaError("invalid_metadata");
  return metadata;
}

async function searchRaw(query: string, signal: AbortSignal) {
  const key = query.trim().toLowerCase();
  const clientId = process.env.MAL_CLIENT_ID?.trim();
  const cacheKey = `${clientId ? "official-mal" : "anime-sdk"}:${key}`;
  const cached = searches.get(cacheKey);
  if (cached) return cached;
  const result = clientId
    ? await searchOfficialMal(query, signal, clientId)
    : await metadataProvider.search(query, { signal });
  const filtered = result.filter((hit) => !hit.isAdult && hit.catalogType === "ANIME").slice(0, 20);
  searches.set(cacheKey, filtered);
  return filtered;
}
export async function searchCatalog(query: string, signal: AbortSignal) {
  return (await searchRaw(query, signal)).map(catalogAnime);
}
export async function fetchMetadata(animeId: string, signal: AbortSignal): Promise<IMediaMetadata> {
  signal.throwIfAborted();
  const clientId = process.env.MAL_CLIENT_ID?.trim();
  const cacheKey = `${clientId ? "official-mal" : "anime-sdk"}:${animeId}`;
  const cached = details.get(cacheKey);
  if (cached) return cached;
  let urn: string;
  const seed = getAnimeById(animeId);
  if (/^mal-[1-9]\d{0,7}$/.test(animeId)) urn = `mal:anime:${animeId.slice(4)}`;
  else if (seed) {
    const malId = seedMalId(animeId);
    if (!malId) throw new MediaError("mapping_required");
    urn = `mal:anime:${malId}`;
  } else throw new MediaError("anime_not_found");
  let metadata: IMediaMetadata;
  try {
    metadata = clientId
      ? await fetchOfficialMal(Number(urn.split(":").at(-1)), signal, clientId)
      : await metadataProvider.fetchMediaInfo(urn, { signal, strictEpisodeMatching: true });
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    if (error instanceof MediaError && ["invalid_metadata", "anime_not_found"].includes(error.code)) throw error;
    if (!seed) throw new MediaError("metadata_unavailable");
    metadata = seedMetadata(seed, seedMalId(animeId)!);
  }
  if (metadata.isAdult || metadata.catalogType !== "ANIME") throw new MediaError("anime_not_found");
  if (seed && seed.totalEpisodes !== metadata.episodeCount) throw new MediaError("mapping_required");
  signal.throwIfAborted();
  details.set(cacheKey, metadata);
  return metadata;
}
export async function getCatalogDetail(animeId: string, signal: AbortSignal) {
  const anime = catalogAnime(await fetchMetadata(animeId, signal));
  // Only an explicitly requested demo route may retain its legacy ID.
  return getAnimeById(animeId) ? { ...anime, id: animeId } : anime;
}
export async function getCatalogEpisodes(animeId: string, signal: AbortSignal) {
  const metadata = await fetchMetadata(animeId, signal);
  return metadata.streamingEpisodes?.map(({ number, title }) => ({ number, title })) ??
    Array.from({ length: Math.min(metadata.episodeCount ?? 0, 2000) }, (_, index) => ({ number: index + 1, title: `Episode ${index + 1}` }));
}
