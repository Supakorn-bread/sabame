import { api, json } from "@/features/media/server/api";
import { getCatalogEpisodes } from "@/features/media/server/catalog";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal) => json({ episodes: await getCatalogEpisodes((await context.params).animeId, signal) }));
}
