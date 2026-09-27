import { api, json, readEpisodeNumber } from "@/features/media/server/api";
import { fetchMetadata } from "@/features/media/server/catalog";
import { prepareDelivery, probeSubtitle, validateVideo } from "@/features/media/server/delivery";
import { mediaProviders } from "@/features/media/server/providers";
import { resolveMedia, withDeadline } from "@/features/media/resolver";
import { MediaError } from "@/features/media/types";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal, requestId) => {
    const started = Date.now();
    if (request.headers.get("origin") && request.headers.get("origin") !== new URL(request.url).origin) throw new MediaError("invalid_request");
    const episodeNumber = await readEpisodeNumber(request);
    const { animeId } = await context.params;
    await withDeadline(signal, 12_000, (metadataSignal) => fetchMetadata(animeId, metadataSignal));
    const result = await resolveMedia({ animeId, episodeNumber }, mediaProviders, { signal, probeSubtitle, validateVideo,
      // Finish selection before the outer request deadline so a valid earlier bundle survives.
      totalTimeout: Math.max(1, 29_000 - (Date.now() - started)),
      log: (event) => console.info(JSON.stringify({ requestId, ...event })) });
    return json(prepareDelivery(result));
  });
}
