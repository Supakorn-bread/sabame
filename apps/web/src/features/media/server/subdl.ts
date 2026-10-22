import "server-only";
import { backendOrigin } from "@/config/backend-routing";
import { withDeadline } from "../resolver";
import { toWebVtt } from "../subtitles";
import type { MediaResult } from "../types";
import type { fetchMetadata } from "./catalog";
import { fetchResource } from "./resource-fetch";
import {
  signResource,
  validatePolicyResource,
  verifyResource,
} from "./resource-security";
import { plausibleSubtitleTiming, subdlSrtToWebVtt } from "./subdl-subtitles";

type Metadata = Awaited<ReturnType<typeof fetchMetadata>>;

export async function appendSubdlThaiSubtitle(
  result: MediaResult,
  metadata: Metadata,
  signal: AbortSignal,
  timeoutMs = 8000,
): Promise<MediaResult> {
  if (
    !metadata.title ||
    timeoutMs < 100 ||
    result.subtitles.some(
      (track) => track.language === "th" && track.displaySupported,
    )
  )
    return result;
  const english = result.subtitles.find(
    (track) =>
      track.language === "en" &&
      track.displaySupported &&
      track.availability === "available",
  );
  if (!english) return result;
  try {
    return await withDeadline(
      signal,
      Math.min(timeoutMs, 8000),
      async (deadlineSignal) => {
        const controller = new AbortController();
        const workSignal = AbortSignal.any([deadlineSignal, controller.signal]);
        try {
          const origin = backendOrigin(
            process.env.BACKEND_URL,
            Boolean(process.env.VERCEL),
          );
          const url = new URL(
            `/api/anime/${encodeURIComponent(result.metadata.animeId)}/subtitles`,
            origin,
          );
          url.searchParams.set(
            "episodeNumber",
            String(result.metadata.episodeNumber),
          );
          const ticket = verifyResource(
            new URL(english.url, "https://sabame.invalid").searchParams.get(
              "ticket",
            ) ?? "",
          );
          if (
            ticket.kind !== "subtitle" ||
            ticket.policy === "bilibili" ||
            ticket.policy === "subdl"
          )
            return result;
          const [response, current] = await Promise.all([
            fetch(url, {
              signal: workSignal,
              cache: "no-store",
              redirect: "error",
            }),
            fetchResource(ticket.url, workSignal, {
              policy: ticket.policy,
              maxBytes: 1_048_576,
            }),
          ]);
          if (
            !response.ok ||
            !response.body ||
            Number(response.headers.get("content-length")) > 16_384
          )
            return result;
          const reader = response.body.getReader();
          const parts: Uint8Array[] = [];
          let size = 0;
          let data: unknown;
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              size += value.byteLength;
              if (size > 16_384) return result;
              parts.push(value);
            }
            data = JSON.parse(Buffer.concat(parts).toString("utf8"));
          } finally {
            await reader.cancel().catch(() => {});
            reader.releaseLock();
          }
          if (
            !data ||
            typeof data !== "object" ||
            !("candidates" in data) ||
            !Array.isArray(data.candidates)
          )
            return result;
          const englishVtt = toWebVtt(current.body.toString("utf8"));
          for (const candidate of data.candidates.slice(0, 3)) {
            try {
              if (
                !candidate ||
                typeof candidate !== "object" ||
                typeof candidate.url !== "string"
              )
                continue;
              const subtitleUrl = validatePolicyResource(
                candidate.url,
                "subdl",
                "subtitle",
              ).href;
              const resource = await fetchResource(subtitleUrl, workSignal, {
                policy: "subdl",
                kind: "subtitle",
                maxBytes: 1_048_576,
              });
              const subtitle = subdlSrtToWebVtt(resource.body);
              if (!plausibleSubtitleTiming(subtitle, englishVtt)) continue;
              return {
                ...result,
                thaiStatus: "present",
                subtitles: [
                  ...result.subtitles,
                  {
                    language: "th",
                    label: "Thai (SubDL, timing unverified)",
                    url: signResource({
                      url: subtitleUrl,
                      kind: "subtitle",
                      policy: "subdl",
                      subtitleHash: subtitle.hash,
                      exp: Math.min(
                        result.video.expiresAt ?? Date.now() + 30 * 60_000,
                        Date.now() + 30 * 60_000,
                      ),
                    }),
                    format: "vtt",
                    default: false,
                    availability: "available",
                    displaySupported: true,
                    syncStatus: "unverified",
                  },
                ],
              };
            } catch {
              workSignal.throwIfAborted();
            }
          }
          return result;
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
