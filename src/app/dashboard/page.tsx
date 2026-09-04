"use client";

import { History, Info, Play, Star, Users } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { getContinueWatching } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";

function overallProgress(watched: number, total: number) {
  return total ? (watched / total) * 100 : 0;
}

const friendActivity = [
  { name: "Ren", text: "completed Cyberpunk: Edgerunners", detail: "★★★★★ · 8 hours ago" },
  { name: "Aiko", text: "started watching Apothecary Diaries", detail: "6 hours ago" },
  { name: "Kenji", text: "watched Frieren episode 12", detail: "1 day ago" },
];

export default function DashboardPage() {
  const library = useTrackerStore((state) => state.library);
  const watching = getContinueWatching(library);
  const featured = watching[0];

  return (
    <AppShell>
      {featured && (
        <section className="glass-panel relative min-h-[400px] overflow-hidden rounded-xl" aria-labelledby="currently-watching-title">
          <AnimeArtwork anime={featured.anime} variant="hero" priority className="absolute inset-0 h-[400px] w-full opacity-90" />
          <div className="absolute inset-0 bg-gradient-to-t from-[var(--bg)] via-[color-mix(in_srgb,var(--bg)_68%,transparent)] to-[color-mix(in_srgb,var(--bg)_8%,transparent)] md:bg-gradient-to-r" />
          <div className="relative z-10 flex min-h-[400px] max-w-2xl flex-col justify-end gap-4 p-6 sm:p-8 md:justify-center">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-medium text-[var(--primary)]">Currently Watching</span>
              <span className="text-[var(--text-soft)]">Ep {featured.entry.currentEpisode} of {featured.anime.totalEpisodes}</span>
            </div>
            <h1 id="currently-watching-title" className="max-w-xl text-3xl font-extrabold leading-[1.05] tracking-[-0.04em] sm:text-5xl">{featured.anime.title}</h1>
            <p className="line-clamp-3 max-w-md text-sm leading-6 text-[var(--text-soft)] sm:text-base">{featured.anime.synopsis}</p>
            <div className="mt-1 max-w-md"><ProgressBar value={overallProgress(featured.entry.watchedEpisodes, featured.anime.totalEpisodes)} label="Progress" showValue /></div>
            <div className="mt-2 flex gap-3">
              <Link href={`/watch/${featured.anime.id}`} className="inline-flex items-center gap-2 rounded-lg bg-[var(--primary-container)] px-5 py-3 text-sm font-bold text-[#312a58] transition hover:bg-[#e5deff]"><Play size={16} fill="currentColor" />Continue</Link>
              <Link href={`/watch/${featured.anime.id}`} className="glass-panel inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-bold transition hover:border-[var(--border-strong)]"><Info size={16} />Details</Link>
            </div>
          </div>
        </section>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-12">
        <section className="md:col-span-8" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="mb-4 flex items-center gap-2 text-xl font-bold"><History size={20} className="text-[var(--primary)]" />Continue Watching</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {watching.slice(1, 3).map(({ anime, entry }) => (
              <Link key={anime.id} href={`/watch/${anime.id}`} className="glass-panel group flex h-32 overflow-hidden rounded-xl transition hover:border-[var(--border-strong)]">
                <AnimeArtwork anime={anime} className="h-full w-32 shrink-0" />
                <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                  <h3 className="truncate font-bold transition group-hover:text-[var(--primary)]">{anime.title}</h3>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">Episode {entry.currentEpisode}</p>
                  <div className="mt-3"><ProgressBar value={overallProgress(entry.watchedEpisodes, anime.totalEpisodes)} label={`${anime.title} progress`} /></div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="glass-panel rounded-xl p-5 md:col-span-4" aria-labelledby="friend-heading">
          <h2 id="friend-heading" className="mb-4 flex items-center gap-2 border-b border-[var(--border)] pb-3 text-xl font-bold"><Users size={19} className="text-[var(--primary)]" />Friend Activity</h2>
          <div className="space-y-4">
            {friendActivity.map((activity) => (
              <div key={activity.name} className="flex gap-3 text-xs">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-high)] font-bold text-[var(--primary)]">{activity.name[0]}</span>
                <div><p><strong className="text-[var(--primary)]">{activity.name}</strong> {activity.text}</p><p className="mt-1 text-[0.65rem] text-[var(--text-faint)]">{activity.detail}</p></div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mt-10" aria-labelledby="trending-heading">
        <div className="mb-4 flex items-center justify-between"><h2 id="trending-heading" className="text-xl font-bold">Trending on MAL</h2><Link href="/library" className="text-xs font-medium text-[var(--primary)]">View All</Link></div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
          {ANIME_CATALOG.slice(1, 6).map((anime) => (
            <Link key={anime.id} href={`/watch/${anime.id}`} className="group relative aspect-[2/3] overflow-hidden rounded-xl shadow-lg shadow-black/20">
              <AnimeArtwork anime={anime} className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-[#0f0d16] via-transparent to-transparent p-3 text-white">
                <h3 className="line-clamp-2 text-sm font-bold leading-tight">{anime.title}</h3>
                <p className="mt-2 flex items-center justify-between text-[0.62rem] text-white/70"><span>{anime.genres[0]}</span><span className="flex items-center gap-1 text-[#f5e191]"><Star size={10} fill="currentColor" />{anime.score}</span></p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
