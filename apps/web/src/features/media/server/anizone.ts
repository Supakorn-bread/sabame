import "server-only";
import { providerSearchFailure } from "../resolver";
import { normalizeTitle } from "../identity";
import { normalizeLanguage } from "../language";
import { MediaError, type MediaBundle, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";
import { validatePolicyResource } from "./resource-security";

const origin = "https://anizone.to";
interface AnizoneSeries { slug: string; title: string; year: number; count: number }
interface AnizoneEpisode { number: number; title: string; url: string }
const catalogs = new Map<string, { expires: number; series: AnizoneSeries; episodes: AnizoneEpisode[] }>();
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MediaError("provider_unavailable");
  return value as Record<string, unknown>;
}
function decodeHtml(value: string): string {
  return value.replace(/&(?:quot|apos|amp|lt|gt|#39);/g, (entity) => ({ "&quot;": '\"', "&apos;": "'", "&#39;": "'", "&amp;": "&", "&lt;": "<", "&gt;": ">" })[entity]!);
}
function stringLiteral(value: string): string {
  return value.replace(/\\(u[0-9a-fA-F]{4}|[\\'"/bfnrt])/g, (_, escape: string) => escape.startsWith("u")
    ? String.fromCharCode(Number.parseInt(escape.slice(1), 16))
    : ({ "\\": "\\", "'": "'", '\"': '\"', "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" })[escape]!);
}
function jsonField(html: string, field: string): unknown {
  const expression = new RegExp(`(?:^|[\\s,{])${field}:\\s*JSON\\.parse\\('((?:\\\\.|[^'\\\\])*)'\\)`, "g");
  const values = [...decodeHtml(html).matchAll(expression)];
  if (values.length !== 1) throw new MediaError("provider_unavailable");
  try { return JSON.parse(stringLiteral(values[0][1])); } catch { throw new MediaError("provider_unavailable"); }
}
function titles(value: unknown): string[] {
  return Object.values(record(value)).filter((title): title is string => typeof title === "string" && Boolean(title.trim()));
}
function controlUrl(value: string, path: string): string {
  let url: URL;
  try { url = new URL(value, origin); } catch { throw new MediaError("mapping_required"); }
  if (!["https:", "http:"].includes(url.protocol) || url.hostname !== "anizone.to" || url.port || url.username || url.password || url.pathname !== path || url.search || url.hash) throw new MediaError("mapping_required");
  return new URL(path, origin).href;
}
async function readPage(url: string, signal: AbortSignal): Promise<string> {
  if (new URL(url).origin !== origin) throw new MediaError("resource_host_not_allowed");
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body) throw new MediaError("provider_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_097_152) throw new MediaError("resource_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
function parseEpisodes(html: string, series: AnizoneSeries): AnizoneEpisode[] {
  const items = jsonField(html, "items");
  if (!Array.isArray(items) || items.length > 2000) throw new MediaError("provider_unavailable");
  return items.flatMap((value) => {
    const item = record(value);
    if (item.type !== "Regular Episode") return [];
    const number = Number(item.slug);
    if (typeof item.slug !== "string" || !/^[1-9]\d*$/.test(item.slug) || !Number.isSafeInteger(number) || number > series.count) throw new MediaError("mapping_required");
    return [{ number, title: titles(item.title_list)[0] || `Episode ${number}`, url: controlUrl(String(item.url), `/anime/${series.slug}/${item.slug}`) }];
  });
}
function navigationEpisodes(html: string, series: AnizoneSeries): AnizoneEpisode[] {
  const episodes: AnizoneEpisode[] = [];
  for (const [anchor] of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)) {
    if (!anchor.includes("epsTitles:")) continue;
    const href = /\bhref="([^"]+)"/.exec(anchor)?.[1];
    if (!href) continue;
    const url = new URL(decodeHtml(href), origin);
    const numberText = new RegExp(`^/anime/${series.slug}/([1-9]\\d*)$`).exec(url.pathname)?.[1];
    if (!numberText) continue;
    const number = Number(numberText);
    if (!Number.isSafeInteger(number) || number > series.count) throw new MediaError("mapping_required");
    episodes.push({ number, title: titles(jsonField(anchor, "epsTitles"))[0] || `Episode ${number}`, url: controlUrl(url.href, `/anime/${series.slug}/${numberText}`) });
  }
  return episodes;
}
async function identify(animeId: string, signal: AbortSignal) {
  signal.throwIfAborted();
  const cached = catalogs.get(animeId);
  if (cached && cached.expires > Date.now()) return cached;
  const metadata = await fetchMetadata(animeId, signal);
  if (!metadata.year || !metadata.episodeCount || metadata.episodeCount > 2000) throw new MediaError("mapping_required");
  const aliases = [...new Map([metadata.title.romaji, metadata.title.english, metadata.title.userPreferred, ...(metadata.synonyms ?? []), metadata.title.native]
    .filter((title): title is string => typeof title === "string" && Boolean(title.trim())).map((title) => [normalizeTitle(title), title])).values()];
  const canonical = new Set(aliases.map(normalizeTitle));
  const searches = await Promise.allSettled(aliases.slice(0, 3).map(async (title) => {
    const url = new URL("/anime", origin); url.searchParams.set("search", title);
    const items = jsonField(await readPage(url.href, signal), "items");
    if (!Array.isArray(items) || items.length > 1000) throw new MediaError("provider_unavailable");
    return items;
  }));
  signal.throwIfAborted();
  const matches = new Map<string, AnizoneSeries>();
  for (const result of searches) {
    if (result.status !== "fulfilled") continue;
    for (const value of result.value) {
      const item = record(value);
      if (typeof item.main_title !== "string" || ![item.main_title, ...titles(item.title_list)].some((title) => canonical.has(normalizeTitle(title)))) continue;
      if (item.start_year !== metadata.year || item.episode_count !== metadata.episodeCount) continue;
      if (typeof item.slug !== "string" || !/^[a-z0-9]{6,32}$/.test(item.slug)) throw new MediaError("mapping_required");
      controlUrl(String(item.url), `/anime/${item.slug}`);
      matches.set(item.slug, { slug: item.slug, title: item.main_title, year: metadata.year, count: metadata.episodeCount });
    }
  }
  if (matches.size > 1) throw new MediaError("mapping_required");
  const series = matches.values().next().value;
  if (!series) throw new MediaError(providerSearchFailure(searches));
  const page = await readPage(new URL(`/anime/${series.slug}`, origin).href, signal);
  if (!titles(jsonField(page, "anmTitles")).some((title) => canonical.has(normalizeTitle(title)))) throw new MediaError("mapping_required");
  let episodes = parseEpisodes(page, series);
  if (/hasMore:\s*true/.test(page) && episodes.length) episodes = navigationEpisodes(await readPage(episodes[0].url, signal), series);
  if (!episodes.length) throw new MediaError("no_source");
  if (new Set(episodes.map((episode) => episode.number)).size !== episodes.length) throw new MediaError("mapping_required");
  episodes.sort((a, b) => a.number - b.number);
  const identified = { series, episodes, expires: Date.now() + 5 * 60_000 };
  if (catalogs.size >= 200) catalogs.delete(catalogs.keys().next().value!);
  catalogs.set(animeId, identified);
  return identified;
}
export async function getAnizoneEpisodes(animeId: string, signal: AbortSignal) {
  return (await identify(animeId, signal)).episodes.map(({ number, title }) => ({ number, title }));
}
export const anizoneAdapter: MediaProvider = {
  id: "anizone",
  requiresEnglishSubtitles: true,
  async resolve(request, signal): Promise<MediaBundle> {
    const { episodes } = await identify(request.animeId, signal);
    const episode = episodes.find((item) => item.number === request.episodeNumber);
    if (!episode) throw new MediaError("episode_unavailable");
    const html = await readPage(episode.url, signal);
    const player = /vidstackPlayer\(JSON\.parse\('((?:\\.|[^'\\])*)'\)/g;
    const players = [...decodeHtml(html).matchAll(player)];
    if (players.length !== 1) throw new MediaError("no_source");
    let config: Record<string, unknown>;
    try { config = record(JSON.parse(stringLiteral(players[0][1]))); } catch { throw new MediaError("no_source"); }
    if (typeof config.src !== "string") throw new MediaError("no_source");
    const video = validatePolicyResource(config.src, "anizone", "hls");
    const asset = video.pathname.split("/")[1];
    const subtitles = (Array.isArray(config.subtitles) ? config.subtitles : []).slice(0, 30).flatMap((value) => {
      const track = record(value);
      if (typeof track.file !== "string" || !["ass", "vtt", "srt"].includes(String(track.format))) return [];
      const url = validatePolicyResource(track.file, "anizone", "subtitle");
      if (url.pathname.split("/")[1] !== asset) throw new MediaError("mapping_required");
      return [{ url: url.href, language: normalizeLanguage(typeof track.language === "string" ? track.language : ""), label: typeof track.title === "string" ? track.title : undefined, format: track.format as "ass" | "vtt" | "srt" }];
    });
    if (!subtitles.some((track) => track.language === "en")) throw new MediaError("english_subtitle_unavailable");
    return { video: { url: video.href, type: "hls" }, subtitles };
  },
};
