"use client";

import { ChevronLeft, ChevronRight, Flower2, Leaf, Search, Snowflake, Sun } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { firstSeasonYear, seasonHref, seasonLabel, seasonSelection, seasons, type SeasonSelection, type SeasonalResult } from "@/features/seasonal/model";
import { SeasonalAnimeCard } from "./seasonal-anime-card";

const seasonIcons = [Snowflake, Flower2, Sun, Leaf];
const formats = [{ value: "all", label: "All anime" }, { value: "tv", label: "TV" }, { value: "movie", label: "Movies" }, { value: "ona", label: "ONA" }, { value: "ova", label: "OVA" }, { value: "special", label: "Specials" }, { value: "other", label: "Other" }];

export function SeasonalBrowser({ current }: { current: SeasonSelection }) {
  const params = useSearchParams();
  const selection = seasonSelection(params, current);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const currentSelected = selection.year === current.year && selection.season === current.season;
  function select(next: SeasonSelection) {
    if (next.year !== selection.year || next.season !== selection.season) window.history.pushState(null, "", seasonHref(next));
  }
  function navigateTabs(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const nextIndex = event.key === "ArrowRight" ? (index + 1) % 4 : event.key === "ArrowLeft" ? (index + 3) % 4 : event.key === "Home" ? 0 : event.key === "End" ? 3 : null;
    if (nextIndex === null) return;
    event.preventDefault();
    // Manual activation: arrows move focus; Enter/Space selects and loads a season.
    tabRefs.current[nextIndex]?.focus();
  }
  return <AppShell>
    <section aria-labelledby="seasonal-heading" className="mb-8 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div><p className="eyebrow mb-3 text-[var(--primary)]">Discover your next favorite</p><h1 id="seasonal-heading" className="screen-title">Seasonal anime</h1><p className="mt-3 text-sm leading-6 text-[var(--text-soft)]">New stories, returning favorites. Explore the anime calendar.</p></div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" disabled={currentSelected} onClick={() => select(current)} className="min-h-11 rounded-lg border border-[var(--border)] px-4 text-sm font-semibold text-[var(--primary)] disabled:opacity-50">This season</button>
        <div className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--bg-lowest)]">
          <button type="button" aria-label="Previous year" disabled={selection.year <= firstSeasonYear} onClick={() => select({ ...selection, year: selection.year - 1 })} className="grid h-11 w-11 place-items-center rounded-l-lg hover:bg-[var(--primary-soft)] disabled:opacity-40"><ChevronLeft aria-hidden="true" size={18} /></button>
          <label className="sr-only" htmlFor="season-year">Season year</label><select id="season-year" value={selection.year} onChange={(event) => select({ ...selection, year: Number(event.target.value) })} className="h-11 cursor-pointer bg-transparent px-3 text-base font-bold tabular-nums">{Array.from({ length: current.year + 2 - firstSeasonYear }, (_, i) => current.year + 1 - i).map((year) => <option key={year} value={year} className="bg-[var(--bg)]">{year}</option>)}</select>
          <button type="button" aria-label="Next year" disabled={selection.year >= current.year + 1} onClick={() => select({ ...selection, year: selection.year + 1 })} className="grid h-11 w-11 place-items-center rounded-r-lg hover:bg-[var(--primary-soft)] disabled:opacity-40"><ChevronRight aria-hidden="true" size={18} /></button>
        </div>
      </div>
    </section>
    <div role="tablist" aria-label="Anime season" className="mb-8 grid grid-cols-4 rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] p-1.5 sm:gap-2">
      {seasons.map((season, index) => {
        const Icon = seasonIcons[index]; const active = selection.season === season.value;
        return <button key={season.value} ref={(element) => { tabRefs.current[index] = element; }} id={`season-${season.value}`} type="button" role="tab" aria-selected={active} aria-controls="season-panel" tabIndex={active ? 0 : -1} onKeyDown={(event) => navigateTabs(event, index)} onClick={() => select({ ...selection, season: season.value })} className={`flex min-h-20 items-center justify-center gap-3 rounded-lg border-b-2 px-1 py-3 transition-colors sm:px-5 ${active ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "border-transparent text-[var(--text-soft)] hover:bg-[var(--bg-low)]"}`}><Icon aria-hidden="true" className="hidden sm:block" size={23} /><span className="text-center sm:text-left"><span className="block text-sm font-extrabold sm:text-base">{season.label}</span><span className="mt-1 block text-xs">{season.months}</span></span></button>;
      })}
    </div>
    <section id="season-panel" role="tabpanel" aria-labelledby={`season-${selection.season}`} tabIndex={0}>
      <SeasonalResults key={`${selection.year}-${selection.season}`} selection={selection} currentSelected={currentSelected} />
    </section>
  </AppShell>;
}

