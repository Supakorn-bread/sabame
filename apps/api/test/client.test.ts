import { afterEach, describe, expect, it, vi } from "vitest";
import type { MalRepository } from "../src/database/repository.js";
import { MalClient } from "../src/mal/client.js";

const completed = {
  status: "completed",
  num_episodes_watched: 12,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-10-15T00:00:00Z",
};
const row = (id: number) => ({
  node: { id, title: `Title ${id}`, num_episodes: 12 },
  list_status: completed,
});

afterEach(() => vi.restoreAllMocks());

describe("MAL library content coverage", () => {
  it("includes content-filtered titles on every imported page", async () => {
    const repository = {
      account: vi.fn().mockResolvedValue({ user: { id: 1, name: "viewer" } }),
    } as unknown as MalRepository;
    const client = new MalClient(repository, 1);
    const requests: URL[] = [];
    vi.spyOn(client, "call").mockImplementation(async (path) => {
      const url = new URL(path, "https://api.myanimelist.net/v2/");
      requests.push(url);
      const includeAll = url.searchParams.get("nsfw") === "true";
      return url.searchParams.get("offset") === "0"
        ? {
            data: includeAll ? [row(1), row(2)] : [row(1)],
            paging: {
              next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=100",
            },
          }
        : { data: includeAll ? [row(3)] : [], paging: {} };
    });
    const items = await client.list();
    expect(items.map((item) => item.anime.id)).toEqual([
      "mal-1",
      "mal-2",
      "mal-3",
    ]);
    expect(requests.map((url) => url.searchParams.get("nsfw"))).toEqual([
      "true",
      "true",
    ]);
    expect(items.every((item) => item.entry.status === "completed")).toBe(true);
  });
});
