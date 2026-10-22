// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./animeruka", () => ({ getAnimerukaServers: vi.fn() }));
import { GET } from "@/app/api/anime/[animeId]/media/servers/route";
import { getAnimerukaServers } from "./animeruka";
import { readMediaRequest } from "./api";

afterEach(() => vi.clearAllMocks());
const context = { params: Promise.resolve({ animeId: "mal-123" }) };
it("returns only current public origin IDs and labels with no-store", async () => {
  const result = { provider: "animeruka" as const, defaultServerId: "1", servers: [{ id: "1", label: "หลัก" }, { id: "2", label: "สำรอง1" }] };
  vi.mocked(getAnimerukaServers).mockResolvedValue(result);
  const response = await GET(new Request("https://sabame.test/api/anime/mal-123/media/servers?episodeNumber=1&provider=animeruka"), context);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual(result);
  expect(getAnimerukaServers).toHaveBeenCalledWith({ animeId: "mal-123", episodeNumber: 1 }, expect.any(AbortSignal));
});
it.each(["episodeNumber=0&provider=animeruka", "episodeNumber=1&provider=anizone", "episodeNumber=1&provider=animeruka&serverId=2", "episodeNumber=1&episodeNumber=2&provider=animeruka"])("rejects invalid discovery query %s", async (query) => {
  const response = await GET(new Request(`https://sabame.test/api/anime/mal-123/media/servers?${query}`), context);
  expect(response.status).toBe(400);
  expect(getAnimerukaServers).not.toHaveBeenCalled();
});
it("accepts only bounded AnimeRuka origin IDs in POST bodies", async () => {
  const body = (payload: unknown) => new Request("https://sabame.test/api/anime/mal-123/media", { method: "POST", body: JSON.stringify(payload) });
  expect(await readMediaRequest(body({ episodeNumber: 1, provider: "animeruka", serverId: "2" }))).toEqual({ episodeNumber: 1, provider: "animeruka", serverId: "2" });
  for (const payload of [{ episodeNumber: 1, serverId: "2" }, { episodeNumber: 1, provider: "anifume", serverId: "2" }, { episodeNumber: 1, provider: "animeruka", serverId: "https://evil.test" }, { episodeNumber: 1, provider: "animeruka", serverId: 2 }, { episodeNumber: 1, provider: "animeruka", serverId: "0001" }]) await expect(readMediaRequest(body(payload))).rejects.toThrow("invalid_request");
});
