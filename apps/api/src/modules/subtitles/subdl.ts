import { normalizeTitle } from "@sabame/domain/identity";
import { MediaError } from "@sabame/domain/media";
import type { fetchMetadata } from "@sabame/catalog/catalog";

type Metadata = Awaited<ReturnType<typeof fetchMetadata>>;
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function publicSubdlUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return;
  let url: URL;
  try {
    url = new URL(value, "https://dl.subdl.com");
  } catch {
    return;
  }
  if (
    url.origin !== "https://dl.subdl.com" ||
    url.username ||
    url.password ||
    !/^\/subtitle\/[A-Za-z0-9_-]{1,100}\/[A-Za-z0-9_-]{1,100}$/.test(
      url.pathname,
    )
  )
    return;
  // SubDL includes the API credential in unpacked URLs even for public files.
  return `${url.origin}${url.pathname}`;
}

export function subtitleSeason(metadata: Metadata): number | undefined {
  const titles = [
    ...Object.values(metadata.title),
    ...(metadata.synonyms ?? []),
  ].filter((title): title is string => typeof title === "string");
  if (titles.some((title) => /\b(?:part|cour)\b/i.test(title))) return;
  const seasons = new Set(
    titles.flatMap((title) => {
      const match =
        /(?:\bseason\s*(\d+)|\b(\d+)(?:st|nd|rd|th)\s+season)\b/i.exec(title);
      return match ? [Number(match[1] ?? match[2])] : [];
    }),
  );
  if (seasons.size > 1) return;
  if (seasons.size === 1) return [...seasons][0];
  if (
    titles.some((title) =>
      /\b(?:part|cour|II|III|IV|2nd|3rd|4th)\b|\s(?:[2-9]|[1-9]\d+)\s*$/i.test(
        title,
      ),
    )
  )
    return;
  return 1;
}

async function querySubdl(
  parameters: Record<string, string>,
  signal: AbortSignal,
  key: string,
) {
  const url = new URL("https://api.subdl.com/api/v1/subtitles");
  url.search = new URLSearchParams({
    ...parameters,
    api_key: key,
    languages: "TH",
    unpack: "1",
    subs_per_page: "10",
  }).toString();
  const response = await fetch(url, {
    signal,
    cache: "no-store",
    redirect: "error",
  });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > 1_048_576
  )
    throw new MediaError("subtitle_unavailable");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 1_048_576) throw new MediaError("subtitle_unavailable");
      parts.push(value);
    }
    const result: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!record(result) || result.status !== true)
      throw new MediaError("subtitle_unavailable");
    return result;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

export function matchedSubdlFiles(
  value: unknown,
  season: number,
  episode: number,
): { url: string }[] {
  if (!Array.isArray(value)) return [];
  const urls = new Set<string>();
  for (const pack of value.slice(0, 10)) {
    if (!record(pack) || !Array.isArray(pack.unpack_files)) continue;
    const matches = pack.unpack_files.slice(0, 1000).filter((file: unknown) => {
      if (
        !record(file) ||
        file.format !== "srt" ||
        file.language !== "TH" ||
        file.season !== season ||
        file.episode !== episode ||
        typeof file.name !== "string" ||
        !file.name.toLowerCase().endsWith(".srt") ||
        typeof file.size !== "number" ||
        file.size < 1 ||
        file.size > 1_048_576
      )
        return false;
      const markers = [...file.name.matchAll(/\bS(\d{1,2})E(\d{1,4})(?!\d)/gi)];
      return (
        markers.length === 1 &&
        Number(markers[0][1]) === season &&
        Number(markers[0][2]) === episode &&
        !/E\d{1,4}\s*(?:[-+&]|E)\s*(?:E)?\d/i.test(file.name)
      );
    });
    if (matches.length !== 1 || !record(matches[0])) continue;
    const url = publicSubdlUrl(matches[0].url);
    if (url) urls.add(url);
  }
  return [...urls].slice(0, 3).map((url) => ({ url }));
}

export async function discoverSubdl(
  metadata: Metadata,
  episode: number,
  signal: AbortSignal,
  key: string,
): Promise<{ url: string }[]> {
  if (
    metadata.format &&
    !["TV", "TV_SHORT", "ONA", "UNKNOWN"].includes(metadata.format)
  )
    return [];
  const season = subtitleSeason(metadata);
  if (
    !season ||
    season > 99 ||
    (metadata.episodeCount && episode > metadata.episodeCount)
  )
    return [];
  const titles = [
    ...new Set(
      [
        metadata.title.english,
        metadata.title.romaji,
        metadata.title.native,
        metadata.title.userPreferred,
        ...(metadata.synonyms ?? []),
      ].filter(
        (title): title is string => typeof title === "string" && !!title.trim(),
      ),
    ),
  ];
  const aliases = new Set(titles.map(normalizeTitle));
  for (const title of titles.slice(0, 2)) {
    const search = await querySubdl(
      { film_name: title, type: "tv" },
      signal,
      key,
    );
    const matches = (
      Array.isArray(search.results) ? search.results : []
    ).filter(
      (hit: unknown) =>
        record(hit) &&
        hit.type === "tv" &&
        typeof hit.name === "string" &&
        aliases.has(normalizeTitle(hit.name)) &&
        typeof hit.sd_id === "number" &&
        Number.isSafeInteger(hit.sd_id) &&
        hit.sd_id > 0 &&
        (!metadata.year || hit.year === metadata.year),
    );
    const ids = new Set(
      matches.map((hit) => (hit as Record<string, unknown>).sd_id),
    );
    if (ids.size !== 1) continue;
    const response = await querySubdl(
      {
        sd_id: String([...ids][0]),
        season_number: String(season),
        episode_number: String(episode),
      },
      signal,
      key,
    );
    if (
      !Array.isArray(response.results) ||
      response.results.length !== 1 ||
      !record(response.results[0]) ||
      response.results[0].sd_id !== [...ids][0]
    )
      return [];
    return matchedSubdlFiles(response.subtitles, season, episode);
  }
  return [];
}
