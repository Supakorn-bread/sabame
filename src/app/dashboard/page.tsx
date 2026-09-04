"use client";

import { ArrowRight, CheckCircle2, Clock3, Library, Play, Sparkles } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ProgressBar } from "@/components/ui/progress-bar";
import { getContinueWatching, getLibraryCounts, getRecentActivity } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";

function overallProgress(watchedEpisodes: number, totalEpisodes: number) {
  return totalEpisodes === 0 ? 0 : (watchedEpisodes / totalEpisodes) * 100;
}

function relativeDate(timestamp: string) {
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

export default function DashboardPage() {
  const library = useTrackerStore((state) => state.library);
  const session = useTrackerStore((state) => state.session);
  const watching = getContinueWatching(library);
  const recent = getRecentActivity(library, 4);
  const counts = getLibraryCounts(library);
  const featured = watching[0];

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-3 sm:mb-10 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-3">Your daily queue</p>
          <h1 className="screen-title">Good evening, {session?.displayName ?? "Viewer"}.</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--text-soft)] sm:text-base">Pick up a story exactly where you left it.</p>
        </div>
        <Link href="/library" className="inline-flex items-center gap-2 self-start rounded-full border border-[var(--border)] bg-[var(--panel)] px-4 py-2.5 text-sm font-bold transition hover:border-[var(--border-strong)] sm:self-auto">
          View library <ArrowRight size={16} />
        </Link>
      </div>

      {featured && (
        <section className="glass-panel relative mb-10 grid overflow-hidden rounded-[2rem] lg:grid-cols-[1.12fr_0.88fr]" aria-labelledby="currently-watching-title">
          <div className="relative z-10 flex flex-col justify-center p-6 sm:p-9 lg:p-12">
            <div className="mb-6 flex items-center gap-2 text-[var(--primary)]">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--primary)] opacity-50" /><span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--primary)]" /></span>
              <span className="eyebrow">Currently watching</span>
            </div>
            <h2 id="currently-watching-title" className="max-w-xl text-4xl font-bold leading-[0.98] tracking-[-0.055em] sm:text-5xl xl:text-6xl">{featured.anime.title}</h2>
            <p className="mt-3 text-sm font-bold text-[var(--primary)]">Episode {featured.entry.currentEpisode} · {featured.anime.subtitle}</p>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[var(--text-soft)] sm:text-base">{featured.anime.synopsis}</p>

            <div className="mt-8 max-w-xl">
              <ProgressBar
                value={overallProgress(featured.entry.watchedEpisodes, featured.anime.totalEpisodes)}
                label={`${featured.entry.watchedEpisodes} of ${featured.anime.totalEpisodes} episodes watched`}
                showValue
              />
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={`/watch/${featured.anime.id}`} className="inline-flex h-12 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-extrabold text-[var(--primary-text)] shadow-lg shadow-violet-500/10 transition hover:-translate-y-0.5 hover:brightness-105">
                <Play size={16} fill="currentColor" /> Continue episode
              </Link>
              <span className="inline-flex h-12 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--bg-elevated)] px-4 text-xs font-bold text-[var(--text-soft)]">
                <Clock3 size={15} /> {Math.floor(featured.entry.playbackSeconds / 60)} min in
              </span>
            </div>
          </div>
          <AnimeArtwork anime={featured.anime} variant="hero" className="min-h-[22rem] lg:min-h-[34rem]" />
        </section>
      )}

      <section className="mb-10" aria-labelledby="continue-heading">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <p className="eyebrow mb-2">In motion</p>
            <h2 id="continue-heading" className="text-2xl font-bold tracking-[-0.04em] sm:text-3xl">Continue watching</h2>
          </div>
          <span className="text-xs font-bold text-[var(--text-faint)]">{watching.length} active</span>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {watching.map(({ anime, entry }) => (
            <Link key={anime.id} href={`/watch/${anime.id}`} className="glass-panel group grid grid-cols-[7rem_1fr] overflow-hidden rounded-[1.65rem] transition hover:-translate-y-1 hover:border-[var(--border-strong)]">
              <AnimeArtwork anime={anime} className="min-h-44" />
              <div className="flex min-w-0 flex-col p-5">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {anime.genres.slice(0, 2).map((genre) => <span key={genre} className="rounded-full bg-[var(--primary-soft)] px-2 py-1 text-[0.6rem] font-extrabold text-[var(--primary)]">{genre}</span>)}
                </div>
                <h3 className="truncate text-lg font-bold tracking-[-0.035em]">{anime.title}</h3>
                <p className="mt-1 text-xs font-semibold text-[var(--text-soft)]">Episode {entry.currentEpisode} of {anime.totalEpisodes}</p>
                <div className="mt-auto pt-5">
                  <ProgressBar value={overallProgress(entry.watchedEpisodes, anime.totalEpisodes)} label={`${anime.title} progress`} />
                  <div className="mt-3 flex items-center justify-between text-xs font-extrabold text-[var(--primary)]">
                    Resume <Play size={14} fill="currentColor" className="transition-transform group-hover:translate-x-0.5" />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1fr_22rem]">
        <section className="glass-panel rounded-[1.75rem] p-5 sm:p-7" aria-labelledby="activity-heading">
          <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Sparkles size={18} /></span>
            <div><p className="eyebrow">Timeline</p><h2 id="activity-heading" className="text-xl font-bold tracking-[-0.035em]">Recent activity</h2></div>
          </div>
          <div className="divide-y divide-[var(--border)]">
            {recent.map(({ anime, entry }) => (
              <div key={anime.id} className="flex items-center gap-3 py-3.5 first:pt-0 last:pb-0">
                <AnimeArtwork anime={anime} variant="thumb" className="h-12 w-12 shrink-0 rounded-2xl" />
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{anime.title}</p><p className="mt-0.5 text-xs text-[var(--text-soft)]">{entry.status === "completed" ? "Series completed" : `Episode ${entry.currentEpisode} ready`}</p></div>
                <time dateTime={entry.updatedAt} className="text-xs font-bold text-[var(--text-faint)]">{relativeDate(entry.updatedAt)}</time>
              </div>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-[1.75rem] p-5 sm:p-7" aria-labelledby="summary-heading">
          <p className="eyebrow mb-2">At a glance</p>
          <h2 id="summary-heading" className="mb-6 text-xl font-bold tracking-[-0.035em]">Your library</h2>
          <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
            {[
              { label: "Watching", value: counts.watching, icon: Play },
              { label: "Planned", value: counts.planned, icon: Library },
              { label: "Completed", value: counts.completed, icon: CheckCircle2 },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="flex flex-col items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--bg-elevated)] p-3 text-center xl:flex-row xl:text-left">
                <span className="grid h-9 w-9 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon size={16} /></span>
                <div><p className="text-lg font-extrabold leading-none">{value}</p><p className="mt-1 text-[0.65rem] font-bold text-[var(--text-faint)]">{label}</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
