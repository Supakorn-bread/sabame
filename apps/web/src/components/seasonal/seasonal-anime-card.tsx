"use client";

import { ArrowUpRight, CalendarDays, Star, Users } from "lucide-react";
import Link from "next/link";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import { useTrackerStore } from "@/features/tracker/store";
import type { SeasonalAnime } from "@/features/seasonal/model";

const formats: Record<string, string> = { tv: "TV", movie: "Movie", ona: "ONA", ova: "OVA", special: "Special", tv_special: "TV Special", music: "Music", unknown: "Anime" };
const memberFormat = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function SeasonalAnimeCard({ anime }: { anime: SeasonalAnime }) {
  const register = useTrackerStore((state) => state.registerAnime);
  const inLibrary = useTrackerStore((state) => Boolean(state.library[anime.id]));
  const personalScore = useTrackerStore((state) => state.library[anime.id]?.personalScore);
  const href = `/watch/${anime.id}`;
  const episodeLabel = anime.totalEpisodes
    ? `${anime.totalEpisodes} ${anime.totalEpisodes === 1 ? "episode" : "episodes"}`
    : "Episodes TBA";
  const premiere = anime.startDate ? new Date(`${anime.startDate}T00:00:00Z`) : null;
  return <article className="group flex min-w-0 flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] transition-colors hover:border-[var(--border-strong)]">
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 text-xs font-semibold">
      <span className="text-[var(--primary)]">{formats[anime.format] ?? "Anime"}<span className="mx-2 text-[var(--border-strong)]">/</span><span className="text-[var(--text-soft)]">{episodeLabel}</span></span>
      {anime.continuing && <span className="rounded bg-[var(--bg-low)] px-2 py-1 text-[var(--text-soft)]">Continuing</span>}
    </div>
    <div className="grid flex-1 grid-cols-[112px_minmax(0,1fr)] gap-4 p-4 sm:grid-cols-[128px_minmax(0,1fr)]">
      <div>
        <Link href={href} prefetch={false} onClick={() => register(anime)} aria-label={`View ${anime.title}`} className="block rounded-lg">
          <AnimeArtwork anime={anime} className="aspect-[2/3] rounded-lg" sizes="(max-width: 640px) 112px, 128px" />
        </Link>
        <div className="mt-3 flex items-center gap-1.5 text-sm font-bold text-[var(--gold)]" aria-label={anime.score ? `MAL score ${anime.score} out of 10` : "Not yet scored"}><Star aria-hidden="true" size={15} />{anime.score ?? "Not scored"}</div>
        {inLibrary ? <p className="mt-1 text-xs font-semibold leading-5 text-[var(--text-soft)]">Your score: {personalScore && personalScore > 0 ? `${personalScore}/10` : "Not scored"}</p> : null}
        <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-soft)]" title={`${anime.members.toLocaleString("en")} MAL members`}><Users aria-hidden="true" size={13} />{memberFormat.format(anime.members)} members</p>
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-extrabold leading-snug [overflow-wrap:anywhere]"><Link href={href} prefetch={false} onClick={() => register(anime)} className="hover:text-[var(--primary)]">{anime.title}</Link></h3>
        <p className="mt-2 text-xs font-semibold leading-5 text-[var(--primary)]">{anime.studios.join(" · ") || "Studio to be announced"}</p>
        <p className="mt-3 line-clamp-5 text-sm leading-6 text-[var(--text-soft)]">{anime.synopsis || "The story is still under wraps. Check back for the synopsis."}</p>
      </div>
    </div>
    <div className="flex flex-wrap gap-1.5 px-4 pb-4">{anime.genres.slice(0, 4).map((genre) => <span key={genre} className="rounded-full bg-[var(--bg-low)] px-2.5 py-1 text-xs text-[var(--text-soft)]">{genre}</span>)}</div>
    <div className="flex min-h-14 items-center justify-between gap-2 border-t border-[var(--border)] px-4 text-xs">
      <span className="flex items-center gap-1.5 text-[var(--text-soft)]"><CalendarDays aria-hidden="true" size={14} />{premiere && Number.isFinite(premiere.getTime()) ? dateFormat.format(premiere) : "Premiere TBA"}</span>
      <Link href={href} prefetch={false} onClick={() => register(anime)} className="inline-flex min-h-11 shrink-0 items-center gap-1 font-bold text-[var(--primary)]">{inLibrary ? "In your library" : "View anime"}<ArrowUpRight aria-hidden="true" size={15} /></Link>
    </div>
  </article>;
}
