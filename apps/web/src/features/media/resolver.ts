import { resolveSubtitles, type SubtitleProbe } from "./subtitles";
import { MediaError, type EpisodeRequest, type MediaProvider, type MediaResult } from "./types";

export async function withDeadline<T>(signal: AbortSignal, milliseconds: number, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  const timer = setTimeout(() => controller.abort(new MediaError("timeout")), milliseconds);
  let cancel: () => void = () => {};
  try {
    return await Promise.race([Promise.resolve().then(() => { controller.signal.throwIfAborted(); return run(controller.signal); }), new Promise<never>((_, reject) => {
      cancel = () => reject(controller.signal.reason ?? new MediaError("cancelled"));
      controller.signal.addEventListener("abort", cancel, { once: true });
      if (controller.signal.aborted) cancel();
    })]);
  } finally { clearTimeout(timer); signal.removeEventListener("abort", abort); controller.signal.removeEventListener("abort", cancel); }
}
export async function resolveMedia(episode: EpisodeRequest, providers: MediaProvider[], options: {
  signal: AbortSignal;
  probeSubtitle: SubtitleProbe;
  validateVideo: (url: string, signal: AbortSignal) => Promise<void>;
  providerTimeout?: number;
  totalTimeout?: number;
  log?: (event: { provider: string; stage: string; latencyMs: number; code: string }) => void;
}): Promise<MediaResult> {
  let best: MediaResult | undefined;
  let bestScore = -1;
  let lastCode = "no_source";
  try {
    await withDeadline(options.signal, options.totalTimeout ?? 30_000, async (totalSignal) => {
      for (const provider of providers) {
        totalSignal.throwIfAborted();
        const start = Date.now();
        try {
          const result = await withDeadline(totalSignal, options.providerTimeout ?? 12_000, async (signal) => {
            const bundle = await provider.resolve(episode, signal);
            await options.validateVideo(bundle.video.url, signal);
            const subtitles = await resolveSubtitles(bundle.subtitles, options.probeSubtitle, signal);
            signal.throwIfAborted();
            const thai = subtitles.filter((t) => t.language === "th");
            const score = thai.some((t) => t.displaySupported) ? 2 : subtitles.some((t) => t.language === "en" && t.displaySupported) ? 1 : 0;
            const media: MediaResult = { provider: provider.id, video: bundle.video, subtitles, metadata: episode,
              thaiStatus: thai.some((t) => t.availability === "available") ? "present" : thai.length ? "unavailable" : bundle.subtitles ? "absent_in_returned_tracks" : "unknown",
              selectionReason: score === 2 ? "thai_subtitle" : score === 1 ? "english_subtitle" : "video_only" };
            return { media, score };
          });
          options.log?.({ provider: provider.id, stage: "resolve", latencyMs: Date.now() - start, code: "ok" });
          if (result.score > bestScore) { best = result.media; bestScore = result.score; }
          if (bestScore === 2) break;
        } catch (error) {
          lastCode = error instanceof MediaError ? error.code : "provider_unavailable";
          options.log?.({ provider: provider.id, stage: "resolve", latencyMs: Date.now() - start, code: lastCode });
        }
      }
    });
  } catch (error) { if (options.signal.aborted) throw error; if (!best) throw error; }
  options.signal.throwIfAborted();
  if (!best) throw new MediaError(lastCode);
  return best;
}
