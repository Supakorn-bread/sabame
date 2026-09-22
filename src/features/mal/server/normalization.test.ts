// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { libraryItem } from "./normalization";
import type { MalListStatus } from "../types";

const status: MalListStatus = {
  status: "watching",
  num_episodes_watched: 3,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-09-15T00:00:00Z",
};

describe("MAL artwork normalization", () => {
  it("keeps MAL's large picture for hero artwork and medium picture for cards", () => {
    const item = libraryItem({
      id: 123,
      title: "A title",
      num_episodes: 12,
      main_picture: {
        medium: "https://cdn.myanimelist.net/images/anime/123/456.jpg",
        large: "https://cdn.myanimelist.net/images/anime/123/456l.jpg",
      },
    }, status);

    expect(item.anime.coverUrl).toBe("https://cdn.myanimelist.net/images/anime/123/456.jpg");
    expect(item.anime.heroUrl).toBe("https://cdn.myanimelist.net/images/anime/123/456l.jpg");
  });
});
