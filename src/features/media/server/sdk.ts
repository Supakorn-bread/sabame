import "server-only";
import { AnimeParadiseProvider, FetchTransport, HttpClient, MalMeta, MappingClient } from "anime-sdk";

const transport = new FetchTransport();
export const http = new HttpClient({ transport, timeoutMs: 10_000, retry: false });
export const metadataProvider = new MalMeta(http, { defaultSearchType: "ANIME" });
export const animeParadise = new AnimeParadiseProvider(http);
export const mappingClient = new MappingClient(http, {
  disableMalsync: true, disableAnify: true, disableArmServer: true,
  minSimilarity: 0.95, yearTolerance: 0, episodeCountTolerance: 0, fuzzyConcurrency: 2,
});
