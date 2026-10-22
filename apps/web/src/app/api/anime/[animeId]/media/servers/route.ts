import { api, json } from "@/features/media/server/api";
import { getAnimerukaServers } from "@/features/media/server/animeruka";
import { MediaError } from "@/features/media/types";

export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ animeId: string }> }) {
  return api(request, async (signal) => {
    const url = new URL(request.url);
    const episode = url.searchParams.get("episodeNumber") ?? "";
    if (url.searchParams.get("provider") !== "animeruka" || !/^[1-9]\d{0,3}$/.test(episode) || url.searchParams.getAll("episodeNumber").length !== 1 || url.searchParams.getAll("provider").length !== 1 || [...url.searchParams.keys()].some((key) => key !== "episodeNumber" && key !== "provider")) throw new MediaError("invalid_request");
    const { animeId } = await context.params;
    return json(await getAnimerukaServers({ animeId, episodeNumber: Number(episode) }, signal));
  });
}
