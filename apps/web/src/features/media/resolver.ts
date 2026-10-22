import { resolveSubtitles, type SubtitleProbe } from "./subtitles";
import { MediaError, type MediaBundle, type EpisodeRequest, type MediaProvider, type MediaResult } from "./types";

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
export function providerFailureCode(error: unknown): string {
  return error instanceof MediaError ? error.code : error instanceof Error && error.name === "TimeoutError" ? "timeout" : "provider_unavailable";
}
export function providerSearchFailure(results: PromiseSettledResult<unknown>[]): string {
  const failures = results.flatMap((result) => result.status === "rejected" ? [providerFailureCode(result.reason)] : []);
  return failures.find((code) => code === "timeout" || code === "resource_timeout") ?? (failures.length ? "provider_unavailable" : "no_source");
}
export interface MediaResolutionOptions {
  signal: AbortSignal;
  probeSubtitle: (url: string, signal: AbortSignal, providerId?: string) => ReturnType<SubtitleProbe>;
  validateVideo: (url: string, signal: AbortSignal, providerId?: string) => Promise<void>;
  providerTimeout?: number;
  providerTimeouts?: Partial<Record<string, number>>;
  totalTimeout?: number;
  log?: (event: { provider: string; stage: string; latencyMs: number; code: string }) => void;
}
export type ProviderResolution = { provider: string; media: MediaResult } | { provider: string; code: string };
export function mediaPreference(result: MediaResult): number {
  return result.selectionReason === "thai_subtitle" ? 2 : result.selectionReason === "english_subtitle" ? 1 : 0;
}
async function resolvePlayableBundle(provider: MediaProvider, episode: EpisodeRequest, signal: AbortSignal, validate: MediaResolutionOptions["validateVideo"]): Promise<MediaBundle> {
  let failure: unknown;
  try {
    const bundle = await provider.resolve(episode, signal);
    await validate(bundle.video.url, signal, provider.id);
    return bundle;
  } catch (error) {
    signal.throwIfAborted();
    failure = error;
  }
  if (episode.serverId || episode.qualityId || !provider.resolveAlternatives || !["invalid_video", "invalid_manifest", "provider_unavailable", "upstream_unavailable", "resource_too_large", "resource_host_not_allowed", "encrypted_media_unsupported", "resource_timeout", "timeout", "no_source", "unsupported_server"].includes(providerFailureCode(failure))) throw failure;
  for await (const bundle of provider.resolveAlternatives(episode, signal)) {
    signal.throwIfAborted();
    try {
      await validate(bundle.video.url, signal, provider.id);
      return bundle;
    } catch (error) {
      signal.throwIfAborted();
      failure = error;
    }
  }
  throw failure;
}
export async function resolveProviderCandidates(episode: EpisodeRequest, providers: MediaProvider[], options: MediaResolutionOptions): Promise<ProviderResolution[]> {
  const completed = new Map<number, ProviderResolution>();
  try {
    await withDeadline(options.signal, options.totalTimeout ?? 30_000, async (totalSignal) => {
      let next = 0;
      const worker = async () => {
        while (next < providers.length && !totalSignal.aborted) {
          const index = next++;
          const provider = providers[index];
          const start = Date.now();
          try {
            const media = await withDeadline(totalSignal, options.providerTimeouts?.[provider.id] ?? options.providerTimeout ?? 12_000, async (signal) => {
              const bundle = await resolvePlayableBundle(provider, episode, signal, options.validateVideo);
              const subtitles = bundle.embeddedSubtitles ? [] : await resolveSubtitles(bundle.subtitles, (url, subtitleSignal) => options.probeSubtitle(url, subtitleSignal, provider.id), signal);
              signal.throwIfAborted();
              const thai = subtitles.filter((track) => track.language === "th");
              const hasEnglish = subtitles.some((track) => track.language === "en" && track.displaySupported);
              const hasThai = Boolean(bundle.embeddedSubtitles) || thai.some((track) => track.displaySupported);
              if (provider.requiresEnglishSubtitles && !hasEnglish) throw new MediaError("english_subtitle_unavailable");
              return { provider: provider.id, video: bundle.video, subtitles,
                ...(bundle.embeddedSubtitles ? { embeddedSubtitles: bundle.embeddedSubtitles } : {}),
                ...(bundle.selectedServerId ? { selectedServerId: bundle.selectedServerId } : {}),
                ...(bundle.qualities ? { qualities: bundle.qualities, selectedQualityId: bundle.selectedQualityId } : {}),
                metadata: { animeId: episode.animeId, episodeNumber: episode.episodeNumber },
                thaiStatus: bundle.embeddedSubtitles || thai.some((track) => track.availability === "available") ? "present" : thai.length ? "unavailable" : bundle.subtitles ? "absent_in_returned_tracks" : "unknown",
                selectionReason: hasThai ? "thai_subtitle" : hasEnglish ? "english_subtitle" : "video_only" } satisfies MediaResult;
            });
            completed.set(index, { provider: provider.id, media });
            options.log?.({ provider: provider.id, stage: "resolve", latencyMs: Date.now() - start, code: "ok" });
          } catch (error) {
            const reason = totalSignal.aborted ? totalSignal.reason : error;
            const code = providerFailureCode(reason);
            completed.set(index, { provider: provider.id, code });
            options.log?.({ provider: provider.id, stage: "resolve", latencyMs: Date.now() - start, code });
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(5, providers.length) }, worker));
    });
  } catch (error) {
    if (options.signal.aborted) throw error;
    if (!(error instanceof MediaError) || error.code !== "timeout") throw error;
  }
  options.signal.throwIfAborted();
  return providers.map((provider, index) => completed.get(index) ?? { provider: provider.id, code: "timeout" });
}
export async function resolveMedia(episode: EpisodeRequest, providers: MediaProvider[], options: MediaResolutionOptions): Promise<MediaResult> {
  const candidates = await resolveProviderCandidates(episode, providers, options);
  const successful = candidates.flatMap((candidate) => "media" in candidate ? [candidate.media] : []);
  successful.sort((left, right) => mediaPreference(right) - mediaPreference(left));
  if (!successful.length) {
    const failures = candidates.filter((candidate): candidate is { provider: string; code: string } => "code" in candidate);
    throw new MediaError(failures.find((candidate) => candidate.code === "timeout" || candidate.code === "resource_timeout")?.code ?? failures.at(-1)?.code ?? "no_source");
  }
  return successful[0];
}
