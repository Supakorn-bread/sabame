import { Injectable } from "@nestjs/common";
import {
  searchCatalog,
  getCatalogDetail,
  getCatalogEpisodes,
} from "@sabame/catalog/catalog";
import { fetchSeasonalCatalog } from "@sabame/catalog/seasonal";
import { MediaError } from "@sabame/domain/media";
import {
  currentSeason,
  isSeason,
  validSeasonYear,
} from "@sabame/domain/seasonal";
import { api, json } from "../../catalog/http.js";

@Injectable()
export class CatalogService {
  async search(request: Request): Promise<Response> {
    return api(request, async (signal) => {
      const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      if (query.length < 2 || query.length > 100) return json({ results: [] });
      return json({ results: await searchCatalog(query, signal) });
    });
  }

  async detail(request: Request, animeId: string): Promise<Response> {
    return api(request, async (signal) =>
      json(await getCatalogDetail(animeId, signal)),
    );
  }

  async episodes(request: Request, animeId: string): Promise<Response> {
    return api(request, async (signal) =>
      json({
        episodes: await getCatalogEpisodes(animeId, signal),
      }),
    );
  }

  async seasonal(request: Request): Promise<Response> {
    return api(request, async (signal) => {
      const params = new URL(request.url).searchParams;
      const year = Number(params.get("year"));
      const season = params.get("season");
      const page = Number(params.get("page") ?? 1);
      if (
        !validSeasonYear(year, currentSeason().year) ||
        !isSeason(season) ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 100
      ) {
        throw new MediaError("invalid_request");
      }
      return json(await fetchSeasonalCatalog({ year, season }, page, signal));
    });
  }
}
