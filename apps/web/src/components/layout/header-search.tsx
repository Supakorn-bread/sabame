"use client";

import { Search, X } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { useCatalogSearch } from "@/features/media/use-catalog";

export function HeaderSearch({ standalone = false }: { standalone?: boolean }) {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const { results, error, loading, retry } = useCatalogSearch(query);
  const expanded = open && Boolean(normalizedQuery);
  const selectedIndex = activeIndex < results.length ? activeIndex : -1;
  const status = loading
    ? "Searching MyAnimeList catalog…"
    : error
      ? "MyAnimeList catalog unavailable. Local results still work."
      : results.length
        ? `${results.length} matches · ↑↓ to choose, Enter to open`
        : normalizedQuery.length < 2
          ? "Type at least 2 characters to search MyAnimeList."
          : "No anime found. Try another title or genre.";

  function select(animeId: string) {
    setOpen(false);
    router.push(`/watch/${animeId}`);
  }

  return (
    <div className={standalone ? "relative w-full max-w-xl" : "relative hidden w-60 lg:block xl:w-72"} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <div className="header-search-field flex h-11 items-center gap-2 rounded-full border px-3">
        <Search size={16} aria-hidden="true" className="shrink-0 text-[var(--text-soft)]" />
        <input
          ref={input}
          type="text"
          role="combobox"
          aria-label="Search anime"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={`${id}-results`}
          aria-activedescendant={expanded && selectedIndex >= 0 ? `${id}-${selectedIndex}` : undefined}
          autoComplete="off"
          placeholder="Search MyAnimeList…"
          value={query}
          className="min-w-0 flex-1 cursor-text bg-transparent py-2 text-base text-[var(--text)] outline-none placeholder:text-[var(--text-faint)] lg:text-sm"
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQuery(event.target.value); setActiveIndex(-1); setOpen(true); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { setOpen(false); setActiveIndex(-1); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              if (results.length) setActiveIndex((current) => event.key === "ArrowDown" ? (current + 1) % results.length : (current <= 0 ? results.length : current) - 1);
            }
            if (event.key === "Enter" && expanded && results.length) {
              event.preventDefault();
              select(results[Math.min(results.length - 1, Math.max(0, activeIndex))].id);
            }
          }}
        />
        {query && <button type="button" aria-label="Clear anime search" onClick={() => { setQuery(""); setActiveIndex(-1); input.current?.focus(); }} className="-mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text-soft)] hover:text-[var(--primary)]"><X size={16} /></button>}
      </div>
      <div hidden={!expanded} className={`${standalone ? "relative" : "absolute right-0 top-full z-20 max-h-[60vh] overflow-y-auto"} mt-2 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-2 shadow-xl`}>
        <p role="status" className="px-3 py-2 text-sm text-[var(--text-soft)]">{status}</p>
        <ul id={`${id}-results`} role="listbox" aria-label="Anime results">
          {results.map((anime, index) => <li key={anime.id} id={`${id}-${index}`} role="option" aria-selected={selectedIndex === index} onMouseDown={(event) => event.preventDefault()} onClick={() => select(anime.id)} className={`flex min-h-16 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm [overflow-wrap:anywhere] ${selectedIndex === index ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:bg-[var(--primary-soft)]"}`}>
            {anime.coverUrl ? <Image src={anime.coverUrl} alt="" width={36} height={48} sizes="36px" className="h-12 w-9 shrink-0 rounded object-cover" /> : <span aria-hidden="true" className="h-12 w-9 shrink-0 rounded bg-[var(--bg-high)]" />}
            <span className="min-w-0"><span className="block truncate font-semibold" title={anime.title}>{anime.title}</span><span className="mt-1 block truncate text-xs text-[var(--text-soft)]">{anime.genres.length ? anime.genres.join(" · ") : "MyAnimeList catalog"}{anime.score ? ` · ${anime.score}` : ""}</span></span>
          </li>)}
        </ul>
        {error && <button type="button" onClick={retry} className="m-1 min-h-11 rounded-lg border border-[var(--border-strong)] px-4 text-sm font-semibold hover:bg-[var(--primary-soft)]">Retry search</button>}
      </div>
    </div>
  );
}
