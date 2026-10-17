import "server-only";
import { normalizeTitle } from "../identity";
import { normalizeLanguage } from "../language";
import { MediaError, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";

const catalogOrigin = "https://hianime.at";
const embedOrigin = "https://zokoanime.video";
interface ProviderEpisode { id: string; number: number; title: string }
interface IdentifiedCatalog { malId: number; episodes: ProviderEpisode[] }

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new MediaError("provider_unavailable");
  return value as Record<string, unknown>;
}
function decodeHtml(value: string) {
  return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi, (entity) => {
    const named: Record<string, string> = { "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const code = entity[2].toLowerCase() === "x" ? Number.parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
}
function attributes(tag: string) {
  return Object.fromEntries(Array.from(tag.matchAll(/([\w-]+)\s*=\s*"([^"]*)"/g), (match) => [match[1], decodeHtml(match[2])]));
}
async function readControl(url: URL, signal: AbortSignal): Promise<string> {
  if (![catalogOrigin, embedOrigin].includes(url.origin)) throw new MediaError("resource_host_not_allowed");
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: "error", cache: "no-store" });
  if (!response.ok || !response.body) throw new MediaError("provider_unavailable");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 1_048_576) throw new MediaError("resource_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return Buffer.concat(chunks).toString("utf8");
}
async function readHtml(url: URL, signal: AbortSignal) {
  const payload = record(JSON.parse(await readControl(url, signal)));
  if (payload.status !== true || typeof payload.html !== "string") throw new MediaError("provider_unavailable");
  return payload.html;
}
function parseEpisodes(html: string, slug: string, episodeCount?: number) {
  const episodes: ProviderEpisode[] = [];
  for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
    const item = attributes(tag);
    if (!item.class?.split(/\s+/).includes("ep-item")) continue;
    if (!/^[1-9]\d*$/.test(item["data-number"] ?? "") || !/^[1-9]\d*$/.test(item["data-id"] ?? "")) continue;
    const number = Number(item["data-number"]);
    const url = new URL(item.href ?? "", catalogOrigin);
    const withinSeason = Number.isSafeInteger(number) && number <= 2000 && (!episodeCount || number <= episodeCount);
    const exactWatchLink = url.origin === catalogOrigin && url.pathname === `/watch/${slug}` && url.searchParams.get("ep") === item["data-id"];
    if (!withinSeason || !exactWatchLink) throw new MediaError("mapping_required");
    episodes.push({ id: item["data-id"], number, title: item.title || `Episode ${number}` });
  }
  return episodes.filter((episode) => episodes.filter((other) => other.number === episode.number).length === 1).sort((left, right) => left.number - right.number);
}
async function episodeEmbed(episode: ProviderEpisode, malId: number, signal: AbortSignal) {
  const html = await readHtml(new URL(`/api/theme/episode/servers?episodeId=${episode.id}`, catalogOrigin), signal);
  const embeds = new Set<string>();
  for (const [tag] of html.matchAll(/<div\b[^>]*>/g)) {
    const item = attributes(tag);
    if (item["data-type"] !== "sub" || item["data-server-name"] !== "ZokoAnime" || !item["data-hash"]) continue;
    const url = new URL(Buffer.from(item["data-hash"], "base64").toString("utf8"));
    const exactIdentity = url.origin === embedOrigin && url.pathname === `/stream/mal/${malId}/${episode.number}/sub`;
    if (!exactIdentity || url.search || url.hash || url.username || url.password) throw new MediaError("mapping_required");
    embeds.add(url.href);
  }
  if (embeds.size !== 1) throw new MediaError("no_source");
  return new URL(embeds.values().next().value!);
}
async function identifyCatalog(animeId: string, signal: AbortSignal): Promise<IdentifiedCatalog> {
  const metadata = await fetchMetadata(animeId, signal);
  const malId = metadata.mappings?.mal ?? Number(metadata.id.split(":").at(-1));
  if (!Number.isSafeInteger(malId) || malId < 1 || /^mal-/.test(animeId) && animeId !== `mal-${malId}`) throw new MediaError("mapping_required");
  const titles = [...new Map([metadata.title.english, metadata.title.romaji, metadata.title.userPreferred, ...(metadata.synonyms ?? [])]
    .filter((title): title is string => typeof title === "string" && Boolean(title.trim())).map((title) => [normalizeTitle(title), title])).values()];
  const aliases = new Set(titles.map(normalizeTitle));
  for (const title of titles.slice(0, 2)) {
    const search = new URL("/search", catalogOrigin);
    search.searchParams.set("keyword", title);
    const html = (await readControl(search, signal)).split('id="main-sidebar"')[0];
    const slugs = new Set<string>();
    for (const match of html.matchAll(/<h3\b[^>]*class="film-name"[^>]*>\s*(<a\b[^>]*>)/g)) {
      const item = attributes(match[1]);
      if (!aliases.has(normalizeTitle(item.title ?? ""))) continue;
      const url = new URL(item.href ?? "", catalogOrigin);
      if (url.origin === catalogOrigin && /^\/[a-z0-9-]+-[1-9]\d*$/.test(url.pathname) && !url.search && !url.hash) slugs.add(url.pathname.slice(1));
    }
    if (slugs.size > 1) throw new MediaError("mapping_required");
    const slug = slugs.values().next().value;
    if (!slug) continue;
    const id = slug.split("-").at(-1)!;
    const episodes = parseEpisodes(await readHtml(new URL(`/api/theme/episode/list/${id}`, catalogOrigin), signal), slug, metadata.episodeCount);
    if (!episodes.length) throw new MediaError("no_source");
    await episodeEmbed(episodes[0], malId, signal);
    return { malId, episodes };
  }
  throw new MediaError("no_source");
}
export async function getHianimeEpisodes(animeId: string, signal: AbortSignal) {
  const { episodes } = await identifyCatalog(animeId, signal);
  return episodes.map(({ number, title }) => ({ number, title }));
}
export const hianimeAdapter: MediaProvider = {
  id: "hianime",
  requiresEnglishSubtitles: true,
  async resolve(request, signal) {
    const { malId, episodes } = await identifyCatalog(request.animeId, signal);
    const episode = episodes.find((item) => item.number === request.episodeNumber);
    if (!episode) throw new MediaError("episode_unavailable");
    const embed = await episodeEmbed(episode, malId, signal);
    const html = await readControl(embed, signal);
    const encoded = /window\.__P\s*=\s*"([A-Za-z0-9+/=]+)"/.exec(html)?.[1];
    if (!encoded) throw new MediaError("no_source");
    const bytes = Buffer.from(encoded, "base64");
    const key = Buffer.from("otaku-embed-v1");
    const decoded = Buffer.from(bytes.map((byte, index) => byte ^ key[index % key.length]));
    const config = record(JSON.parse(decoded.toString("utf8")));
    if (typeof config.src !== "string") throw new MediaError("no_source");
    const video = new URL(config.src);
    if (video.origin !== "https://hls.dramahot.top" || !video.pathname.endsWith(".m3u8") || video.username || video.password) throw new MediaError("resource_host_not_allowed");
    const subtitles = (Array.isArray(config.subtitles) ? config.subtitles : []).flatMap((value) => {
      const track = record(value);
      if (typeof track.src !== "string" || typeof track.label !== "string" || normalizeLanguage(track.label.split(" - ", 1)[0]) !== "en" || track.lang !== "en") return [];
      const url = new URL(track.src);
      if (url.origin !== "https://hls.dramahot.top" || !url.pathname.endsWith(".vtt") || url.username || url.password) throw new MediaError("resource_host_not_allowed");
      return [{ url: url.href, language: "en", label: track.label, format: "vtt" as const }];
    });
    if (!subtitles.length) throw new MediaError("english_subtitle_unavailable");
    return { video: { url: video.href, type: "hls" }, subtitles };
  },
};
