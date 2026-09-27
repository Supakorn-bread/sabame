import "server-only";
import { AnimeParadiseProvider, FetchTransport, HttpClient, MappingClient } from "anime-sdk";

const transport = new FetchTransport();
export const http = new HttpClient({ transport, timeoutMs: 10_000, retry: false });
export { metadataProvider } from "@sabame/catalog/metadata-sdk";
export const animeParadise = new AnimeParadiseProvider(http);
export const mappingClient = new MappingClient(http, {
  disableMalsync: true, disableAnify: true, disableArmServer: true,
  minSimilarity: 0.95, yearTolerance: 0, episodeCountTolerance: 0, fuzzyConcurrency: 2,
});
