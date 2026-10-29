import "server-only";
import { providerSearchFailure } from "../resolver";
import { normalizeTitle } from "../identity";
import { MediaError, type EpisodeRequest, type MediaBundle, type MediaProvider } from "../types";
import { fetchMetadata } from "./catalog";
import { validatePolicyResource } from "./resource-security";

const origin = "https://anifume.com";
interface Episode { number: number; title: string; url: string }
interface Series { url: string; title: string; count: number; complete: boolean; season?: number }
function matchTitle(value: string) {
  const roman: Record<string, string> = { ii: "2", iii: "3", iv: "4" };
  return normalizeTitle(value).replace(/\s+(?:(?:season\s+)?([2-4])|(ii|iii|iv))$/, (_, number: string | undefined, numeral: string | undefined) => ` season ${number ?? roman[numeral!]}`);
}
function text(value: string) {
  return value.replace(/<[^>]*>/g, "").replace(/&(?:amp|quot|apos|lt|gt|#39);/g, (entity) => ({ "&amp;": "&", "&quot;": '"', "&apos;": "'", "&#39;": "'", "&lt;": "<", "&gt;": ">" })[entity]!).replace(/\s+/g, " ").trim();
}
function controlUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value, origin); } catch { throw new MediaError("mapping_required"); }
  if (url.origin !== origin || url.username || url.password || url.hash) throw new MediaError("mapping_required");
  return url;
}
async function readPage(url: URL, signal: AbortSignal, referer?: string) {
  const response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(8_000)]), redirect: "error", cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0", ...(referer ? { Referer: referer, "X-Requested-With": "XMLHttpRequest" } : {}) } });
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
function anchors(html: string) {
  return [...html.matchAll(/<a\b[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({ href: text(match[1]), title: text(match[2]) }));
}
function parseSeries(title: string, url: string): Series | undefined {
  const range = /ตอนที่\s*1\s*-\s*([1-9]\d*)\s+ซับไทย(?:\s*\[จบ\])?$/.exec(title);
  if (!range || /พากย์ไทย/.test(title)) return;
  const prefix = title.slice(0, range.index).trim();
  const name = prefix.replace(/[\u0E00-\u0E7F][\s\S]*$/, "").trim() || prefix;
  const count = Number(range[1]);
  if (!name || count > 2000) return;
  const seasons = [...title.slice(0, range.index).matchAll(/ภาค\s*([1-9]\d*)/g)].map((match) => Number(match[1]));
  const namedSeason = /(?:\b([1-9]\d*)(?:st|nd|rd|th)?\s*(?:season|part)?|\b(?:season|part)\s*([1-9]\d*))\s*$/i.exec(name);
  if (seasons.length > 1 || seasons.length === 1 && !/[\u0E00-\u0E7F]/.test(name) && seasons[0] !== (namedSeason ? Number(namedSeason[1] ?? namedSeason[2]) : 1)) return;
  return { url, title: name, count, complete: /\[จบ\]$/.test(title), ...(seasons.length ? { season: seasons[0] } : {}) };
}
async function identify(animeId: string, signal: AbortSignal) {
  const metadata = await fetchMetadata(animeId, signal);
  if (!metadata.episodeCount || metadata.episodeCount > 2000 || metadata.format && metadata.format !== "TV") throw new MediaError("mapping_required");
  const aliases = [...new Map([metadata.title.english, metadata.title.romaji, metadata.title.userPreferred, ...(metadata.synonyms ?? [])]
    .filter((title): title is string => typeof title === "string" && Boolean(title.trim())).map((title) => [normalizeTitle(title), title])).values()];
  const canonical = new Set(aliases.map(matchTitle));
  const searchTitles = [...new Set(aliases.flatMap((title) => [title, title.replace(/\s+(II|III|IV)$/i, (_, roman: string) => ` ${{ II: 2, III: 3, IV: 4 }[roman.toUpperCase() as "II" | "III" | "IV"]}`)]))].slice(0, 6);
  const searches = await Promise.allSettled(searchTitles.map((title) => readPage(controlUrl(`/search/${encodeURIComponent(title).replaceAll("%20", "+")}`), signal)));
  signal.throwIfAborted();
  const matches = new Map<string, Series>();
  for (const result of searches) {
    if (result.status !== "fulfilled") continue;
    for (const anchor of anchors(result.value)) {
      const series = parseSeries(anchor.title, anchor.href);
      if (!series || series.count > metadata.episodeCount || series.complete && series.count !== metadata.episodeCount) continue;
      const url = controlUrl(series.url);
      if (!/^\/[1-9]\d{0,8}$/.test(url.pathname) || url.search) throw new MediaError("mapping_required");
      matches.set(url.href, { ...series, url: url.href });
    }
  }
  if (matches.size > 12) throw new MediaError("mapping_required");
  if ([...matches.values()].filter((series) => canonical.has(matchTitle(series.title))).length > 1) throw new MediaError("mapping_required");
  const candidates = await Promise.all([...matches.values()].map(async (series) => {
    const direct = canonical.has(matchTitle(series.title));
    if (!direct && !/[\u0E00-\u0E7F]/.test(series.title)) return;
    const html = await readPage(controlUrl(series.url), signal);
    const heading = text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "");
    const detail = parseSeries(heading, series.url);
    if (!detail || normalizeTitle(detail.title) !== normalizeTitle(series.title) || detail.count !== series.count || detail.complete !== series.complete || detail.season !== series.season) throw new MediaError("mapping_required");
    if (!direct) {
      const paragraphTitles = [...html.matchAll(/<p\b[^>]*>\s*([^<]+)<br\s*\/?\s*>/gi)].map((match) => text(match[1]));
      const accepted = paragraphTitles.map(matchTitle).filter((title) => canonical.has(title));
      if (!accepted.some((title) => series.season === undefined || title.endsWith(` season ${series.season}`))) return;
    }
    return { series, html };
  }));
  signal.throwIfAborted();
  const verified = candidates.filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));
  if (verified.length > 1) throw new MediaError("mapping_required");
  const selected = verified[0];
  if (!selected) throw new MediaError(providerSearchFailure(searches));
  const { series, html } = selected;
  const episodes: Episode[] = [];
  for (const anchor of anchors(html)) {
    const numberText = /ตอนที่\s*([1-9]\d*)\s+ซับไทย(?:\s+จบ)?$/.exec(anchor.title)?.[1];
    if (!numberText) continue;
    const url = controlUrl(anchor.href);
    if (!new RegExp(`^${new URL(series.url).pathname}/[A-Za-z0-9_-]{10,80}$`).test(url.pathname) || url.search) throw new MediaError("mapping_required");
    const number = Number(numberText);
    if (number > series.count || episodes.some((episode) => episode.number === number)) throw new MediaError("mapping_required");
    episodes.push({ number, title: anchor.title, url: url.href });
  }
  if (episodes.length !== series.count) throw new MediaError("mapping_required");
  return episodes;
}
async function readSources(request: EpisodeRequest, signal: AbortSignal) {
  const episodes = await identify(request.animeId, signal);
  const episode = episodes.find((item) => item.number === request.episodeNumber);
  if (!episode) throw new MediaError("episode_unavailable");
  const html = await readPage(controlUrl(episode.url), signal);
  if (text(/<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "") !== episode.title) throw new MediaError("mapping_required");
  const main = /function mainv\(\)\s*\{[\s\S]*?url:\s*"([^"]+)"/.exec(html)?.[1];
  if (!main) throw new MediaError("no_source");
  const ajax = controlUrl(main);
  if (ajax.pathname !== "/k49dF65fkfl2X0So2lFB06" || [...ajax.searchParams.keys()].join() !== "u" || !/^[A-Za-z0-9+/=]{20,2048}$/.test(ajax.searchParams.get("u") ?? "")) throw new MediaError("mapping_required");
  const player = await readPage(ajax, signal, episode.url);
  const frames = [...player.matchAll(/<iframe\b[^>]*\bsrc="([^"]+)"/g)];
  if (frames.length !== 1) throw new MediaError("no_source");
  const frame = controlUrl(text(frames[0][1]));
  if (!/^\/player\/s=a\d{1,2}&f=[A-Za-z0-9_-]{20,100}&m=[A-Za-z0-9_-]{10,100}&e=\d{10}(?:&d=\d)?&q=1$/.test(frame.pathname) || frame.search) throw new MediaError("mapping_required");
  const config = await readPage(frame, signal, episode.url);
  const sources = [...config.matchAll(/"sources"\s*:\s*(\[[\s\S]*?\])/g)];
  if (sources.length !== 1) throw new MediaError("no_source");
  let values: unknown;
  try { values = JSON.parse(sources[0][1]); } catch { throw new MediaError("no_source"); }
  if (!Array.isArray(values) || !values.length || values.length > 5) throw new MediaError("no_source");
  const videos = values.map((value: unknown) => {
    if (!value || typeof value !== "object" || !("file" in value) || typeof value.file !== "string") throw new MediaError("no_source");
    return { url: validatePolicyResource(value.file, "anifume", "mp4").href, quality: "label" in value ? value.label : undefined };
  });
  const labelled = videos.filter((item): item is { url: string; quality: string } => typeof item.quality === "string" && /^[1-9]\d{2,3}p$/.test(item.quality));
  if (!labelled.length || new Set(labelled.map((item) => item.quality)).size !== labelled.length) throw new MediaError("no_source");
  labelled.sort((left, right) => Number(left.quality.slice(0, -1)) - Number(right.quality.slice(0, -1)));
  return labelled;
}
type AnifumeSource = { url: string; quality: string };
function preferredSource(sources: AnifumeSource[]) { return sources.find((item) => Number(item.quality.slice(0, -1)) >= 720) ?? sources[sources.length - 1]; }
function sourceBundle(video: AnifumeSource, sources: AnifumeSource[]): MediaBundle {
  return { video: { url: video.url, type: "mp4", quality: video.quality }, qualities: sources.map((item) => ({ id: item.quality, label: item.quality })), selectedQualityId: video.quality, subtitles: [], embeddedSubtitles: { language: "th", label: "Thai (embedded)", removable: false } };
}
export const anifumeAdapter: MediaProvider = {
  id: "anifume",
  async resolve(request, signal) {
    const sources = await readSources(request, signal);
    const selected = request.qualityId ? sources.find((item) => item.quality === request.qualityId) : preferredSource(sources);
    if (!selected) throw new MediaError("quality_unavailable");
    return sourceBundle(selected, sources);
  },
  async *resolveAlternatives(request, signal) {
    const sources = await readSources(request, signal);
    const preferred = preferredSource(sources);
    for (const source of sources.filter((item) => item !== preferred).sort((left, right) => Number(right.quality.slice(0, -1)) - Number(left.quality.slice(0, -1)))) yield sourceBundle(source, sources);
  },
};
