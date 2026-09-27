import { describe, expect, it } from "vitest";
import { ANIME_CATALOG } from "./seed";
import artwork from "@sabame/domain/seed-artwork";

describe("catalog artwork", () => {
  it("uses fetched MAL artwork for every seed and never overrides it with mock hero images", () => {
    for (const anime of ANIME_CATALOG) {
      expect(anime.coverUrl).toBe(artwork[anime.id as keyof typeof artwork].coverUrl);
      expect(new URL(anime.coverUrl!).hostname).toBe("cdn.myanimelist.net");
      expect(anime.heroUrl).toBeUndefined();
    }
  });
});
