import { api, json } from "@/features/media/server/api";
import { MediaError } from "@/features/media/types";
import { currentSeason, isSeason, validSeasonYear } from "@/features/seasonal/model";
import { fetchSeasonalCatalog } from "@/features/seasonal/server/catalog";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return api(request, async (signal) => {
    const params = new URL(request.url).searchParams;
    const year = Number(params.get("year"));
    const season = params.get("season");
    const page = Number(params.get("page") ?? 1);
    if (!validSeasonYear(year, currentSeason().year) || !isSeason(season) || !Number.isInteger(page) || page < 1 || page > 100) throw new MediaError("invalid_request");
    return json(await fetchSeasonalCatalog({ year, season }, page, signal));
  });
}
