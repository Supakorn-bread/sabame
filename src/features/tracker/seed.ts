import type { Anime, LibraryEntry } from "./types";
import artwork from "./seed-artwork.json";

export const STITCH_ASSETS = {
  avatar: "https://lh3.googleusercontent.com/aida-public/AB6AXuBA38VzzAqR1PW-ll9TUrmmnQ8gbIXQS1VthXr3Ub60Re0iEUT23_OoWDEihtIresRgGePPTNsMpkV9MQyf-PT1-qv_tdTEZoQ712USRORYNxQFCp2nTqcYZiq4tjPRHqBvkorTOvpWm7DdpHvcdoVWlj9aEzYtlXhsO6EAV_4tEMwuxglM3MLaOvFyfWqucsgw8QHLb2AqAnNEd_nyk8ro0UuMvbVTXz7fQ9prQ6o4DgytZJCPFRRADA",
} as const;

export const ANIME_CATALOG: Anime[] = [
  { id: "skyward-bloom", title: "Frieren: Beyond Journey's End", subtitle: "Sousou no Frieren", synopsis: "After the party of heroes defeated the Demon King, the elven mage Frieren comes face to face with humanity's mortality and begins a new journey.", genres: ["Adventure", "Drama", "Fantasy"], totalEpisodes: 28, episodeMinutes: 24, accent: "violet", score: "9.14", coverUrl: artwork["skyward-bloom"].coverUrl },
  { id: "neon-requiem", title: "Cyberpunk: Edgerunners", subtitle: "Cyberpunk", synopsis: "A street kid tries to survive in a technology-obsessed city by becoming an edgerunner.", genres: ["Action", "Sci-fi"], totalEpisodes: 10, episodeMinutes: 24, accent: "cyan", score: "8.6", coverUrl: artwork["neon-requiem"].coverUrl },
  { id: "moonlit-recipe", title: "Mushoku Tensei S2", subtitle: "Jobless Reincarnation", synopsis: "A second chance at life unfolds across a richly imagined fantasy world.", genres: ["Fantasy", "Drama"], totalEpisodes: 24, episodeMinutes: 24, accent: "rose", score: "8.5", coverUrl: artwork["moonlit-recipe"].coverUrl },
  { id: "constellation-code", title: "Jujutsu Kaisen Season 2", subtitle: "Hidden Inventory", synopsis: "Sorcerers confront a past that will reshape the jujutsu world.", genres: ["Action", "Supernatural"], totalEpisodes: 23, episodeMinutes: 24, accent: "indigo", score: "8.8", coverUrl: artwork["constellation-code"].coverUrl },
  { id: "last-shrine", title: "Demon Slayer: Hashira Training Arc", subtitle: "Kimetsu no Yaiba", synopsis: "Tanjiro trains with the Hashira ahead of the final battle.", genres: ["Action", "Fantasy"], totalEpisodes: 8, episodeMinutes: 24, accent: "amber", score: "8.4", coverUrl: artwork["last-shrine"].coverUrl },
  { id: "harbor-of-wishes", title: "The Eminence in Shadow", subtitle: "Shadow Garden", synopsis: "A mastermind in the shadows builds the secret organization of his dreams.", genres: ["Action", "Comedy"], totalEpisodes: 20, episodeMinutes: 24, accent: "emerald", score: "8.2", coverUrl: artwork["harbor-of-wishes"].coverUrl },
];

export function getAnimeById(animeId: string) {
  return ANIME_CATALOG.find((anime) => anime.id === animeId);
}

export function createSeedLibrary(): Record<string, LibraryEntry> {
  return {
    "skyward-bloom": { animeId: "skyward-bloom", status: "watching", watchedEpisodes: 12, currentEpisode: 14, playbackSeconds: 863, updatedAt: "2026-08-30T08:42:00.000Z" },
    "neon-requiem": { animeId: "neon-requiem", status: "watching", watchedEpisodes: 7, currentEpisode: 8, playbackSeconds: 0, updatedAt: "2026-08-29T14:10:00.000Z" },
    "moonlit-recipe": { animeId: "moonlit-recipe", status: "watching", watchedEpisodes: 8, currentEpisode: 9, playbackSeconds: 198, updatedAt: "2026-08-28T19:22:00.000Z" },
    "constellation-code": { animeId: "constellation-code", status: "planned", watchedEpisodes: 0, currentEpisode: 1, playbackSeconds: 0, updatedAt: "2026-08-27T06:45:00.000Z" },
    "last-shrine": { animeId: "last-shrine", status: "completed", watchedEpisodes: 8, currentEpisode: 8, playbackSeconds: 0, updatedAt: "2026-08-24T12:30:00.000Z" },
    "harbor-of-wishes": { animeId: "harbor-of-wishes", status: "planned", watchedEpisodes: 0, currentEpisode: 1, playbackSeconds: 0, updatedAt: "2026-08-22T15:08:00.000Z" },
  };
}
