import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { Anime } from "@/features/tracker/types";
import { AnimeArtwork } from "./anime-artwork";

afterEach(cleanup);
const anime: Anime = { id: "mal-123", title: "Artwork fixture", subtitle: "", synopsis: "", genres: [], totalEpisodes: 12, episodeMinutes: 24, accent: "violet",
  coverUrl: "https://cdn.myanimelist.net/images/anime/123/456.jpg",
  heroUrl: "https://cdn.myanimelist.net/images/anime/123/456l.jpg" };

describe("large library artwork", () => {
  it("uses the stored large image without changing the cover crop", () => {
    const { container } = render(<AnimeArtwork anime={anime} preferLarge zoomOnHover={false} sizes="240px" />);
    const image = container.querySelector("img")!;
    expect(decodeURIComponent(image.getAttribute("src")!)).toContain(anime.heroUrl);
    expect(image).toHaveClass("object-cover", "object-center");
    expect(image.className).not.toContain("scale-105");
    expect(image).toHaveAttribute("sizes", "240px");
  });
  it("falls back to the available cover and preserves defaults elsewhere", () => {
    const { container, rerender } = render(<AnimeArtwork anime={{ ...anime, heroUrl: undefined }} preferLarge />);
    expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).toContain(anime.coverUrl);
    rerender(<AnimeArtwork anime={anime} />);
    expect(decodeURIComponent(container.querySelector("img")!.getAttribute("src")!)).toContain(anime.coverUrl);
  });
});
