import { FetchTransport, HttpClient, MalMeta } from "anime-sdk";

const http = new HttpClient({ transport: new FetchTransport(), timeoutMs: 10_000, retry: false });
export const metadataProvider = new MalMeta(http, { defaultSearchType: "ANIME" });
