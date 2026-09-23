"use client";

import { Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { LibraryAnimeCard, libraryStatusLabels } from "@/components/library-anime-card";
import { AppShell } from "@/components/layout/app-shell";
import { filterLibrary, type LibraryFilter } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";
import type { LibraryStatus } from "@/features/tracker/types";

const filters: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "planned", label: "Plan to Watch" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

export default function LibraryPage() {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [feedback, setFeedback] = useState("");
  const library = useTrackerStore((state) => state.library);
  const setStatus = useTrackerStore((state) => state.setStatus);
  const setWatchedEpisodes = useTrackerStore((state) => state.setWatchedEpisodes);
  const catalog = useTrackerStore((state) => state.catalog);
  const results = filterLibrary(library, activeFilter, query, catalog).sort((a, b) => sort === "score" ? Number(b.anime.score ?? 0) - Number(a.anime.score ?? 0) : a.anime.title.localeCompare(b.anime.title));
  const hasLibraryEntries = Object.keys(library).length > 0;

  function updateProgress(animeId: string, title: string, episodes: number) {
    setWatchedEpisodes(animeId, episodes);
    setFeedback(`${title}: progress updated to ${episodes} episodes.`);
  }

  function updateStatus(animeId: string, title: string, status: LibraryStatus) {
    setStatus(animeId, status);
    setFeedback(`${title}: moved to ${libraryStatusLabels[status]}.`);
  }

  return (
    <AppShell>
      <section className="mb-10 mt-4 flex flex-col gap-6 md:flex-row md:items-end md:justify-between" aria-labelledby="library-title">
        <div><h1 id="library-title" className="screen-title">My Library</h1><p className="mt-2 text-sm text-[var(--text-soft)]">Manage and track your anime collection.</p></div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Library status">
          {filters.map(({ value, label }) => <button key={value} type="button" aria-pressed={activeFilter === value} onClick={() => setActiveFilter(value)} className={`min-h-11 rounded-full px-4 py-2 text-xs font-medium transition ${activeFilter === value ? "bg-[var(--primary-container)] text-[#312a58]" : "glass-panel text-[var(--text-soft)] hover:border-[var(--border-strong)]"}`}>{label}</button>)}
        </div>
      </section>

      <div className="mb-3 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <label htmlFor="library-search" className="sr-only">Search library</label>
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={16} />
          <input id="library-search" value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search your anime collection…" className="glass-panel h-12 w-full rounded-lg pl-10 pr-14 text-sm" />
          {query ? <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-lg" aria-label="Clear search"><X aria-hidden="true" size={15} /></button> : null}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm text-[var(--text-soft)] sm:justify-start">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)} className="h-12 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"><option value="title">Title A–Z</option><option value="score">Highest score</option></select></label>
      </div>
      <p role="status" className="mb-2 text-xs text-[var(--text-soft)]">{results.length} {results.length === 1 ? "title" : "titles"} found</p>
      <p role="status" className="mb-5 min-h-5 text-xs text-[var(--primary)]">{feedback}</p>

      {results.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 min-[500px]:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 lg:gap-6 xl:grid-cols-5">
          {results.map(({ anime, entry }) => <LibraryAnimeCard key={anime.id} anime={anime} entry={entry} onProgressChange={updateProgress} onStatusChange={updateStatus} />)}
        </div>
      ) : hasLibraryEntries ? (
        <div className="glass-panel grid min-h-72 place-items-center rounded-xl p-6 text-center">
          <div>
            <h2 className="text-xl font-bold">No matching titles</h2>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Try another search or show every status in your library.</p>
            <button type="button" onClick={() => { setQuery(""); setActiveFilter("all"); }} className="mt-5 min-h-11 rounded-lg bg-[var(--primary-container)] px-5 text-sm font-bold text-[#312a58]">Clear search and filters</button>
          </div>
        </div>
      ) : (
        <div className="glass-panel grid min-h-72 place-items-center rounded-xl p-6 text-center">
          <div>
            <h2 className="text-xl font-bold">Your library is empty</h2>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Find an anime to start building your watch list.</p>
            <Link href="/search" className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-5 text-sm font-bold text-[#312a58]"><Search aria-hidden="true" size={16} />Find anime</Link>
          </div>
        </div>
      )}
    </AppShell>
  );
}
