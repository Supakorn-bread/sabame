"use client";

import { History, Library, Search, Star, Users } from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { CurrentlyWatching } from "@/components/currently-watching";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ANIME_CATALOG } from "@/features/tracker/seed";
import { getContinueWatching } from "@/features/tracker/selectors";
import { useTrackerStore } from "@/features/tracker/store";

function overallProgress(watched: number, total: number | null) {
  return total ? (watched / total) * 100 : 0;
}

const friendActivity = [
  { name: "Ren", text: "completed Cyberpunk: Edgerunners", detail: "★★★★★ · 8 hours ago" },
  { name: "Aiko", text: "started watching Apothecary Diaries", detail: "6 hours ago" },
  { name: "Kenji", text: "watched Frieren episode 12", detail: "1 day ago" },
];

export default function DashboardPage() {
  const library = useTrackerStore((state) => state.library);
  const catalog = useTrackerStore((state) => state.catalog);
  const malUser = useTrackerStore((state) => state.malUser);
  const syncStatus = useTrackerStore((state) => state.malSync.status);
  const watching = getContinueWatching(library, catalog);
  const featured = watching[0];
  const hasLibraryEntries = Object.keys(library).length > 0;

  return (
    <AppShell>
      {featured ? (
        <CurrentlyWatching {...featured} />
      ) : (
        <section className="glass-panel grid min-h-[360px] place-items-center rounded-xl p-8 text-center" aria-labelledby="empty-library-title">
          <div className="max-w-xl">
            <p className="eyebrow">Your dashboard</p>
            <h1 id="empty-library-title" className="mt-3 text-3xl font-extrabold tracking-[-0.04em] sm:text-4xl">{hasLibraryEntries ? "Ready for your next episode?" : "Your next story starts here."}</h1>
            <p className="mt-4 text-base leading-7 text-[var(--text-soft)]">{hasLibraryEntries ? "No titles are marked Watching. Choose a title in your library and update its status when you start." : malUser && syncStatus !== "synced" ? "Your library has not finished syncing. Check the sync notice above to continue." : "Your library is empty. Find an anime and update its status to start tracking."}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3"><Link href="/search" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-5 text-sm font-bold text-[#312a58]"><Search size={16} />Find anime</Link><Link href="/library" className="glass-panel inline-flex min-h-11 items-center gap-2 rounded-lg px-5 text-sm font-bold"><Library size={16} />Open library</Link></div>
          </div>
        </section>
      )}

      {hasLibraryEntries || !malUser ? <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-12">
        <section className="md:col-span-8" aria-labelledby="continue-heading">
          <h2 id="continue-heading" className="mb-4 flex items-center gap-2 text-xl font-bold"><History size={20} className="text-[var(--primary)]" />Continue Watching</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {watching.slice(1, 3).map(({ anime, entry }) => (
              <Link key={anime.id} href={`/watch/${anime.id}`} className="glass-panel group flex h-32 overflow-hidden rounded-xl transition hover:border-[var(--border-strong)]">
                <AnimeArtwork anime={anime} variant="thumb" className="h-full w-24 shrink-0 sm:w-32" />
                <div className="flex min-w-0 flex-1 flex-col justify-center p-4">
                  <h3 className="truncate font-bold transition group-hover:text-[var(--primary)]">{anime.title}</h3>
                  <p className="mt-1 text-xs text-[var(--text-soft)]">Episode {entry.currentEpisode}</p>
                  <div className="mt-3"><ProgressBar value={overallProgress(entry.watchedEpisodes, anime.totalEpisodes)} label={`${anime.title} progress`} /></div>
                </div>
              </Link>
            ))}
            {watching.length <= 1 ? <div className="glass-panel rounded-xl p-5 text-sm leading-6 text-[var(--text-soft)] sm:col-span-2">{featured ? "You're caught up on your other titles." : "Nothing is in progress yet."} <Link href="/library" className="font-semibold text-[var(--primary)] underline underline-offset-4">Browse your library</Link></div> : null}
          </div>
        </section>

        {malUser ? (
          <section className="glass-panel rounded-xl p-5 md:col-span-4" aria-labelledby="account-heading">
            <h2 id="account-heading" className="mb-3 text-xl font-bold">Your MAL library</h2>
            <p className="text-sm leading-6 text-[var(--text-soft)]">Sabame shows activity from your own list. Friend activity is not provided by the account sync.</p>
            <Link href="/library" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-strong)] px-4 text-sm font-bold"><Library size={16} />View all titles</Link>
          </section>
        ) : (
          <section className="glass-panel rounded-xl p-5 md:col-span-4" aria-labelledby="friend-heading">
            <h2 id="friend-heading" className="mb-1 flex items-center gap-2 text-xl font-bold"><Users size={19} className="text-[var(--primary)]" />Demo community activity</h2>
            <p className="mb-4 border-b border-[var(--border)] pb-3 text-xs text-[var(--text-soft)]">Sample activity for the local demo.</p>
            <div className="space-y-4">
              {friendActivity.map((activity) => (
                <div key={activity.name} className="flex gap-3 text-xs">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--bg-high)] font-bold text-[var(--primary)]">{activity.name[0]}</span>
                  <div><p><strong className="text-[var(--primary)]">{activity.name}</strong> {activity.text}</p><p className="mt-1 text-[0.65rem] text-[var(--text-faint)]">{activity.detail}</p></div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div> : null}

      {!malUser ? <section className="mt-10" aria-labelledby="trending-heading">
        <div className="mb-4 flex items-center justify-between"><div><h2 id="trending-heading" className="text-xl font-bold">Suggestions to explore</h2><p className="mt-1 text-xs text-[var(--text-soft)]">A few catalog picks from Sabame.</p></div><Link href="/search" className="text-xs font-medium text-[var(--primary)]">Search all</Link></div>
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
      </section> : null}
    </AppShell>
  );
}
