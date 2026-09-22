import { api, json } from "@/features/media/server/api";
import { getCatalogDetail } from "@/features/media/server/catalog";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal) => json(await getCatalogDetail((await context.params).animeId, signal)));
}
