"use client";

import { Info, Minus, Plus, Star } from "lucide-react";
import Link from "next/link";
import { useId, useRef, useState } from "react";
import { AnimeArtwork } from "@/components/ui/anime-artwork";
import type { Anime, LibraryEntry, LibraryStatus } from "@/features/tracker/types";

export const libraryStatusLabels: Record<LibraryStatus, string> = {
  watching: "Watching", planned: "Plan to Watch", on_hold: "On Hold", completed: "Completed", dropped: "Dropped",
};
const statusOptions: LibraryStatus[] = ["watching", "planned", "on_hold", "completed", "dropped"];
interface LibraryAnimeCardProps {
  anime: Anime;
  entry: LibraryEntry;
  onProgressChange: (animeId: string, title: string, episodes: number) => void;
  onStatusChange: (animeId: string, title: string, status: LibraryStatus) => void;
}

export function LibraryAnimeCard({ anime, entry, onProgressChange, onStatusChange }: LibraryAnimeCardProps) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const open = !dismissed && (hovered || pinned);
  const progress = anime.totalEpisodes ? Math.min(100, entry.watchedEpisodes / anime.totalEpisodes * 100) : 0;
  const episodeTotal = anime.totalEpisodes ?? "?";
  const watchHref = `/watch/${anime.id}`;
  function close() {
    setPinned(false);
    setHovered(false);
    setDismissed(true);
    trigger.current?.focus();
  }

  return <article className="library-poster-card relative isolate aspect-[2/3] min-w-0 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-high)] shadow-lg shadow-black/10"
    onPointerEnter={(event) => { if (event.pointerType === "mouse") setHovered(true); }}
    onPointerLeave={(event) => { if (event.pointerType === "mouse") { if (panel.current?.contains(document.activeElement)) trigger.current?.focus(); setHovered(false); setPinned(false); setDismissed(false); } }}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) { setPinned(false); setDismissed(false); } }}
    onKeyDown={(event) => { if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); close(); } }}>
    <Link href={watchHref} aria-label={`Open ${anime.title}`} tabIndex={open ? -1 : 0} inert={open} className="absolute inset-0">
      <AnimeArtwork anime={anime} className="h-full w-full" preferLarge zoomOnHover={false}
        sizes="(max-width: 499px) calc(100vw - 32px), (max-width: 767px) 50vw, (max-width: 1023px) 33vw, (max-width: 1279px) 25vw, 20vw" />
    </Link>
    <span className="library-cover-badge absolute left-2 top-2 max-w-[calc(100%-4.5rem)] truncate rounded-lg px-2 py-1.5 text-xs font-semibold" title={libraryStatusLabels[entry.status]}>{libraryStatusLabels[entry.status]}</span>
    <div className="library-cover-caption pointer-events-none absolute inset-x-0 bottom-0 px-3 pb-4 pt-12" aria-hidden={open}>
      <h2 className="line-clamp-2 h-10 text-sm font-bold leading-5" title={anime.title}>{anime.title}</h2>
    </div>
    <button ref={trigger} type="button" aria-label={`Show details for ${anime.title}`} aria-expanded={open} aria-controls={panelId}
      onClick={() => { if (pinned && open) close(); else { setPinned(true); setDismissed(false); } }}
      className="library-cover-badge absolute right-2 top-2 z-30 grid h-11 w-11 place-items-center rounded-full"><Info aria-hidden="true" size={19} /></button>

    <div ref={panel} id={panelId} data-testid="library-card-content" data-open={open} inert={!open} aria-hidden={!open}
      onFocusCapture={() => setPinned(true)}
      className="library-glass-details absolute inset-x-0 bottom-0 z-20 flex h-1/2 flex-col justify-end gap-1.5 p-2.5">
      <h2 className="min-h-9 text-sm font-bold leading-[18px]"><Link href={watchHref} aria-label={`Open ${anime.title}`} title={anime.title} className="line-clamp-2 rounded-sm hover:text-[var(--primary)]">{anime.title}</Link></h2>
      <dl className="flex items-center justify-between gap-2 text-xs leading-4">
        <div className="flex items-center gap-1" title="MAL community score"><dt><Star aria-hidden="true" size={12} /><span className="sr-only">MAL score</span></dt><dd>{anime.score ?? "Unrated"}<span className="sr-only"> community</span></dd></div>
        <div className="flex items-center gap-1"><dt>Your score</dt><dd>{entry.personalScore ? `${entry.personalScore}/10` : "—"}<span className="sr-only">{entry.personalScore ? " yours" : "Not scored"}</span></dd></div>
      </dl>
      <div>
      <div className="flex items-center justify-between gap-2 text-xs leading-4"><span>Progress</span><span className="tabular-nums">{entry.watchedEpisodes} / {episodeTotal}</span></div>
      <div role="progressbar" aria-label={`${anime.title} watch progress`} aria-valuemin={0} aria-valuemax={anime.totalEpisodes ?? Math.max(entry.watchedEpisodes, 1)} aria-valuenow={entry.watchedEpisodes} aria-valuetext={`${entry.watchedEpisodes} of ${episodeTotal} episodes watched`} className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--bg-high)]"><div className="h-full bg-[var(--primary)]" style={{ width: `${progress}%` }} /></div>
      </div>
      <div className="flex gap-2">
      <div role="group" aria-label={`${anime.title} episode progress controls`} className="flex shrink-0 gap-2">
        <button type="button" onClick={() => onProgressChange(anime.id, anime.title, entry.watchedEpisodes - 1)} disabled={entry.watchedEpisodes === 0} aria-label={`Decrease ${anime.title} watched episodes`} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border-strong)] hover:bg-[var(--primary-soft)] disabled:opacity-40"><Minus aria-hidden="true" size={16} /></button>
        <button type="button" onClick={() => onProgressChange(anime.id, anime.title, entry.watchedEpisodes + 1)} disabled={anime.totalEpisodes !== null && entry.watchedEpisodes >= anime.totalEpisodes} aria-label={`Increase ${anime.title} watched episodes`} className="grid h-11 w-11 place-items-center rounded-lg border border-[var(--border-strong)] hover:bg-[var(--primary-soft)] disabled:opacity-40"><Plus aria-hidden="true" size={16} /></button>
      </div>
      <label className="block min-w-0 flex-1"><span className="sr-only">Status for {anime.title}</span><select value={entry.status} onChange={(event) => onStatusChange(anime.id, anime.title, event.target.value as LibraryStatus)} className="h-11 w-full min-w-0 cursor-pointer rounded-lg border border-[var(--border-strong)] bg-[var(--bg)] px-1 text-xs">{statusOptions.map((status) => <option key={status} value={status}>{libraryStatusLabels[status]}</option>)}</select></label>
      </div>
    </div>
  </article>;
}
