"use client";

import { BookOpen, Minus, Play, Plus, Search, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ProgressBar } from "@/components/ui/progress-bar";
import { filterLibrary, getLibraryCounts, type LibraryFilter } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";
import type { LibraryStatus } from "@/features/tracker/types";

const filters: { value: LibraryFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "watching", label: "Watching" },
  { value: "planned", label: "Planned" },
  { value: "completed", label: "Completed" },
];

const statusLabels: Record<LibraryStatus, string> = {
  watching: "Watching",
  planned: "Plan to watch",
  completed: "Completed",
};

export default function LibraryPage() {
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>("all");
  const [query, setQuery] = useState("");
  const library = useTrackerStore((state) => state.library);
  const setStatus = useTrackerStore((state) => state.setStatus);
  const setWatchedEpisodes = useTrackerStore((state) => state.setWatchedEpisodes);
  const counts = getLibraryCounts(library);
  const results = filterLibrary(library, activeFilter, query);

  return (
    <AppShell>
      <div className="mb-8 max-w-3xl sm:mb-10">
        <p className="eyebrow mb-3">Your collection</p>
        <h1 className="screen-title">Library</h1>
        <p className="mt-4 text-sm leading-7 text-[var(--text-soft)] sm:text-base">Every story you are following, planning, and carrying with you.</p>
      </div>

      <section className="glass-panel mb-6 rounded-[1.75rem] p-3 sm:p-4" aria-label="Library controls">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex gap-1 overflow-x-auto rounded-2xl p-1" role="tablist" aria-label="Library status">
            {filters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeFilter === value}
                onClick={() => setActiveFilter(value)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-extrabold transition sm:px-4 ${
                  activeFilter === value
                    ? "bg-[var(--primary-soft)] text-[var(--primary)]"
                    : "text-[var(--text-soft)] hover:text-[var(--text)]"
                }`}
              >
                {label}
                <span className="rounded-full bg-[color-mix(in_srgb,var(--text)_8%,transparent)] px-2 py-0.5 text-[0.62rem]">{counts[value]}</span>
              </button>
            ))}
          </div>

          <label className="relative block min-w-0 xl:w-80">
            <span className="sr-only">Search library</span>
            <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" size={17} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Search title or genre"
              className="h-11 w-full rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] pl-11 pr-11 text-sm outline-none transition placeholder:text-[var(--text-faint)] focus:border-[var(--border-strong)]"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-xl text-[var(--text-faint)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]" aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
        </div>
      </section>

      <div className="mb-5 flex items-center justify-between text-xs font-bold text-[var(--text-faint)]">
        <span>{results.length} {results.length === 1 ? "title" : "titles"}</span>
        <span>Progress saves automatically</span>
      </div>

      {results.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {results.map(({ anime, entry }) => {
            const progress = anime.totalEpisodes ? (entry.watchedEpisodes / anime.totalEpisodes) * 100 : 0;

            return (
              <article key={anime.id} className="glass-panel group overflow-hidden rounded-[1.75rem] transition hover:-translate-y-1 hover:border-[var(--border-strong)]">
                <Link href={`/watch/${anime.id}`} className="relative block">
                  <AnimeArtwork anime={anime} className="aspect-[4/3] w-full" />
                  <span className="absolute bottom-4 right-4 grid h-11 w-11 place-items-center rounded-full border border-white/20 bg-black/45 text-white opacity-90 shadow-xl backdrop-blur transition group-hover:scale-105 group-hover:bg-[var(--primary)] group-hover:text-[var(--primary-text)]">
                    <Play size={16} fill="currentColor" />
                  </span>
                </Link>
                <div className="p-5">
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href={`/watch/${anime.id}`} className="rounded-lg"><h2 className="truncate text-lg font-bold tracking-[-0.04em]">{anime.title}</h2></Link>
                      <p className="mt-1 truncate text-xs font-semibold text-[var(--text-faint)]">{anime.genres.join(" · ")}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--primary-soft)] px-2.5 py-1 text-[0.6rem] font-extrabold text-[var(--primary)]">{statusLabels[entry.status]}</span>
                  </div>

                  <div className="my-5">
                    <ProgressBar value={progress} label={`${anime.title}: ${entry.watchedEpisodes} of ${anime.totalEpisodes} episodes`} />
                    <div className="mt-2 flex items-center justify-between text-xs font-bold text-[var(--text-soft)]"><span>Episode progress</span><span>{entry.watchedEpisodes} / {anime.totalEpisodes}</span></div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="flex h-10 items-center rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] p-1">
                      <button type="button" onClick={() => setWatchedEpisodes(anime.id, entry.watchedEpisodes - 1)} disabled={entry.watchedEpisodes === 0} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-soft)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Decrease ${anime.title} watched episodes`}><Minus size={14} /></button>
                      <button type="button" onClick={() => setWatchedEpisodes(anime.id, entry.watchedEpisodes + 1)} disabled={entry.watchedEpisodes === anime.totalEpisodes} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--text-soft)] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] disabled:cursor-not-allowed disabled:opacity-30" aria-label={`Increase ${anime.title} watched episodes`}><Plus size={14} /></button>
                    </div>
                    <label className="min-w-0 flex-1">
                      <span className="sr-only">Status for {anime.title}</span>
                      <select value={entry.status} onChange={(event) => setStatus(anime.id, event.target.value as LibraryStatus)} className="h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-3 text-xs font-bold outline-none focus:border-[var(--border-strong)]">
                        <option value="watching">Watching</option>
                        <option value="planned">Plan to watch</option>
                        <option value="completed">Completed</option>
                      </select>
                    </label>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel grid min-h-72 place-items-center rounded-[2rem] p-8 text-center">
          <div>
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><BookOpen size={22} /></span>
            <h2 className="mt-5 text-xl font-bold">No titles found</h2>
            <p className="mt-2 text-sm text-[var(--text-soft)]">Try another search or choose a different status.</p>
            <button type="button" onClick={() => { setQuery(""); setActiveFilter("all"); }} className="mt-5 rounded-full border border-[var(--border)] px-4 py-2 text-xs font-extrabold hover:border-[var(--border-strong)]">Show all titles</button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
