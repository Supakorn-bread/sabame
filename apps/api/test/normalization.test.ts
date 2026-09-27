// @vitest-environment node
import { describe, expect, it } from "vitest";
import { libraryItem } from "../src/mal/normalization.js";
import type { MalListStatus } from "@sabame/domain/mal";

const status: MalListStatus = {
  status: "watching",
  num_episodes_watched: 3,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-09-15T00:00:00Z",
};

describe("MAL artwork normalization", () => {
  it("prefers MAL's large picture for both cards and hero artwork", () => {
    const item = libraryItem(
      {
        id: 123,
        title: "A title",
        num_episodes: 12,
        main_picture: {
          medium: "https://cdn.myanimelist.net/images/anime/123/456.jpg",
          large: "https://cdn.myanimelist.net/images/anime/123/456l.jpg",
        },
      },
      status,
    );

    expect(item.anime.coverUrl).toBe(
      "https://cdn.myanimelist.net/images/anime/123/456l.jpg",
    );
    expect(item.anime.heroUrl).toBe(
      "https://cdn.myanimelist.net/images/anime/123/456l.jpg",
    );
  });

  it("falls back to the medium picture when a large picture is unavailable", () => {
    const item = libraryItem(
      {
        id: 123,
        title: "A title",
        num_episodes: 12,
        main_picture: {
          medium: "https://cdn.myanimelist.net/images/anime/123/456.jpg",
        },
      },
      status,
    );
    expect(item.anime.coverUrl).toBe(
      "https://cdn.myanimelist.net/images/anime/123/456.jpg",
    );
    expect(item.anime.heroUrl).toBeUndefined();
  });
});
