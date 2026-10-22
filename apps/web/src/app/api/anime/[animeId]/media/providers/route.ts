import { api, json } from "@/features/media/server/api";
import { fetchMetadata } from "@/features/media/server/catalog";
import { probeSubtitle, validateVideo } from "@/features/media/server/delivery";
import { discoverMediaProviders } from "@/features/media/server/provider-discovery";
import { mediaProviders } from "@/features/media/server/providers";
import { withDeadline } from "@/features/media/resolver";
import { MediaError } from "@/features/media/types";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal, requestId) => {
    const start = Date.now();
    const url = new URL(request.url);
    const value = url.searchParams.get("episodeNumber") ?? "";
    if (!/^[1-9]\d{0,3}$/.test(value) || url.searchParams.getAll("episodeNumber").length !== 1 || [...url.searchParams.keys()].some((key) => key !== "episodeNumber")) throw new MediaError("invalid_request");
    const { animeId } = await context.params;
    await withDeadline(signal, 12_000, (metadataSignal) => fetchMetadata(animeId, metadataSignal));
    const remaining = Math.max(1, 29_000 - (Date.now() - start));
    return json(await discoverMediaProviders({ animeId, episodeNumber: Number(value) }, mediaProviders, { signal, validateVideo, probeSubtitle, totalTimeout: remaining, providerTimeout: Math.min(12_000, remaining),
      log: (event) => console.info(JSON.stringify({ requestId, ...event })) }));
  });
}
