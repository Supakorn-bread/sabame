import { api, json } from "@/features/media/server/api";
import { searchCatalog } from "@/features/media/server/catalog";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(request, async (signal) => {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length < 2 || query.length > 100) return json({ results: [] });
    return json({ results: await searchCatalog(query, signal) });
  });
}
