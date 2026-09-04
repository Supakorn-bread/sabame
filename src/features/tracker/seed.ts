import type { Anime, LibraryEntry } from "./types";

export const ANIME_CATALOG: Anime[] = [
  {
    id: "skyward-bloom",
    title: "Skyward Bloom",
    subtitle: "空へ咲く",
    synopsis: "A courier follows a trail of impossible flowers through cities suspended above the clouds.",
    genres: ["Adventure", "Fantasy"],
    totalEpisodes: 12,
    episodeMinutes: 24,
    accent: "violet",
  },
  {
    id: "neon-requiem",
    title: "Neon Requiem",
    subtitle: "ネオン・レクイエム",
    synopsis: "Memory smugglers race across a rain-lit megacity before dawn erases their last witness.",
    genres: ["Sci-fi", "Thriller"],
    totalEpisodes: 10,
    episodeMinutes: 23,
    accent: "cyan",
  },
  {
    id: "moonlit-recipe",
    title: "Moonlit Recipe",
    subtitle: "月夜のレシピ",
    synopsis: "A tiny midnight diner serves meals that help its guests recover one forgotten feeling.",
    genres: ["Slice of Life", "Drama"],
    totalEpisodes: 12,
    episodeMinutes: 22,
    accent: "rose",
  },
  {
    id: "constellation-code",
    title: "Constellation Code",
    subtitle: "星座コード",
    synopsis: "Student astronomers discover that the night sky has been transmitting a program for centuries.",
    genres: ["Mystery", "Sci-fi"],
    totalEpisodes: 24,
    episodeMinutes: 24,
    accent: "indigo",
  },
  {
    id: "last-shrine",
    title: "The Last Shrine",
    subtitle: "最後の社",
    synopsis: "A reluctant guardian protects the final doorway between a quiet seaside town and its spirits.",
    genres: ["Supernatural", "Drama"],
    totalEpisodes: 13,
    episodeMinutes: 24,
    accent: "amber",
  },
  {
    id: "harbor-of-wishes",
    title: "Harbor of Wishes",
    subtitle: "願いの港",
    synopsis: "Young sailors chart a luminous inland sea where every island remembers a different future.",
    genres: ["Fantasy", "Coming of age"],
    totalEpisodes: 12,
    episodeMinutes: 25,
    accent: "emerald",
  },
];

export function getAnimeById(animeId: string) {
  return ANIME_CATALOG.find((anime) => anime.id === animeId);
}

export function createSeedLibrary(): Record<string, LibraryEntry> {
  return {
    "skyward-bloom": {
      animeId: "skyward-bloom",
      status: "watching",
      watchedEpisodes: 5,
      currentEpisode: 6,
      playbackSeconds: 8 * 60 + 42,
      updatedAt: "2026-08-30T08:42:00.000Z",
    },
    "neon-requiem": {
      animeId: "neon-requiem",
      status: "watching",
      watchedEpisodes: 2,
      currentEpisode: 3,
      playbackSeconds: 0,
      updatedAt: "2026-08-29T14:10:00.000Z",
    },
    "moonlit-recipe": {
      animeId: "moonlit-recipe",
      status: "watching",
      watchedEpisodes: 8,
      currentEpisode: 9,
      playbackSeconds: 3 * 60 + 18,
      updatedAt: "2026-08-28T19:22:00.000Z",
    },
    "constellation-code": {
      animeId: "constellation-code",
      status: "planned",
      watchedEpisodes: 0,
      currentEpisode: 1,
      playbackSeconds: 0,
      updatedAt: "2026-08-27T06:45:00.000Z",
    },
    "last-shrine": {
      animeId: "last-shrine",
      status: "completed",
      watchedEpisodes: 13,
      currentEpisode: 13,
      playbackSeconds: 0,
      updatedAt: "2026-08-24T12:30:00.000Z",
    },
    "harbor-of-wishes": {
      animeId: "harbor-of-wishes",
      status: "planned",
      watchedEpisodes: 0,
      currentEpisode: 1,
      playbackSeconds: 0,
      updatedAt: "2026-08-22T15:08:00.000Z",
    },
  };
}
