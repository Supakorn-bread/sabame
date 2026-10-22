import "server-only";
import { normalizeTitle } from "@sabame/domain/identity";
import { withDeadline } from "../resolver";
import { toWebVtt } from "../subtitles";
import { MediaError, type MediaResult } from "../types";
import {
  alignedSubtitleOffset,
  bilibiliJsonToWebVtt,
  readBilibiliCues,
} from "./bilibili-subtitles";
import type { fetchMetadata } from "./catalog";
import { fetchResource } from "./resource-fetch";
import {
  signResource,
  validatePolicyResource,
  verifyResource,
} from "./resource-security";

type Metadata = Awaited<ReturnType<typeof fetchMetadata>>;
interface BilibiliEpisode {
  seasonId: string;
  episodeId: string;
  episodeNumber: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
function publicId(value: unknown): value is string {
  return typeof value === "string" && /^[1-9]\d{0,19}$/.test(value);
}
async function readMetadata(
  path: string,
  parameters: Record<string, string>,
  signal: AbortSignal,
): Promise<Record<string, unknown>> {
  const url = new URL(`https://api.bilibili.tv/intl/gateway/web/v2/${path}`);
  url.search = new URLSearchParams({
    s_locale: "en_US",
    platform: "web",
    ...parameters,
  }).toString();
  const response = await fetch(url.href, {
    signal,
    redirect: "error",
    cache: "no-store",
  });
  if (
    !response.ok ||
    !response.body ||
    Number(response.headers.get("content-length")) > 262_144
  )
    throw new MediaError("invalid_subtitle");
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 262_144) throw new MediaError("resource_too_large");
      parts.push(value);
    }
    const result: unknown = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!isRecord(result) || result.code !== 0 || !isRecord(result.data))
      throw new MediaError("invalid_subtitle");
    return result.data;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

async function discoverEpisode(
  metadata: Metadata,
  episodeNumber: number,
  signal: AbortSignal,
): Promise<BilibiliEpisode | undefined> {
  const titles = [
    ...new Map(
      [
        metadata.title.english,
        metadata.title.romaji,
        metadata.title.userPreferred,
        ...(metadata.synonyms ?? []),
      ]
        .filter(
          (value): value is string =>
            typeof value === "string" && !!value.trim(),
        )
        .map((title) => [normalizeTitle(title), title]),
    ).values(),
  ];
  const aliases = new Set(
    [...titles, metadata.title.native ?? ""]
      .map(normalizeTitle)
      .filter(Boolean),
  );
  const searches = await Promise.all(
    titles
      .slice(0, 2)
      .map((keyword) =>
        readMetadata(
          "search_v2/anime",
          {
            keyword,
            highlight: "0",
            pn: "1",
            ps: "20",
            qid: "",
            sort: "0",
            duration_type: "0",
          },
          signal,
        ),
      ),
  );
  const candidates = new Set(
    searches.flatMap((search) =>
      (Array.isArray(search.items) ? search.items : []).flatMap(
        (item: unknown) =>
          isRecord(item) &&
          publicId(item.season_id) &&
          typeof item.title === "string" &&
          item.season_type_enum === 1 &&
          aliases.has(normalizeTitle(item.title))
            ? [item.season_id]
            : [],
      ),
    ),
  );
  if (candidates.size !== 1) return;
  const seasonId = [...candidates][0];
  const [details, listing] = await Promise.all([
    readMetadata("ogv/play/season_info", { season_id: seasonId }, signal),
    readMetadata("ogv/play/episodes", { season_id: seasonId }, signal),
  ]);
  const season = details.season;
  if (
    !isRecord(season) ||
    season.season_id !== seasonId ||
    season.season_type_enum !== 1 ||
    ![season.title, season.origin_name].some(
      (name) => typeof name === "string" && aliases.has(normalizeTitle(name)),
    )
  )
    return;
  const year =
    typeof season.player_date === "string"
      ? /\b(19\d{2}|20\d{2})\b/.exec(season.player_date)?.[1]
      : undefined;
  if (metadata.year && year && metadata.year !== Number(year)) return;
  const episodes = (
    Array.isArray(listing.sections) ? listing.sections : []
  ).flatMap((section: unknown) =>
    isRecord(section) && Array.isArray(section.episodes)
      ? section.episodes
      : [],
  );
  const matches = episodes.filter(
    (episode: unknown) =>
      isRecord(episode) && episode.short_title_display === `E${episodeNumber}`,
  );
  if (
    matches.length !== 1 ||
    !isRecord(matches[0]) ||
    !publicId(matches[0].episode_id) ||
    matches[0].limit !== 0
  )
    return;
  return { seasonId, episodeId: matches[0].episode_id, episodeNumber };
}

