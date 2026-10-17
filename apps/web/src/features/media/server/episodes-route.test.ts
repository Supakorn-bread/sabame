// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./providers", () => ({ getProviderEpisodes: vi.fn() }));
import { GET } from "@/app/api/anime/[animeId]/available-episodes/route";
import { getProviderEpisodes } from "./providers";
import { MediaError } from "../types";

afterEach(() => vi.restoreAllMocks());

it("returns the provider catalog without synthesizing metadata episodes", async () => {
  vi.mocked(getProviderEpisodes).mockResolvedValue([{ number: 4, title: "Fourth" }]);
  const response = await GET(new Request("https://sabame.test/api/anime/mal-1/available-episodes"), { params: Promise.resolve({ animeId: "mal-1" }) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ episodes: [{ number: 4, title: "Fourth" }] });
});

it("keeps unavailable mappings distinct from an empty provider catalog", async () => {
  vi.mocked(getProviderEpisodes).mockRejectedValue(new MediaError("mapping_required"));
  vi.spyOn(console, "info").mockImplementation(() => {});
  const response = await GET(new Request("https://sabame.test/api/anime/mal-1/available-episodes"), { params: Promise.resolve({ animeId: "mal-1" }) });
  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: "mapping_required" } });
});
