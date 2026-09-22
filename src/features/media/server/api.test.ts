// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { api, readEpisodeNumber } from "./api";
import { MediaError } from "../types";
afterEach(() => vi.restoreAllMocks());
describe("media API contract", () => {
  it.each(["{}", "null", "{", '{"episodeNumber":0}', '{"episodeNumber":1.5}', '{"episodeNumber":"1"}', " ".repeat(257)])("rejects invalid or excessive input", async (body) => {
    await expect(readEpisodeNumber(new Request("https://sabame.test/api", { method: "POST", body }))).rejects.toThrow("invalid_request");
  });
  it("accepts only an episode number", async () => {
    expect(await readEpisodeNumber(new Request("https://sabame.test/api", { method: "POST", body: '{"episodeNumber":3}' }))).toBe(3);
  });
  it("redacts upstream exceptions and provides a safe request ID", async () => {
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const response = await api(new Request("https://sabame.test/api"), async () => { throw new Error("https://provider.test/SECRET_TOKEN"); });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: "upstream_unavailable", requestId: expect.any(String) } });
    expect(JSON.stringify(log.mock.calls)).not.toContain("SECRET_TOKEN");
    const expired = await api(new Request("https://sabame.test/api"), async () => { throw new MediaError("source_expired"); });
    expect(expired.status).toBe(410);
    const noSource = await api(new Request("https://sabame.test/api"), async () => { throw new MediaError("no_source"); });
    expect(noSource.status).toBe(404);
  });
});
