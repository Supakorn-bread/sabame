import "server-only";
import { catalogAnime, officialMalMetadata } from "@/features/media/server/catalog";
import { MediaError } from "@/features/media/types";
import { seasons, type SeasonSelection, type SeasonalAnime, type SeasonalResult } from "../model";

const fields = "id,title,main_picture,alternative_titles,synopsis,mean,num_episodes,average_episode_duration,genres,studios,media_type,start_date,start_season,num_list_users,nsfw";
const cache = new Map<string, { expires: number; value: SeasonalResult }>();
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function names(value: unknown) {
  return Array.isArray(value) ? value.flatMap((item) => typeof record(item).name === "string" ? [String(record(item).name).slice(0, 80)] : []).slice(0, 10) : [];
}
function normalize(value: unknown, selection: SeasonSelection, jikan: boolean): SeasonalAnime | null {
  const source = record(value);
  const node = jikan ? {
    ...source, id: source.mal_id, title: source.title,
    alternative_titles: { en: source.title_english, ja: source.title_japanese },
    main_picture: { large: record(record(source.images).jpg).large_image_url },
    num_episodes: source.episodes, mean: source.score, nsfw: String(source.rating).startsWith("Rx") ? "black" : "white",
    media_type: String(source.type ?? "unknown").toLowerCase().replaceAll(" ", "_"),
    start_date: record(source.aired).from, num_list_users: source.members,
  } : source;
  try {
    const metadata = officialMalMetadata(node);
    if (metadata.isAdult) return null;
    const anime = catalogAnime(metadata);
    const startDate = typeof node.start_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(node.start_date) ? node.start_date.slice(0, 10) : undefined;
    const firstDay = `${selection.year}-${String(seasons.findIndex((item) => item.value === selection.season) * 3 + 1).padStart(2, "0")}-01`;
    return { ...anime, format: typeof node.media_type === "string" ? node.media_type : "unknown", studios: names(node.studios), startDate,
      members: typeof node.num_list_users === "number" && Number.isFinite(node.num_list_users) ? Math.max(0, node.num_list_users) : 0,
      continuing: Boolean(startDate && startDate < firstDay) };
  } catch { return null; }
}

export async function fetchSeasonalCatalog(selection: SeasonSelection, page: number, signal: AbortSignal): Promise<SeasonalResult> {
  signal.throwIfAborted();
  const clientId = process.env.MAL_CLIENT_ID?.trim();
  const key = `${clientId ? "mal" : "jikan"}:${selection.year}:${selection.season}:${page}`;
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const params = new URLSearchParams(clientId
    ? { limit: "500", offset: String((page - 1) * 500), sort: "anime_num_list_users", fields }
    : { page: String(page), limit: "25", sfw: "true" });
  const url = clientId ? `https://api.myanimelist.net/v2/anime/season/${selection.year}/${selection.season}?${params}`
    : `https://api.jikan.moe/v4/seasons/${selection.year}/${selection.season}?${params}`;
  const response = await fetch(url, { headers: { Accept: "application/json", ...(clientId ? { "X-MAL-CLIENT-ID": clientId } : {}) }, cache: "no-store", redirect: "error", signal });
  if (!response.ok) throw new MediaError("seasonal_unavailable");
  const payload = record(await response.json());
  if (!Array.isArray(payload.data)) throw new MediaError("invalid_metadata");
  const items = new Map<string, SeasonalAnime>();
  for (const row of payload.data.slice(0, 500)) {
    const anime = normalize(clientId ? record(row).node : row, selection, !clientId);
    if (anime) items.set(anime.id, anime);
  }
  // Follow only a page number generated here, never an upstream-provided URL.
  const hasNext = clientId ? Boolean(record(payload.paging).next) : record(payload.pagination).has_next_page === true;
  const result = { items: [...items.values()], nextPage: hasNext ? page + 1 : null };
  signal.throwIfAborted();
  if (cache.size >= 24) cache.delete(cache.keys().next().value!);
  cache.set(key, { value: result, expires: Date.now() + 5 * 60_000 });
  return result;
}
