import { ANIME_CATALOG, getAnimeById } from "./seed";
import type { Anime, LibraryEntry, LibraryStatus } from "./types";

export interface TrackedAnime {
  anime: Anime;
  entry: LibraryEntry;
}

function trackedEntries(library: Record<string, LibraryEntry>): TrackedAnime[] {
  return Object.values(library).flatMap((entry) => {
    const anime = getAnimeById(entry.animeId);
    return anime ? [{ anime, entry }] : [];
  });
}

export function getContinueWatching(library: Record<string, LibraryEntry>) {
  return trackedEntries(library)
    .filter(({ entry }) => entry.status === "watching")
    .sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt));
}

export function getRecentActivity(library: Record<string, LibraryEntry>, limit = 4) {
  return trackedEntries(library)
    .sort((a, b) => b.entry.updatedAt.localeCompare(a.entry.updatedAt))
    .slice(0, limit);
}

export function getLibraryCounts(library: Record<string, LibraryEntry>) {
  const counts: Record<LibraryStatus, number> = {
    watching: 0,
    planned: 0,
    completed: 0,
  };

  for (const { entry } of trackedEntries(library)) counts[entry.status] += 1;

  return { all: Object.values(counts).reduce((sum, count) => sum + count, 0), ...counts };
}

export function getCatalogWithEntries(library: Record<string, LibraryEntry>) {
  return ANIME_CATALOG.map((anime) => ({ anime, entry: library[anime.id] })).filter(
    (item): item is { anime: Anime; entry: LibraryEntry } => Boolean(item.entry),
  );
}

export type LibraryFilter = LibraryStatus | "all";

export function filterLibrary(
  library: Record<string, LibraryEntry>,
  status: LibraryFilter,
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return getCatalogWithEntries(library).filter(({ anime, entry }) => {
    const matchesStatus = status === "all" || entry.status === status;
    const searchable = `${anime.title} ${anime.subtitle} ${anime.genres.join(" ")}`.toLocaleLowerCase();
    return matchesStatus && (!normalizedQuery || searchable.includes(normalizedQuery));
  });
}
