import { ANIME_CATALOG, getAnimeById } from "./seed";
import type { Anime, LibraryEntry, LibraryStatus } from "./types";

export interface TrackedAnime {
  anime: Anime;
  entry: LibraryEntry;
}

function trackedEntries(library: Record<string, LibraryEntry>, catalog: Record<string, Anime> = {}): TrackedAnime[] {
  return Object.values(library).flatMap((entry) => {
    const anime = getAnimeById(entry.animeId) ?? catalog[entry.animeId];
    return anime ? [{ anime, entry }] : [];
  });
}

export function getContinueWatching(library: Record<string, LibraryEntry>, catalog: Record<string, Anime> = {}) {
  return trackedEntries(library, catalog)
    .filter(({ entry }) => entry.status === "watching")
    .sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt));
}

export function getRecentActivity(library: Record<string, LibraryEntry>, limit = 4, catalog: Record<string, Anime> = {}) {
  return trackedEntries(library, catalog)
    .sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .slice(0, limit);
}

export function getLibraryCounts(library: Record<string, LibraryEntry>, catalog: Record<string, Anime> = {}) {
  const counts: Record<LibraryStatus, number> = {
    watching: 0,
    planned: 0,
    completed: 0,
    on_hold: 0,
    dropped: 0,
  };

  for (const { entry } of trackedEntries(library, catalog)) counts[entry.status] += 1;

  return { all: Object.values(counts).reduce((sum, count) => sum + count, 0), ...counts };
}

export function getCatalogWithEntries(library: Record<string, LibraryEntry>, catalog: Record<string, Anime> = {}) {
  return [...ANIME_CATALOG, ...Object.values(catalog)].map((anime) => ({ anime, entry: library[anime.id] })).filter(
    (item): item is { anime: Anime; entry: LibraryEntry } => Boolean(item.entry),
  );
}

export type LibraryFilter = LibraryStatus | "all";

export function filterLibrary(
  library: Record<string, LibraryEntry>,
  status: LibraryFilter,
  query: string,
  catalog: Record<string, Anime> = {},
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return getCatalogWithEntries(library, catalog).filter(({ anime, entry }) => {
    const matchesStatus = status === "all" || entry.status === status;
    const searchable = `${anime.title} ${anime.subtitle} ${anime.genres.join(" ")}`.toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}
