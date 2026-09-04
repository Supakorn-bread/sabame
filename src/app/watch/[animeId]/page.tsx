"use client";

import { CheckCircle2, Minus, PlayCircle, Plus, Star } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { SimulatedPlayer } from "@/components/simulated-player";
import { STITCH_ASSETS, getAnimeById } from "@/features/tracker/seed";
import { useTrackerStore } from "@/features/tracker/store";
import type { LibraryStatus } from "@/features/tracker/types";

const episodeImages = [STITCH_ASSETS.episodeOne, STITCH_ASSETS.episodeTwo, STITCH_ASSETS.episodeThree];
const episodeTitles = ["Privilege of the Young", "Smells Like Trouble", "Long-Lived Friends"];

export default function WatchPage() {
  const { animeId } = useParams<{ animeId: string }>();
  const anime = getAnimeById(animeId);
  const entry = useTrackerStore((state) => state.library[animeId]);
  const setStatus = useTrackerStore((state) => state.setStatus);
  const setWatchedEpisodes = useTrackerStore((state) => state.setWatchedEpisodes);
  const selectEpisode = useTrackerStore((state) => state.selectEpisode);
  const setPlaybackPosition = useTrackerStore((state) => state.setPlaybackPosition);
  const markEpisodeComplete = useTrackerStore((state) => state.markEpisodeComplete);

  useEffect(() => { if (anime && !entry) setStatus(anime.id, "planned"); }, [anime, entry, setStatus]);
  const updatePosition = useCallback((seconds: number) => setPlaybackPosition(animeId, seconds), [animeId, setPlaybackPosition]);
  const completeCurrentEpisode = useCallback(() => markEpisodeComplete(animeId), [animeId, markEpisodeComplete]);

  if (!anime) return <AppShell><div className="glass-panel grid min-h-[65vh] place-items-center rounded-xl p-8 text-center"><div><h1 className="text-3xl font-bold">This story is not in the demo catalog.</h1><Link href="/library" className="mt-6 inline-flex rounded-lg bg-[var(--primary-container)] px-5 py-3 text-sm font-bold text-[#312a58]">Back to library</Link></div></div></AppShell>;
  if (!entry) return <AppShell><div className="h-[70vh]" /></AppShell>;

  const upcomingEpisodes = [entry.currentEpisode, Math.min(anime.totalEpisodes, entry.currentEpisode + 1), Math.min(anime.totalEpisodes, entry.currentEpisode + 2)];

  return (
    <AppShell>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <SimulatedPlayer title={anime.title} episode={entry.currentEpisode} durationSeconds={anime.episodeMinutes * 60} initialPosition={entry.playbackSeconds} onPositionChange={updatePosition} onComplete={completeCurrentEpisode} imageUrl={STITCH_ASSETS.player} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <section className="flex flex-col gap-4 md:col-span-2" aria-labelledby="anime-title">
              <div><h1 id="anime-title" className="screen-title">{anime.subtitle}</h1><div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--text-soft)]"><span className="flex items-center gap-1 text-[var(--gold)]"><Star size={13} fill="currentColor" />{anime.score} MAL</span><span>•</span><span>TV ({anime.totalEpisodes} eps)</span><span>•</span><span>Madhouse</span><span>•</span><span>Fall 2023</span></div></div>
              <div className="flex flex-wrap gap-2">{anime.genres.map((genre) => <span key={genre} className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs text-[var(--primary)]">{genre}</span>)}</div>
              <p className="text-sm leading-6 text-[var(--text-soft)]">{anime.synopsis} Generations pass, and she promises to fulfill old friends&apos; dying wishes.</p>
              <div className="glass-panel grid grid-cols-2 gap-4 rounded-xl p-4 sm:grid-cols-5">
                {[['Score', anime.score], ['Rank', '#1'], ['Popularity', '#23'], ['Members', '1.2M'], ['Studio', 'Madhouse']].map(([label, value]) => <div key={label}><p className="text-[0.65rem] uppercase tracking-wider text-[var(--text-soft)]">{label}</p><p className="mt-1 font-bold text-[var(--primary)]">{value}</p></div>)}
              </div>
            </section>

            <section className="glass-floating h-fit rounded-xl p-5" aria-labelledby="mal-heading">
              <h2 id="mal-heading" className="eyebrow border-b border-[var(--border)] pb-3">MyAnimeList Status</h2>
              <div className="mt-4 space-y-3 text-sm">
                <label className="flex items-center justify-between gap-2"><span className="text-[var(--text-soft)]">Status</span><select value={entry.status} onChange={(event) => setStatus(anime.id, event.target.value as LibraryStatus)} className="rounded border border-[var(--border)] bg-[var(--bg)] px-2 py-1 text-xs"><option value="watching">Watching</option><option value="planned">Plan to Watch</option><option value="completed">Completed</option></select></label>
                <div className="flex items-center justify-between"><span className="text-[var(--text-soft)]">Score</span><span>9 <span className="text-[var(--text-soft)]">/10</span></span></div>
                <div className="flex items-center justify-between"><span className="text-[var(--text-soft)]">Episodes</span><span className="flex items-center gap-2"><button type="button" onClick={() => setWatchedEpisodes(anime.id, entry.watchedEpisodes - 1)} className="grid h-6 w-6 place-items-center rounded border border-[var(--border)]" aria-label="Decrease watched episodes"><Minus size={11} /></button><span>{entry.watchedEpisodes} / {anime.totalEpisodes}</span><button type="button" onClick={() => setWatchedEpisodes(anime.id, entry.watchedEpisodes + 1)} className="grid h-6 w-6 place-items-center rounded border border-[var(--border)]" aria-label="Increase watched episodes"><Plus size={11} /></button></span></div>
              </div>
              <button type="button" className="mt-5 w-full rounded bg-[var(--primary-container)] py-2 text-xs font-bold text-[#312a58]">UPDATE MAL</button>
            </section>
          </div>
        </div>

        <aside className="flex flex-col gap-6 lg:col-span-4" aria-label="Watch sidebar">
          <section className="glass-panel overflow-hidden rounded-xl" aria-labelledby="episodes-heading">
            <div className="flex items-center justify-between border-b border-[var(--border)] p-4"><h2 id="episodes-heading" className="eyebrow">Episodes</h2><span className="text-xs text-[var(--text-soft)]">{anime.totalEpisodes} Episodes</span></div>
            <div className="space-y-1 p-2">
              {upcomingEpisodes.map((episode, index) => {
                const active = episode === entry.currentEpisode;
                return <button key={`${episode}-${index}`} type="button" onClick={() => selectEpisode(anime.id, episode)} aria-current={active ? "true" : undefined} className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition ${active ? "border-[var(--border-strong)] bg-[var(--primary-soft)]" : "border-transparent hover:bg-[var(--bg-high)]"}`}><span className="relative h-16 w-24 shrink-0 overflow-hidden rounded"><Image src={episodeImages[index]} alt="" fill sizes="96px" className="object-cover" />{active && <span className="absolute inset-0 grid place-items-center bg-black/20 text-white"><PlayCircle size={21} /></span>}</span><span className="min-w-0"><span className={`block text-xs ${active ? "text-[var(--primary)]" : "text-[var(--text-soft)]"}`}>Episode {episode}</span><span className="block truncate text-sm">{episodeTitles[index]}</span></span>{episode <= entry.watchedEpisodes && <CheckCircle2 className="ml-auto text-[var(--primary)]" size={14} />}</button>;
              })}
            </div>
          </section>

          <section className="glass-panel rounded-xl p-4" aria-labelledby="similar-heading">
            <h2 id="similar-heading" className="eyebrow border-b border-[var(--border)] pb-3 text-[var(--text-soft)]">Similar Anime</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">{[[STITCH_ASSETS.wanderingWitch, 'Wandering Witch'], [STITCH_ASSETS.spiceWolf, 'Spice and Wolf']].map(([src, title]) => <Link href="/library" key={title} className="group relative aspect-[3/4] overflow-hidden rounded-lg"><Image src={src} alt="" fill sizes="180px" className="object-cover transition duration-500 group-hover:scale-105" /><span className="absolute inset-0 flex items-end bg-gradient-to-t from-[#0f0d16]/90 to-transparent p-2 text-xs text-white">{title}</span></Link>)}</div>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}
