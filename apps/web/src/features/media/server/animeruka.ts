import "server-only";
import { providerSearchFailure } from "../resolver";
import { normalizeTitle } from "../identity";
import { MediaError, type EpisodeRequest, type MediaProvider, type MediaServerList } from "../types";
import { fetchMetadata } from "./catalog";
import { fetchResource } from "./resource-fetch";
import { validatePolicyResource } from "./resource-security";

const origin = "https://animeruka.com";
interface Episode { number: number; title: string; url: string }
interface Server { id: string; label: string; post: string; type: "tv" }
interface EpisodeControls { servers: Server[]; api: string; version?: string }

function decodeHtml(value: string) {
  return value.replace(/&(?:quot|amp|apos|lt|gt|#\d+|#x[a-f0-9]+);/gi, (entity) => {
    const known: Record<string, string> = { "&quot;": '"', "&amp;": "&", "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (known[entity]) return known[entity];
    const number = entity.startsWith("&#x") ? parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return Number.isInteger(number) && number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}
function text(value: string) { return decodeHtml(value.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim(); }
function attributes(tag: string) {
  return new Map([...tag.matchAll(/([a-z][a-z0-9_-]*)\s*=\s*(["'])(.*?)\2/gi)].map((match) => [match[1], decodeHtml(match[3])]));
}
function controlUrl(value: string) { return validatePolicyResource(new URL(value, origin).href, "animeruka"); }
async function readPage(url: URL, signal: AbortSignal) {
  const result = await fetchResource(url.href, AbortSignal.any([signal, AbortSignal.timeout(8_000)]), { policy: "animeruka", maxBytes: 2_097_152 });
  if (result.url !== url.href) throw new MediaError("provider_unavailable");
  return result.body.toString("utf8");
}
function anchors(html: string) {
  return [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].flatMap((match) => {
    const href = attributes(match[1]).get("href");
    return href ? [{ href, title: text(match[2]) }] : [];
  });
}
function canonicalProviderTitle(value: string): string | undefined {
  const title = value.replace(/[\u0E00-\u0E7F][\s\S]*$/, "").replace(/[\s([\-]+$/, "").trim();
  if (!title) return;
  const thaiSeasons = [...value.matchAll(/ภาค\s*([1-9]\d*)/g)].map((match) => Number(match[1]));
  const namedSeason = /\b(?:season|part)\s*([1-9]\d*)\s*$/i.exec(title)?.[1]
    ?? /\b([1-9]\d*)(?:st|nd|rd|th)\s+season\s*$/i.exec(title)?.[1];
  if (thaiSeasons.length > 1 || thaiSeasons.length === 1 && thaiSeasons[0] !== (namedSeason ? Number(namedSeason) : 1)) return;
  return title;
}
function seriesTitle(value: string) {
  const match = /^(.+?)\s+ซับไทย(?:\s+(ยังไม่จบ\s*\(อัพเดตตอนล่าสุด\)|จบแล้ว|จบ))?$/.exec(value);
  const title = match && canonicalProviderTitle(match[1]);
  return title ? { title, ongoing: match![2]?.startsWith("ยังไม่จบ") === true } : undefined;
}
function matchingTitle(value: string) {
  const normalized = normalizeTitle(value);
  const roman: Record<string, string> = { ii: "2", iii: "3", iv: "4" };
  return normalized.replace(/\s+(?:season\s+([2-4])|(ii|iii|iv))$/, (_, season: string | undefined, numeral: string | undefined) => ` season ${season ?? roman[numeral!]}`);
}
async function identify(request: EpisodeRequest, signal: AbortSignal): Promise<Episode> {
  const metadata = await fetchMetadata(request.animeId, signal);
  if (metadata.format && metadata.format !== "TV" || metadata.episodeCount && metadata.episodeCount > 2000) throw new MediaError("mapping_required");
  const aliases = [...new Map([metadata.title.english, metadata.title.romaji, metadata.title.userPreferred, ...(metadata.synonyms ?? [])]
    .filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((title) => [normalizeTitle(title), title])).values()];
  if (!aliases.length) throw new MediaError("mapping_required");
  const canonical = new Set(aliases.map(matchingTitle));
  const searches = await Promise.allSettled(aliases.slice(0, 3).map((alias) => {
    const url = new URL(origin); url.searchParams.set("s", alias);
    return readPage(controlUrl(url.href), signal);
  }));
  signal.throwIfAborted();
  const matches = new Map<string, string>();
  for (const search of searches) {
    if (search.status !== "fulfilled") continue;
    for (const anchor of anchors(search.value)) {
      const series = seriesTitle(anchor.title);
      if (!series || !canonical.has(matchingTitle(series.title))) continue;
      const url = controlUrl(anchor.href);
      if (url.origin !== origin || !url.pathname.startsWith("/anime/")) throw new MediaError("mapping_required");
      matches.set(url.href, series.title);
    }
  }
  if (matches.size > 1) throw new MediaError("mapping_required");
  const match = matches.entries().next().value;
  if (!match) throw new MediaError(providerSearchFailure(searches));
  const [url, title] = match;
  const html = await readPage(controlUrl(url), signal);
  const series = seriesTitle(text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? ""));
  if (!series || normalizeTitle(series.title) !== normalizeTitle(title)) throw new MediaError("mapping_required");
  const episodes = new Map<number, Episode>();
  for (const anchor of anchors(html)) {
    const episode = /^(.+?)\s+ตอนที่\s+([1-9]\d*)(?:\s*\(([1-9]\d*)\))?\s+ซับไทย$/.exec(anchor.title);
    const episodeSeries = episode && canonicalProviderTitle(episode[1]);
    if (!episode || !episodeSeries || normalizeTitle(episodeSeries) !== normalizeTitle(series.title)) continue;
    const url = controlUrl(anchor.href);
    if (url.origin !== origin || !url.pathname.startsWith("/ep/")) throw new MediaError("mapping_required");
    const number = Number(episode[2]);
    if (number > 2000 || metadata.episodeCount && number > metadata.episodeCount || episodes.has(number) && episodes.get(number)!.url !== url.href) throw new MediaError("mapping_required");
    episodes.set(number, { number, title: anchor.title, url: url.href });
  }
  if (!episodes.size || [...episodes.keys()].some((number) => number > episodes.size) || !series.ongoing && (!metadata.episodeCount || episodes.size !== metadata.episodeCount)) throw new MediaError("mapping_required");
  const episode = episodes.get(request.episodeNumber);
  if (!episode) throw new MediaError("episode_unavailable");
  return episode;
}
function parseControls(html: string): EpisodeControls {
  const servers: Server[] = [];
  for (const match of html.matchAll(/<li\b([^>]*)>([\s\S]*?)<\/li>/gi)) {
    const attrs = attributes(match[1]);
    if (!attrs.get("class")?.split(/\s+/).includes("dooplay_player_option")) continue;
    const id = attrs.get("data-nume"), post = attrs.get("data-post"), type = attrs.get("data-type");
    const label = text(/<span\b[^>]*class=["']title["'][^>]*>([\s\S]*?)<\/span>/i.exec(match[2])?.[1] ?? "");
    if (!id || !/^[1-9]\d{0,2}$/.test(id) || !post || !/^[1-9]\d{0,9}$/.test(post) || type !== "tv" || !label || label.length > 60 || servers.some((server) => server.id === id) || servers.length >= 10) throw new MediaError("mapping_required");
    servers.push({ id, label, post, type });
  }
  if (!servers.length || new Set(servers.map((server) => server.post)).size !== 1) throw new MediaError("no_source");
  let config: unknown;
  try { config = JSON.parse(/\bvar dtAjax\s*=\s*(\{[^\n]*?\});/.exec(html)?.[1] ?? ""); } catch { throw new MediaError("no_source"); }
  if (!config || typeof config !== "object" || !("play_method" in config) || config.play_method !== "wp_json" || !("player_api" in config) || config.player_api !== `${origin}/wp-json/dooplayer/v2/`) throw new MediaError("no_source");
  const version = "player_v" in config ? config.player_v : undefined;
  if (version !== undefined && (typeof version !== "string" || !/^[a-f0-9]{8}$/.test(version))) throw new MediaError("no_source");
  return { servers, api: config.player_api, ...(typeof version === "string" ? { version } : {}) };
}
async function episodeControls(request: EpisodeRequest, signal: AbortSignal) {
  const episode = await identify(request, signal);
  const html = await readPage(controlUrl(episode.url), signal);
  if (text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "") !== episode.title) throw new MediaError("mapping_required");
  return { episode, ...parseControls(html) };
}
export async function getAnimerukaServers(request: EpisodeRequest, signal: AbortSignal): Promise<MediaServerList> {
  const { servers } = await episodeControls(request, signal);
  return { provider: "animeruka", defaultServerId: servers[0].id, servers: servers.map(({ id, label }) => ({ id, label })) };
}
export const animerukaAdapter: MediaProvider = {
  id: "animeruka",
  async resolve(request, signal) {
    const controls = await episodeControls(request, signal);
    const selected = request.serverId ?? controls.servers[0].id;
    const server = controls.servers.find((item) => item.id === selected);
    if (!server) throw new MediaError("invalid_request");
    const url = new URL(`${controls.api}${server.post}/${server.type}/${server.id}`);
    if (controls.version) url.searchParams.set("v", controls.version);
    const playerResponse = await readPage(controlUrl(url.href), signal);
    let player: unknown;
    try { player = JSON.parse(playerResponse); } catch { throw new MediaError("provider_unavailable"); }
    if (!player || typeof player !== "object" || !("type" in player) || player.type !== "iframe" || !("embed_url" in player) || typeof player.embed_url !== "string") throw new MediaError("no_source");
    let frame: URL;
    try { frame = new URL(player.embed_url); } catch { throw new MediaError("no_source"); }
    if (frame.origin !== "https://animemami.xyz") throw new MediaError("unsupported_server");
    const html = await readPage(controlUrl(frame.href), signal);
    let page: unknown;
    try { page = JSON.parse(decodeHtml(/\bdata-page="([^"]*)"/.exec(html)?.[1] ?? "")); } catch { throw new MediaError("no_source"); }
    if (!page || typeof page !== "object" || !("component" in page) || page.component !== "Player/Show" || !("props" in page) || !page.props || typeof page.props !== "object" || !("video" in page.props) || !page.props.video || typeof page.props.video !== "object") throw new MediaError("no_source");
    const video = page.props.video;
    if (!("title" in video) || video.title !== `${controls.episode.title}.mp4` || !("type" in video) || !["direct", "hls"].includes(String(video.type)) || !("url" in video) || typeof video.url !== "string" || "subtitle_path" in video && video.subtitle_path !== null) throw new MediaError("mapping_required");
    return { selectedServerId: server.id, video: { url: validatePolicyResource(video.url, "animeruka", "hls").href, type: "hls" }, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } };
  },
  async *resolveAlternatives(request, signal) {
    const current = await getAnimerukaServers(request, signal);
    for (const server of current.servers.filter((item) => item.id !== current.defaultServerId)) {
      try { yield await animerukaAdapter.resolve({ ...request, serverId: server.id }, signal); }
      catch { signal.throwIfAborted(); }
    }
  },
};
