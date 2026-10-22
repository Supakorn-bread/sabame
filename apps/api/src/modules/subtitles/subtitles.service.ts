import { Injectable } from "@nestjs/common";
import { fetchMetadata } from "@sabame/catalog/catalog";
import { MediaError } from "@sabame/domain/media";
import { api, json } from "../../catalog/http.js";
import { discoverSubdl } from "./subdl.js";

@Injectable()
export class SubtitlesService {
  async find(request: Request, animeId: string): Promise<Response> {
    const response = await api(request, async (signal) => {
      const value =
        new URL(request.url).searchParams.get("episodeNumber") ?? "";
      const episode = Number(value);
      if (!/^[1-9]\d{0,3}$/.test(value) || !Number.isSafeInteger(episode))
        throw new MediaError("invalid_request");
      const key = process.env.SUBDL_API_KEY?.trim();
      if (!key) return json({ candidates: [] });
      const metadata = await fetchMetadata(animeId, signal);
      return json({
        candidates: await discoverSubdl(metadata, episode, signal, key),
      });
    });
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
