import { api, json } from "@/features/media/server/api";
import { getProviderEpisodes } from "@/features/media/server/providers";

export const runtime = "nodejs";

export async function GET(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal) => {
    const { animeId } = await context.params;
    return json({ episodes: await getProviderEpisodes(animeId, signal) });
  });
}
