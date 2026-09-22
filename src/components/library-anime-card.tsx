import { Minus, Plus, Star } from "lucide-react";
import Link from "next/link";

import { AnimeArtwork } from "@/components/ui/anime-artwork";
import type { Anime, LibraryEntry, LibraryStatus } from "@/features/tracker/types";

export const libraryStatusLabels: Record<LibraryStatus, string> = {
  watching: "Watching",
  planned: "Plan to Watch",
  on_hold: "On Hold",
  completed: "Completed",
  dropped: "Dropped",
};

const statusOptions: { value: LibraryStatus; label: string }[] = [
  { value: "watching", label: "Watching" },
  { value: "planned", label: "Plan to watch" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "dropped", label: "Dropped" },
];

interface LibraryAnimeCardProps {
  anime: Anime;
  entry: LibraryEntry;
  onProgressChange: (animeId: string, title: string, episodes: number) => void;
  onStatusChange: (animeId: string, title: string, status: LibraryStatus) => void;
}

export function LibraryAnimeCard({ anime, entry, onProgressChange, onStatusChange }: LibraryAnimeCardProps) {
  const progress = anime.totalEpisodes ? (entry.watchedEpisodes / anime.totalEpisodes) * 100 : 0;
  const episodeTotal = anime.totalEpisodes ?? "?";
  const watchHref = `/watch/${anime.id}`;

  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] shadow-lg shadow-black/10 transition duration-300 hover:-translate-y-1 hover:border-[var(--border-strong)]">
      <div className="relative aspect-[3/4] overflow-hidden bg-[var(--bg-high)]">
        <Link href={watchHref} aria-label={`Open ${anime.title}`} className="absolute inset-0">
          <AnimeArtwork
            anime={anime}
            className="h-full w-full"
            sizes="(max-width: 359px) 100vw, (max-width: 639px) 50vw, (max-width: 767px) 33vw, (max-width: 1279px) 25vw, 20vw"
          />
        </Link>
        <span className="absolute left-2 top-2 max-w-[calc(100%-1rem)] truncate rounded-md border border-[var(--border-strong)] bg-[var(--bg-lowest)] px-2 py-1 text-[0.68rem] font-semibold text-[var(--primary)] shadow-sm" title={libraryStatusLabels[entry.status]}>
          {libraryStatusLabels[entry.status]}
        </span>
      </div>

      <div data-testid="library-card-content" className="flex flex-1 flex-col bg-[var(--bg-lowest)] p-3 sm:p-4">
        <h2 className="h-10 min-w-0 text-sm font-bold leading-5 sm:text-base">
          <Link href={watchHref} aria-label={`Open ${anime.title}`} title={anime.title} className="line-clamp-2 rounded-sm hover:text-[var(--primary)]">
            {anime.title}
          </Link>
        </h2>

        <dl className="mt-3 grid min-h-11 content-start gap-1 text-[0.68rem] leading-4 text-[var(--text-soft)] sm:text-xs">
          <div className="flex min-w-0 items-center justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-1 text-[var(--gold)]">
              <Star aria-hidden="true" size={12} fill="currentColor" />
              <span>Score</span>
            </dt>
            <dd className="shrink-0 tabular-nums">{anime.score ?? "Unrated"} community</dd>
          </div>
          <div className="flex min-w-0 items-center justify-between gap-2">
            <dt>MAL score</dt>
            <dd className="shrink-0 tabular-nums">{entry.personalScore ? `${entry.personalScore}/10 yours` : "Not scored"}</dd>
          </div>
        </dl>

        <div className="mt-3">
          <div className="flex items-center justify-between gap-2 text-[0.68rem] leading-4 text-[var(--text-soft)] sm:text-xs">
            <span>Progress</span>
            <span className="shrink-0 tabular-nums">{entry.watchedEpisodes} / {episodeTotal}</span>
          </div>
          <div
            role="progressbar"
            aria-label={`${anime.title} watch progress`}
            aria-valuemin={0}
            aria-valuemax={anime.totalEpisodes ?? Math.max(entry.watchedEpisodes, 1)}
            aria-valuenow={entry.watchedEpisodes}
            aria-valuetext={`${entry.watchedEpisodes} of ${episodeTotal} episodes watched`}
            className="progress-glow mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--bg-high)]"
          >
            <div className="h-full rounded-full bg-[var(--primary-container)]" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="mt-auto border-t border-[var(--border)] pt-3">
          <div role="group" aria-label={`${anime.title} episode progress controls`} className="flex gap-2">
            <button
              type="button"
              onClick={() => onProgressChange(anime.id, anime.title, entry.watchedEpisodes - 1)}
              disabled={entry.watchedEpisodes === 0}
              className="grid h-11 min-w-11 flex-1 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--primary-soft)] disabled:opacity-40"
              aria-label={`Decrease ${anime.title} watched episodes`}
            >
              <Minus aria-hidden="true" size={16} />
            </button>
            <button
              type="button"
              onClick={() => onProgressChange(anime.id, anime.title, entry.watchedEpisodes + 1)}
              disabled={entry.watchedEpisodes === anime.totalEpisodes}
              className="grid h-11 min-w-11 flex-1 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-soft)] transition hover:border-[var(--border-strong)] hover:bg-[var(--primary-soft)] disabled:opacity-40"
              aria-label={`Increase ${anime.title} watched episodes`}
            >
              <Plus aria-hidden="true" size={16} />
            </button>
          </div>

          <label className="mt-2 block">
            <span className="sr-only">Status for {anime.title}</span>
            <select
              value={entry.status}
              onChange={(event) => onStatusChange(anime.id, anime.title, event.target.value as LibraryStatus)}
              className="h-11 w-full min-w-0 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-2 text-xs"
            >
              {statusOptions.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>
      </div>
    </article>
  );
}
