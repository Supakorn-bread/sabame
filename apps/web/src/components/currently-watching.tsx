import { Info, Play } from "lucide-react";
import Link from "next/link";

import type { TrackedAnime } from "@/features/tracker/selectors";
import { AnimeArtwork } from "./ui/anime-artwork";
import { ProgressBar } from "./ui/progress-bar";

export function CurrentlyWatching({ anime, entry }: TrackedAnime) {
  return (
    <section className="glass-panel overflow-hidden rounded-xl" aria-labelledby="currently-watching-title">
      <div className="grid items-start gap-6 p-4 sm:p-6 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8 md:p-8">
        <AnimeArtwork anime={anime} variant="hero" fit="contain" priority sizes="240px" className="mx-auto aspect-[12/17] w-full max-w-60 rounded-xl md:mx-0" />
        <div className="flex min-w-0 flex-col items-start gap-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 font-medium text-[var(--primary)]">Currently Watching</span>
            <span className="text-[var(--text-soft)]">Ep {entry.currentEpisode} of {anime.totalEpisodes ?? "?"}</span>
          </div>
          <h1 id="currently-watching-title" className="max-w-2xl text-3xl font-extrabold leading-tight tracking-tight [overflow-wrap:anywhere] sm:text-4xl">{anime.title}</h1>
          {anime.genres.length > 0 ? <p className="text-sm text-[var(--primary)]">{anime.genres.join(" · ")}</p> : null}
          {anime.synopsis ? <p className="line-clamp-4 max-w-prose text-base leading-7 text-[var(--text-soft)]">{anime.synopsis}</p> : null}
          <div className="w-full max-w-md">
            {anime.totalEpisodes ? <ProgressBar value={(entry.watchedEpisodes / anime.totalEpisodes) * 100} label="Progress" showValue /> : null}
            <p className="mt-2 text-sm text-[var(--text-soft)]">{entry.watchedEpisodes} episodes watched{anime.totalEpisodes === null ? " · Total episodes not yet known" : ""}</p>
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            <Link href={`/watch/${anime.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-5 py-3 text-sm font-bold text-[#312a58] transition-colors hover:bg-[#e5deff]"><Play size={16} fill="currentColor" aria-hidden="true" />Continue</Link>
            <Link href={`/watch/${anime.id}#anime-title`} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-strong)] px-5 py-3 text-sm font-bold hover:bg-[var(--primary-soft)]"><Info size={16} aria-hidden="true" />Details</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
