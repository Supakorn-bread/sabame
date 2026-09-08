"use client";

import { Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useRef, useState } from "react";

import { ANIME_CATALOG } from "@/features/tracker/seed";

export function HeaderSearch() {
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const results = normalizedQuery ? ANIME_CATALOG.filter((anime) =>
    `${anime.title} ${anime.subtitle} ${anime.genres.join(" ")}`.toLocaleLowerCase().includes(normalizedQuery),
  ).slice(0, 6) : [];
  const expanded = open && Boolean(normalizedQuery);

  function select(animeId: string) {
    setOpen(false);
    router.push(`/watch/${animeId}`);
  }

  return (
    <div className="relative hidden w-60 lg:block xl:w-72" onBlur={(event) => {
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
          aria-activedescendant={expanded && activeIndex >= 0 ? `${id}-${activeIndex}` : undefined}
          autoComplete="off"
          placeholder="Search anime…"
          value={query}
          className="min-w-0 flex-1 cursor-text bg-transparent py-2 text-sm text-[var(--text)] outline-none placeholder:text-[var(--text-faint)]"
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
              select(results[Math.max(0, activeIndex)].id);
            }
          }}
        />
        {query && <button type="button" aria-label="Clear anime search" onClick={() => { setQuery(""); setActiveIndex(-1); input.current?.focus(); }} className="-mr-3 grid h-11 w-11 shrink-0 place-items-center rounded-full text-[var(--text-soft)] hover:text-[var(--primary)]"><X size={16} /></button>}
      </div>
      <div hidden={!expanded} className="absolute right-0 top-full mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border-strong)] bg-[var(--bg)] p-2 shadow-xl">
        <p role="status" className="px-3 py-2 text-xs text-[var(--text-soft)]">{results.length ? `${results.length} matches · ↑↓ to choose, Enter to open` : "No anime found. Try another title or genre."}</p>
        <ul id={`${id}-results`} role="listbox" aria-label="Anime results">
          {results.map((anime, index) => <li key={anime.id} id={`${id}-${index}`} role="option" aria-selected={activeIndex === index} onMouseDown={(event) => event.preventDefault()} onClick={() => select(anime.id)} className={`cursor-pointer rounded-lg px-3 py-3 text-sm ${activeIndex === index ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "hover:bg-[var(--primary-soft)]"}`}>
            <span className="block font-semibold">{anime.title}</span>
            <span className="mt-1 block text-xs text-[var(--text-soft)]">{anime.genres.join(" · ")}</span>
          </li>)}
        </ul>
      </div>
    </div>
  );
}