function SeasonalResults({ selection, currentSelected }: { selection: SeasonSelection; currentSelected: boolean }) {
  const [data, setData] = useState<SeasonalResult>({ items: [], nextPage: null });
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [format, setFormat] = useState("all");
  const [sort, setSort] = useState("popular");
  const [visible, setVisible] = useState(24);
  const { year, season } = selection;
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/anime/seasonal?${new URLSearchParams({ year: String(year), season, page: String(page) })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("seasonal_unavailable");
        const result: SeasonalResult = await response.json();
        if (!Array.isArray(result.items)) throw new Error("invalid_response");
        if (!controller.signal.aborted) setData((previous) => ({ items: [...new Map([...previous.items, ...result.items].map((anime) => [anime.id, anime])).values()], nextPage: result.nextPage }));
      } catch { if (!controller.signal.aborted) setError(true); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [year, season, page, attempt]);
  const results = data.items.filter((anime) => {
    const matchesFormat = format === "all" || (format === "special" ? ["special", "tv_special"].includes(anime.format) : format === "other" ? !["tv", "movie", "ona", "ova", "special", "tv_special"].includes(anime.format) : anime.format === format);
    return matchesFormat && `${anime.title} ${anime.subtitle} ${anime.genres.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
  }).sort((a, b) => (sort === "score" ? Number(b.score ?? 0) - Number(a.score ?? 0) : sort === "title" ? a.title.localeCompare(b.title) : b.members - a.members) || a.title.localeCompare(b.title));
  function retry() { setLoading(true); setError(false); setAttempt((value) => value + 1); }
  const label = seasonLabel(selection);
  return <>
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-2xl font-extrabold tracking-tight">{label}</h2>{currentSelected && <span className="rounded-full bg-[var(--primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">Current season</span>}</div>
      <a href={`https://myanimelist.net/anime/season/${year}/${season}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-xs text-[var(--text-soft)] underline underline-offset-4 hover:text-[var(--primary)]">Season on MyAnimeList ↗</a>
    </div>
    <div className="mb-5 flex flex-col gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] p-4 xl:flex-row xl:items-center xl:justify-between">
      <div role="group" aria-label="Anime format" className="flex flex-wrap gap-1">{formats.map((item) => <button key={item.value} type="button" aria-pressed={format === item.value} onClick={() => { setFormat(item.value); setVisible(24); }} className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition-colors ${format === item.value ? "bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--text-soft)] hover:bg-[var(--bg-low)]"}`}>{item.label}</button>)}</div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="relative block min-w-0 flex-1"><span className="sr-only">Search this season</span><Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setVisible(24); }} placeholder="Search this season…" className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-sm sm:w-56" /></label>
        <label className="flex items-center gap-2 text-xs text-[var(--text-soft)]">Sort by<select value={sort} onChange={(event) => { setSort(event.target.value); setVisible(24); }} className="h-11 flex-1 cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 text-sm"><option value="popular">Most popular</option><option value="score">Highest score</option><option value="title">Title A–Z</option></select></label>
      </div>
    </div>
    <p role="status" className="mb-5 text-xs text-[var(--text-soft)]">{loading ? `Loading ${label} anime…` : error && !data.items.length ? `${label} could not be loaded.` : `${results.length} ${results.length === 1 ? "title" : "titles"}${data.nextPage ? " loaded" : ""} · ${label}`}</p>
    {loading && !data.items.length ? <div aria-hidden="true" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="h-96 rounded-xl border border-[var(--border)] bg-[var(--bg-low)] motion-safe:animate-pulse" />)}</div> : null}
    {error && <div role="alert" className="mb-6 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-lowest)] p-6"><h3 className="font-bold">The seasonal catalog is taking a break.</h3><p className="mt-2 text-sm text-[var(--text-soft)]">We couldn’t load {label}. Try again in a moment, or choose another season.</p><button type="button" disabled={loading} onClick={retry} className="mt-4 min-h-11 rounded-lg bg-[var(--primary-soft)] px-5 text-sm font-bold text-[var(--primary)]">{loading ? "Retrying…" : "Try again"}</button></div>}
    {results.length ? <div className="grid items-stretch gap-5 md:grid-cols-2 xl:grid-cols-3">{results.slice(0, visible).map((anime) => <SeasonalAnimeCard key={anime.id} anime={anime} />)}</div> : !loading && !error ? <div className="rounded-xl border border-dashed border-[var(--border-strong)] p-12 text-center"><Leaf aria-hidden="true" className="mx-auto mb-4 text-[var(--primary)]" size={28} /><h3 className="text-xl font-bold">{data.nextPage !== null ? "No matches in loaded titles" : data.items.length ? "No matching anime" : "No anime announced yet"}</h3><p className="mt-3 text-sm text-[var(--text-soft)]">{data.nextPage !== null ? "Load more anime to search the next titles, or try a different title or format." : data.items.length ? "Try a different title or format." : `Check back for the ${label} lineup, or explore another season.`}</p>{data.items.length ? <button type="button" onClick={() => { setQuery(""); setFormat("all"); }} className="mt-4 min-h-11 rounded-lg border border-[var(--border)] px-5 text-sm font-semibold">Clear filters</button> : null}</div> : null}
    {!error && (results.length > visible || data.nextPage !== null) ? <div className="mt-8 text-center"><button type="button" disabled={loading} onClick={() => { setVisible((count) => count + 24); if (results.length <= visible && data.nextPage) { setLoading(true); setError(false); setPage(data.nextPage); } }} className="min-h-12 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-lowest)] px-8 text-sm font-bold text-[var(--primary)] disabled:opacity-50">{loading ? "Loading more…" : "Load more anime"}</button></div> : null}
  </>;
}
