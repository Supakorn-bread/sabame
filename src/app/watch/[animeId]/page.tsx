"use client";

import { ArrowLeft, CheckCircle2, ChevronLeft, ChevronRight, Info, ListVideo } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SimulatedPlayer } from "@/components/simulated-player";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getAnimeById } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";
import type { LibraryStatus } from "@/features/tracker/types";

export default function WatchPage() {
  const { animeId } = useParams<{ animeId: string }>();
  const anime = getAnimeById(animeId);
  const entry = useTrackerStore((state) => state.library[animeId]);
  const setStatus = useTrackerStore((state) => state.setStatus);
  const selectEpisode = useTrackerStore((state) => state.selectEpisode);
  const setPlaybackPosition = useTrackerStore((state) => state.setPlaybackPosition);
  const markEpisodeComplete = useTrackerStore((state) => state.markEpisodeComplete);

  useEffect(() => {
    if (anime && !entry) setStatus(anime.id, "planned");
  }, [anime, entry, setStatus]);

  const updatePosition = useCallback((seconds: number) => {
    setPlaybackPosition(animeId, seconds);
  }, [animeId, setPlaybackPosition]);

  const completeCurrentEpisode = useCallback(() => {
    markEpisodeComplete(animeId);
  }, [animeId, markEpisodeComplete]);

  if (!anime) {
    return (
      <AppShell>
        <div className="glass-panel grid min-h-[65vh] place-items-center rounded-[2rem] p-8 text-center">
          <div className="max-w-md">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Info size={26} /></span>
            <p className="eyebrow mb-3 mt-6">Unknown title</p>
            <h1 className="text-3xl font-bold tracking-[-0.05em]">This story is not in the demo catalog.</h1>
            <p className="mt-3 text-sm leading-7 text-[var(--text-soft)]">Return to your library and choose one of the saved titles.</p>
            <Link href="/library" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-extrabold text-[var(--primary-text)]"><ArrowLeft size={16} /> Back to library</Link>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!entry) return <AppShell><div className="h-[70vh]" /></AppShell>;

  const previousEpisode = Math.max(1, entry.currentEpisode - 1);
  const nextEpisode = Math.min(anime.totalEpisodes, entry.currentEpisode + 1);
  const progress = anime.totalEpisodes ? (entry.watchedEpisodes / anime.totalEpisodes) * 100 : 0;

  return (
    <AppShell>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link href="/library" className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-xs font-extrabold text-[var(--text-soft)] transition hover:border-[var(--border-strong)] hover:text-[var(--text)]"><ArrowLeft size={15} /> Back to library</Link>
        <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--text-faint)]">Prototype playback</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <SimulatedPlayer
            title={anime.title}
            episode={entry.currentEpisode}
            durationSeconds={anime.episodeMinutes * 60}
            initialPosition={entry.playbackSeconds}
            onPositionChange={updatePosition}
            onComplete={completeCurrentEpisode}
          />

          <section className="glass-panel mt-5 rounded-[1.75rem] p-5 sm:p-7" aria-labelledby="episode-title">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="eyebrow mb-2">Now watching</p>
                <h1 id="episode-title" className="text-3xl font-bold tracking-[-0.05em] sm:text-4xl">{anime.title}</h1>
                <p className="mt-2 text-sm font-bold text-[var(--primary)]">Episode {entry.currentEpisode} of {anime.totalEpisodes} · {anime.subtitle}</p>
              </div>
              <label className="shrink-0">
                <span className="sr-only">Library status</span>
                <select value={entry.status} onChange={(event) => setStatus(anime.id, event.target.value as LibraryStatus)} className="h-11 rounded-xl border border-[var(--border)] bg-[var(--bg-elevated)] px-4 text-xs font-bold outline-none focus:border-[var(--border-strong)]">
                  <option value="watching">Watching</option>
                  <option value="planned">Plan to watch</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
            </div>
            <p className="mt-6 max-w-4xl text-sm leading-7 text-[var(--text-soft)] sm:text-base">{anime.synopsis}</p>
            <div className="mt-6 max-w-xl"><ProgressBar value={progress} label={`${entry.watchedEpisodes} of ${anime.totalEpisodes} episodes watched`} showValue /></div>
          </section>
        </div>

        <aside className="glass-panel self-start rounded-[1.75rem] p-4 sm:p-5 xl:sticky xl:top-24" aria-labelledby="episodes-heading">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><ListVideo size={18} /></span>
            <div><p className="eyebrow">Season 1</p><h2 id="episodes-heading" className="text-lg font-bold tracking-[-0.035em]">Episodes</h2></div>
          </div>

          <div className="grid max-h-[31rem] grid-cols-4 gap-2 overflow-y-auto pr-1 sm:grid-cols-6 xl:grid-cols-4">
            {Array.from({ length: anime.totalEpisodes }, (_, index) => index + 1).map((episode) => {
              const completed = episode <= entry.watchedEpisodes;
              const current = episode === entry.currentEpisode;
              return (
                <button
                  key={episode}
                  type="button"
                  onClick={() => selectEpisode(anime.id, episode)}
                  aria-label={`Play episode ${episode}${completed ? ", watched" : ""}`}
                  aria-current={current ? "true" : undefined}
                  className={`relative aspect-square rounded-xl border text-xs font-extrabold transition ${current ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-text)]" : "border-[var(--border)] bg-[var(--bg-elevated)] text-[var(--text-soft)] hover:border-[var(--border-strong)] hover:text-[var(--text)]"}`}
                >
                  {episode}
                  {completed && !current && <CheckCircle2 className="absolute right-1 top-1 text-[var(--primary)]" size={10} />}
                </button>
              );
            })}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => selectEpisode(anime.id, previousEpisode)} disabled={entry.currentEpisode === 1} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-soft)] hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={15} /> Previous</button>
            <button type="button" onClick={() => selectEpisode(anime.id, nextEpisode)} disabled={entry.currentEpisode === anime.totalEpisodes} className="inline-flex h-10 items-center justify-center gap-1 rounded-xl border border-[var(--border)] text-xs font-bold text-[var(--text-soft)] hover:border-[var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-35">Next <ChevronRight size={15} /></button>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