async function readJsonSubtitle(
  url: string,
  signal: AbortSignal,
): Promise<string> {
  const valid = validatePolicyResource(url, "bilibili", "subtitle");
  const resource = await fetchResource(valid.href, signal, {
    policy: "bilibili",
    kind: "subtitle",
    maxBytes: 1_048_576,
  });
  return resource.body.toString("utf8");
}

export async function appendBilibiliThaiSubtitle(
  result: MediaResult,
  metadata: Metadata,
  signal: AbortSignal,
  timeoutMs = 8000,
): Promise<MediaResult> {
  if (
    !metadata.title ||
    result.subtitles.some(
      (track) => track.language === "th" && track.displaySupported,
    ) ||
    timeoutMs < 100
  )
    return result;
  const english = result.subtitles.find(
    (track) =>
      track.language === "en" &&
      track.availability === "available" &&
      track.displaySupported &&
      (track.format === "vtt" || track.format === "srt"),
  );
  if (!english) return result;
  try {
    return await withDeadline(
      signal,
      Math.min(timeoutMs, 8000),
      async (subtitleSignal) => {
        const controller = new AbortController();
        const workSignal = AbortSignal.any([subtitleSignal, controller.signal]);
        try {
          const ticket = verifyResource(
            new URL(english.url, "https://sabame.invalid").searchParams.get(
              "ticket",
            ) ?? "",
          );
          if (ticket.kind !== "subtitle" || ticket.policy === "bilibili")
            return result;
          const [episode, current] = await Promise.all([
            discoverEpisode(
              metadata,
              result.metadata.episodeNumber,
              workSignal,
            ),
            fetchResource(ticket.url, workSignal, {
              policy: ticket.policy,
              maxBytes: 1_048_576,
            }),
          ]);
          if (!episode) return result;
          const data = await readMetadata(
            "subtitle",
            { episode_id: episode.episodeId, s_locale: "th_TH" },
            workSignal,
          );
          if (!Array.isArray(data.video_subtitle)) return result;
          const trackUrl = (language: string) => {
            const matches = (data.video_subtitle as unknown[]).filter(
              (track) => isRecord(track) && track.lang_key === language,
            );
            const track = matches.length === 1 ? matches[0] : undefined;
            return isRecord(track) &&
              isRecord(track.srt) &&
              typeof track.srt.url === "string"
              ? track.srt.url
              : undefined;
          };
          const thaiUrl = trackUrl("th");
          const englishUrl = trackUrl("en");
          if (!thaiUrl || !englishUrl) return result;
          const [thai, reference] = await Promise.all([
            readJsonSubtitle(thaiUrl, workSignal),
            readJsonSubtitle(englishUrl, workSignal),
          ]);
          const offsetMs = alignedSubtitleOffset(
            toWebVtt(current.body.toString("utf8")),
            readBilibiliCues(reference),
          );
          if (offsetMs === undefined) return result;
          bilibiliJsonToWebVtt(thai, offsetMs);
          const exp = Math.min(
            result.video.expiresAt ?? Date.now() + 30 * 60_000,
            Date.now() + 30 * 60_000,
          );
          return {
            ...result,
            thaiStatus: "present",
            subtitles: [
              ...result.subtitles,
              {
                language: "th",
                label: "Thai (Bilibili)",
                url: signResource({
                  url: thaiUrl,
                  kind: "subtitle",
                  policy: "bilibili",
                  subtitleOffsetMs: offsetMs,
                  exp,
                }),
                format: "vtt",
                default: false,
                availability: "available",
                displaySupported: true,
                syncStatus: "unverified",
              },
            ],
          };
        } finally {
          controller.abort();
        }
      },
    );
  } catch {
    signal.throwIfAborted();
    return result;
  }
}
