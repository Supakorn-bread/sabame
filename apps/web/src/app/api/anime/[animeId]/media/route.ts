import { api, json, readMediaRequest } from "@/features/media/server/api";
import { fetchMetadata } from "@/features/media/server/catalog";
import { prepareDelivery, probeSubtitle, validateVideo } from "@/features/media/server/delivery";
import { mediaProviders } from "@/features/media/server/providers";
import { resolveMedia, withDeadline } from "@/features/media/resolver";
import { preferThaiSubtitle } from "@/features/media/subtitles";
import { MediaError } from "@/features/media/types";
import { appendSubdlThaiSubtitle } from "@/features/media/server/subdl";
import { appendBilibiliThaiSubtitle } from "@/features/media/server/bilibili";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal, requestId) => {
    const started = Date.now();
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new MediaError("invalid_request");
    const { episodeNumber, provider, serverId, qualityId } = await readMediaRequest(request);
    const { animeId } = await context.params;
    const metadata = await withDeadline(signal, 12_000, (metadataSignal) => fetchMetadata(animeId, metadataSignal));
    const remainingTimeout = Math.max(1, 29_000 - (Date.now() - started));
    const providers = mediaProviders.filter((candidate) => !provider || candidate.id === provider);
    const result = await resolveMedia({ animeId, episodeNumber, ...(serverId ? { serverId } : {}), ...(qualityId ? { qualityId } : {}) }, providers, { signal, probeSubtitle, validateVideo,
      totalTimeout: remainingTimeout,
      providerTimeout: provider ? remainingTimeout : Math.min(12_000, remainingTimeout),
      log: (event) => console.info(JSON.stringify({ requestId, ...event })) });
    const prepared = prepareDelivery(result);
    if (prepared.provider === "anizone" || prepared.embeddedSubtitles) return json(prepared);
    const subtitleBudget = Math.max(0, 28_500 - (Date.now() - started));
    const [bilibili, subdl] = await Promise.all([
      appendBilibiliThaiSubtitle(prepared, metadata, signal, subtitleBudget),
      appendSubdlThaiSubtitle(prepared, metadata, signal, subtitleBudget),
    ]);
    return json(preferThaiSubtitle(bilibili.subtitles.some((track) => track.language === "th" && track.displaySupported) ? bilibili : subdl));
  });
}
