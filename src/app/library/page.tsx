"use client";

import { Minus, Plus, Search, Star, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { filterLibrary, type LibraryFilter } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";
import type { LibraryStatus } from "@/features/tracker/types";

const filters: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "planned", label: "Plan to Watch" },
  { value: "completed", label: "Completed" },
];

const statusLabels: Record<LibraryStatus, string> = { watching: "Watching", planned: "Plan to Watch", completed: "Completed" };

export default function LibraryPage() {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title");
  const [feedback, setFeedback] = useState("");
  const library = useTrackerStore((state) => state.library);
  const setStatus = useTrackerStore((state) => state.setStatus);
  const setWatchedEpisodes = useTrackerStore((state) => state.setWatchedEpisodes);
  const results = filterLibrary(library, activeFilter, query).sort((a, b) => sort === "score" ? Number(b.anime.score ?? 0) - Number(a.anime.score ?? 0) : a.anime.title.localeCompare(b.anime.title));

  function updateProgress(animeId: string, title: string, episodes: number) {
    setWatchedEpisodes(animeId, episodes);
    setFeedback(`${title}: progress updated to ${episodes} episodes.`);
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
        <span className="sr-only">Search library</span><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={16} />
        <input id="library-search" value={query} onChange={(event) => setQuery(event.target.value)} type="search" placeholder="Search your anime collection…" className="glass-panel h-12 w-full rounded-lg pl-10 pr-14 text-sm" />
        {query && <button type="button" onClick={() => setQuery("")} className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center" aria-label="Clear search"><X size={15} /></button>}
      </div>
      <label className="flex items-center gap-3 text-sm text-[var(--text-soft)]">Sort by<select value={sort} onChange={(event) => setSort(event.target.value)} className="h-12 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3"><option value="title">Title A–Z</option><option value="score">Highest score</option></select></label>
      </div>
      <p role="status" className="mb-2 text-xs text-[var(--text-soft)]">{results.length} {results.length === 1 ? "title" : "titles"} found</p>
      <p role="status" className="mb-5 min-h-5 text-xs text-[var(--primary)]">{feedback}</p>

      {results.length > 0 ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 lg:gap-6">
          {results.map(({ anime, entry }) => {
            const progress = anime.totalEpisodes ? (entry.watchedEpisodes / anime.totalEpisodes) * 100 : 0;
            return (
              <article key={anime.id} className="group relative min-h-[360px] overflow-hidden rounded-xl bg-[var(--bg-high)] shadow-lg shadow-black/20 transition duration-300 hover:-translate-y-1">
                <Link href={`/watch/${anime.id}`} aria-label={`Watch ${anime.title}`} className="absolute inset-0"><AnimeArtwork anime={anime} className="h-full w-full" /></Link>
                <span className="absolute left-2 top-2 rounded-md border border-[var(--border-strong)] bg-[color-mix(in_srgb,var(--bg)_60%,transparent)] px-2 py-1 text-[0.62rem] font-medium text-[var(--primary)] backdrop-blur-md">{statusLabels[entry.status]}</span>
                <div className="absolute inset-x-0 bottom-0 border-t border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_54%,transparent)] p-3 backdrop-blur-md transition sm:p-4">
                  <Link href={`/watch/${anime.id}`}><h2 className="line-clamp-2 text-sm font-bold leading-tight sm:text-base">{anime.title}</h2></Link>
                  <div className="progress-glow mt-3 h-1 overflow-hidden rounded-full bg-[var(--bg-high)]"><div className="h-full rounded-full bg-[var(--primary-container)]" style={{ width: `${progress}%` }} /></div>
                  <div className="mt-2 flex items-center justify-between text-[0.62rem] text-[var(--text-soft)]"><span>{entry.watchedEpisodes} / {anime.totalEpisodes}</span><span className="flex items-center gap-1 text-[var(--gold)]"><Star size={10} fill="currentColor" />{anime.score}</span></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--border)] pt-2">
                    <button type="button" onClick={() => updateProgress(anime.id, anime.title, entry.watchedEpisodes - 1)} disabled={entry.watchedEpisodes === 0} className="grid h-11 w-11 place-items-center rounded border border-[var(--border)] disabled:opacity-30" aria-label={`Decrease ${anime.title} watched episodes`}><Minus size={16} /></button>
                    <button type="button" onClick={() => updateProgress(anime.id, anime.title, entry.watchedEpisodes + 1)} disabled={entry.watchedEpisodes === anime.totalEpisodes} className="grid h-11 w-11 place-items-center rounded border border-[var(--border)] disabled:opacity-30" aria-label={`Increase ${anime.title} watched episodes`}><Plus size={16} /></button>
                    <label className="w-full"><span className="sr-only">Status for {anime.title}</span><select value={entry.status} onChange={(event) => { setStatus(anime.id, event.target.value as LibraryStatus); setFeedback(`${anime.title}: moved to ${statusLabels[event.target.value as LibraryStatus]}.`); }} className="h-11 w-full rounded border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"><option value="watching">Watching</option><option value="planned">Plan to watch</option><option value="completed">Completed</option></select></label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="glass-panel grid min-h-72 place-items-center rounded-xl text-center"><div><h2 className="text-xl font-bold">No titles found</h2><button type="button" onClick={() => { setQuery(""); setActiveFilter("all"); }} className="mt-4 rounded-lg bg-[var(--primary-container)] px-4 py-2 text-xs font-bold text-[#312a58]">Show all titles</button></div></div>}
    </AppShell>
  );
}
