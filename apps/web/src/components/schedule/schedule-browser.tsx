"use client";

import Image from "next/image";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, ExternalLink, Globe2, RotateCw, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { syncMalAccount } from "@/features/mal/client";
import { useTrackerStore } from "@/features/tracker/store";
import { currentSeason, isSeason, seasonLabel, validSeasonYear, type SeasonSelection } from "@/features/seasonal/model";
import { AppShell } from "@/components/layout/app-shell";
import {
  calendarDateInTimeZone,
  displayTime,
  getDateKey,
  getEffectiveDate,
  getIsoWeek,
  isoWeekDates,
  isScheduleWeek,
  isDelayed,
  shiftIsoWeek,
  type AirType,
  type ScheduleAnime,
  type ScheduleWeek,
} from "@/features/schedule/model";

type ScheduleError = "not_configured" | "unavailable" | "invalid_payload";
type ScheduleErrorSource = "catalog" | "timetable";
type ZoneChoice = "local" | "japan";

interface ScheduleResponse {
  state: "ready";
  season: SeasonSelection;
  matchedAnimeCount: number;
  items: ScheduleAnime[];
}

type ScheduleLoadState =
  | { status: "loading" }
  | { status: "unauthenticated"; accountKey: string }
  | { status: "list_not_imported"; accountKey: string }
  | { status: "error"; accountKey: string; error: ScheduleError; source?: ScheduleErrorSource }
  | ({ status: "ready"; accountKey: string } & Omit<ScheduleResponse, "state">);

function isScheduleResponse(value: unknown): value is ScheduleResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Record<string, unknown>;
  const season = response.season as Record<string, unknown> | null;
  return response.state === "ready"
    && Boolean(season && Number.isInteger(season.year) && validSeasonYear(season.year as number, currentSeason().year) && isSeason(season.season))
    && Number.isSafeInteger(response.matchedAnimeCount) && (response.matchedAnimeCount as number) >= 0
    && Array.isArray(response.items);
}
const airTypeOptions: { value: AirType; label: string }[] = [
  { value: "all", label: "All broadcasts" },
  { value: "sub", label: "Sub" },
  { value: "dub", label: "Dub" },
  { value: "raw", label: "Raw" },
];

const emptyScheduleItems: ScheduleAnime[] = [];

const timeSlots = [
  { id: "morning", label: "Morning", range: "06:00 - 12:00", lower: 6, upper: 12 },
  { id: "daytime", label: "Daytime", range: "12:00 - 18:00", lower: 12, upper: 18 },
  { id: "evening", label: "Evening", range: "18:00 - 22:00", lower: 18, upper: 22 },
  { id: "late-night", label: "Late night", range: "22:00 - 06:00", lower: 22, upper: 6 },
] as const;

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function calendarDateKey(date: Date) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function calendarLabel(date: Date, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function hourInZone(date: string, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(date)));
  return Number.isInteger(hour) ? hour : 0;
}

function slotFor(item: ScheduleAnime, timeZone: string) {
  const date = getEffectiveDate(item);
  if (!date) return null;
  const hour = hourInZone(date, timeZone);
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "daytime";
  if (hour >= 18 && hour < 22) return "evening";
  return "late-night";
}

function episodeLabel(item: ScheduleAnime) {
  if (item.episodeNumber === null) return "Episode to be confirmed";
  if (item.subtractedEpisodeNumber !== null && item.subtractedEpisodeNumber < item.episodeNumber) {
    return `Episodes ${item.subtractedEpisodeNumber}-${item.episodeNumber}`;
  }
  return `Episode ${item.episodeNumber}`;
}

function airingLabel(item: ScheduleAnime) {
  if (item.status?.toLowerCase() === "delayed") return "Delayed";
  if (item.airingStatus) return item.airingStatus.replaceAll("_", " ");
  if (item.status) return item.status;
  return item.episodeDate ? "Scheduled" : "Time TBD";
}

function AnimeScheduleCard({ anime, timeZone }: { anime: ScheduleAnime; timeZone: string }) {
  const delayed = isDelayed(anime);
  const date = getEffectiveDate(anime);
  const airType = anime.airType.toLowerCase();
  const badge = ["raw", "sub", "dub"].includes(airType) ? airType.toUpperCase() : "AIRING";
  const status = airingLabel(anime);
  const delayNote = delayed
    ? anime.delayedText ?? (date ? `Rescheduled to ${displayTime(date, timeZone)}` : "A new time has not been announced.")
    : null;

  return (
    <article className="group flex min-h-[150px] gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] p-3 transition-colors hover:border-[var(--border-strong)] sm:gap-5 sm:p-4">
      <div className="relative grid aspect-[4/5] w-24 shrink-0 place-items-center overflow-hidden rounded-lg bg-gradient-to-br from-[var(--primary-soft)] via-[var(--bg-high)] to-[var(--bg-low)] text-3xl font-black text-[var(--primary)] sm:w-28">
        {anime.imageVersionRoute
          ? <Image src={`https://img.animeschedule.net/production/assets/public/img/${anime.imageVersionRoute}`} alt="" fill sizes="112px" className="object-cover" />
          : <span aria-hidden="true">{anime.title.trim().charAt(0).toLocaleUpperCase()}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex min-h-6 items-center rounded-md bg-[var(--primary-soft)] px-2 font-bold text-[var(--primary)]">{badge}</span>
            <span className="text-[var(--text-faint)]">{status}</span>
          </div>
          <h3 className="break-words text-base font-extrabold leading-snug sm:text-lg">{anime.title}</h3>
          <p className="mt-1 text-sm text-[var(--text-soft)]">{episodeLabel(anime)}</p>
          {delayNote ? <p className="mt-2 text-xs font-semibold text-[var(--gold)]">{delayNote}</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2 text-sm font-bold tabular-nums text-[var(--primary)]">
            <Clock3 aria-hidden="true" size={15} />
            {date ? displayTime(date, timeZone) : "Time TBD"}
          </span>
          <a
            href={`https://animeschedule.net/anime/${encodeURIComponent(anime.route)}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-xs font-semibold text-[var(--text-soft)] underline decoration-[var(--border-strong)] underline-offset-4 hover:text-[var(--primary)]"
          >
            Anime details <ExternalLink aria-hidden="true" size={13} />
          </a>
        </div>
      </div>
    </article>
  );
}

export function ScheduleBrowser() {
  const [week, setWeek] = useState<ScheduleWeek | null>(null);
  const [selectedDay, setSelectedDay] = useState(0);
  const [zoneChoice, setZoneChoice] = useState<ZoneChoice>("local");
  const [localZone, setLocalZone] = useState("UTC");
  const [airType, setAirType] = useState<AirType>("all");
  const [query, setQuery] = useState("");
  const [storedScheduleState, setScheduleState] = useState<ScheduleLoadState>({ status: "loading" });
  const [isSyncPending, startSyncTransition] = useTransition();
  const [attempt, setAttempt] = useState(0);
  const malUserId = useTrackerStore((state) => state.malUser?.id ?? null);
  const malSessionVersion = useTrackerStore((state) => state.malSessionVersion);
  const malConfigured = useTrackerStore((state) => state.malConfigured);
  const malSyncStatus = useTrackerStore((state) => state.malSync.status);
  const malSyncError = useTrackerStore((state) => state.malSync.error);
  const malSyncLastSyncedAt = useTrackerStore((state) => state.malSync.lastSyncedAt);
  const accountKey = String(malUserId ?? "anonymous") + ":" + malSessionVersion;
  const scheduleState = "accountKey" in storedScheduleState && storedScheduleState.accountKey !== accountKey
    ? { status: "loading" as const }
    : storedScheduleState;
  const items = scheduleState.status === "ready" ? scheduleState.items : emptyScheduleItems;
  const loading = scheduleState.status === "loading";
  const error = scheduleState.status === "error" ? scheduleState.error : null;
  const errorSource = scheduleState.status === "error" ? scheduleState.source : undefined;
  const matchedAnimeCount = scheduleState.status === "ready" ? scheduleState.matchedAnimeCount : 0;
  const seasonTitle = scheduleState.status === "ready" ? seasonLabel(scheduleState.season) : null;
  const hasSeasonMatches = scheduleState.status === "ready" && scheduleState.matchedAnimeCount > 0;
  const showSchedulePanel = loading || hasSeasonMatches || error !== null;
  const syncBusy = isSyncPending || malSyncStatus === "syncing";
  const timeZone = zoneChoice === "japan" ? "Asia/Tokyo" : localZone;
  const todayInZone = calendarDateInTimeZone(new Date(), timeZone);
  const todayWeek = getIsoWeek(todayInZone);
  const todayOffset = (todayInZone.getDay() + 6) % 7;
  const days = week ? isoWeekDates(week) : [];

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      const now = new Date();
      setLocalZone(getLocalTimeZone());
      setWeek(getIsoWeek(now));
      setSelectedDay((now.getDay() + 6) % 7);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!week || !timeZone) return;
    let cancelled = false;
    const requestedWeek = week;
    const requestedAccountKey = accountKey;
    const controller = new AbortController();
    async function load() {
      setScheduleState({ status: "loading" });
      try {
        const params = new URLSearchParams({
          year: String(requestedWeek.year),
          week: String(requestedWeek.week),
          tz: timeZone,
          airType,
        });
        const response = await fetch("/api/schedule?" + params, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const result = await response.json() as unknown;
        const body = result && typeof result === "object" && !Array.isArray(result)
          ? result as Record<string, unknown>
          : {};
        const errorObject = body.error && typeof body.error === "object" && !Array.isArray(body.error)
          ? body.error as Record<string, unknown>
          : {};
        const code = typeof errorObject.code === "string" ? errorObject.code : undefined;
        const source: ScheduleErrorSource | undefined = errorObject.source === "catalog" || errorObject.source === "timetable"
          ? errorObject.source
          : undefined;
        if (cancelled || controller.signal.aborted) return;
        if (!response.ok && response.status === 401 && code === "unauthorized") {
          setScheduleState({ status: "unauthenticated", accountKey: requestedAccountKey });
          return;
        }
        if (!response.ok && response.status === 409 && code === "list_not_imported") {
          setScheduleState({ status: "list_not_imported", accountKey: requestedAccountKey });
          return;
        }
        if (!response.ok) {
          const error = code === "not_configured" ? "not_configured"
            : code === "invalid_payload" ? "invalid_payload"
              : "unavailable";
          setScheduleState({ status: "error", accountKey: requestedAccountKey, error, source });
          return;
        }
        if (!isScheduleResponse(result)) {
          setScheduleState({ status: "error", accountKey: requestedAccountKey, error: "invalid_payload" });
          return;
        }
        setScheduleState({
          status: "ready",
          accountKey: requestedAccountKey,
          season: result.season,
          matchedAnimeCount: result.matchedAnimeCount,
          items: result.items,
        });
      } catch {
        if (!cancelled && !controller.signal.aborted) {
          setScheduleState({ status: "error", accountKey: requestedAccountKey, error: "unavailable" });
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [accountKey, airType, attempt, malSessionVersion, malSyncLastSyncedAt, malUserId, timeZone, week]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return items.filter((item) => !normalizedQuery || `${item.title} ${item.route}`.toLocaleLowerCase().includes(normalizedQuery));
  }, [items, query]);

  if (!week || !todayWeek) {
    return <AppShell>
      <section className="grid min-h-[55vh] place-items-center rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-8" aria-label="Loading schedule">
        <p role="status" className="text-sm text-[var(--text-soft)]">Finding your local broadcast week...</p>
      </section>
    </AppShell>;
  }

  const selectedDate = days[selectedDay];
  const selectedKey = calendarDateKey(selectedDate);
  const scheduledByDay = days.map((day) => {
    const dayKey = calendarDateKey(day);
    return filteredItems.filter((item) => {
      const date = getEffectiveDate(item);
      return date !== null && getDateKey(new Date(date), timeZone) === dayKey;
    }).length;
  });
  const scheduledForDay = filteredItems
    .filter((item) => {
      const date = getEffectiveDate(item);
      return date !== null && getDateKey(new Date(date), timeZone) === selectedKey;
    })
    .toSorted((a, b) => {
      const left = getEffectiveDate(a);
      const right = getEffectiveDate(b);
      if (left && right) return Date.parse(left) - Date.parse(right) || a.title.localeCompare(b.title);
      if (left) return -1;
      if (right) return 1;
      return a.title.localeCompare(b.title);
    });
  const countsBySlot = timeSlots.map((slot) => ({
    ...slot,
    items: scheduledForDay.filter((item) => slotFor(item, timeZone) === slot.id),
  }));
  const tbdItems = filteredItems.filter((item) => getEffectiveDate(item) === null);
  const nextWeek = shiftIsoWeek(week, 1);
  const previousWeek = shiftIsoWeek(week, -1);
  const canGoForward = isScheduleWeek(nextWeek);
  const canGoBack = isScheduleWeek(previousWeek);
  const isCurrentWeek = week.year === todayWeek.year && week.week === todayWeek.week;
  const isTodaySelected = isCurrentWeek && selectedDay === todayOffset;
  const weekLabel = `${calendarLabel(days[0], { month: "short", day: "numeric" })} - ${calendarLabel(days[6], { month: "short", day: "numeric", year: "numeric" })}`;
  const selectedDateLabel = calendarLabel(selectedDate, { weekday: "long", month: "long", day: "numeric" });
  const timezoneLabel = zoneChoice === "japan" ? "JST (UTC+9)" : `Local time (${localZone})`;

  function goToWeek(next: ScheduleWeek) {
    setWeek(next);
    setQuery("");
  }

  function goToToday() {
    setWeek(todayWeek);
    setSelectedDay(todayOffset);
  }

  function changeZone(choice: ZoneChoice) {
    const nextTimeZone = choice === "japan" ? "Asia/Tokyo" : localZone;
    const today = calendarDateInTimeZone(new Date(), nextTimeZone);
    setZoneChoice(choice);
    setWeek(getIsoWeek(today));
    setSelectedDay((today.getDay() + 6) % 7);
  }

  function retry() {
    setAttempt((value) => value + 1);
  }

  function syncList() {
    if (!malUserId || syncBusy) return;
    startSyncTransition(async () => {
      try {
        await syncMalAccount();
      } catch {
        // The MAL client records a user-facing sync error in the tracker store.
      }
    });
  }

  return (
    <AppShell>
      <section aria-labelledby="schedule-heading" className="mb-7 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="eyebrow mb-3 text-[var(--primary)]">ANIME SCHEDULE / WEEKLY LINEUP</p>
          <h1 id="schedule-heading" className="screen-title">Broadcast schedule</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">{seasonTitle ? "Follow broadcasts for " + seasonTitle + " anime saved to your MyAnimeList, with times grouped in your selected time zone." : "Follow broadcasts for anime saved to your MyAnimeList, with times grouped in your selected time zone."}</p>
        </div>
        {showSchedulePanel ? <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-3 sm:flex-row sm:items-center">
          <div className="flex min-h-11 items-center rounded-lg border border-[var(--border)] bg-[var(--bg-low)] p-1">
            <button type="button" aria-label="Previous week" disabled={!canGoBack} onClick={() => goToWeek(previousWeek)} className="grid h-11 w-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-[var(--primary-soft)] disabled:opacity-40"><ChevronLeft aria-hidden="true" size={18} /></button>
            <span className="min-w-[145px] px-2 text-center text-sm font-bold tabular-nums">{weekLabel}</span>
            <button type="button" aria-label="Next week" disabled={!canGoForward} onClick={() => goToWeek(nextWeek)} className="grid h-11 w-11 min-w-11 shrink-0 place-items-center rounded-md hover:bg-[var(--primary-soft)] disabled:opacity-40"><ChevronRight aria-hidden="true" size={18} /></button>
          </div>
          <button type="button" disabled={isTodaySelected} onClick={goToToday} className="min-h-11 rounded-lg bg-[var(--primary-container)] px-5 text-sm font-extrabold text-[#312a58] disabled:opacity-50">Today</button>
          <label className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-lowest)] px-3 text-xs font-semibold text-[var(--text-soft)]">
            <Globe2 aria-hidden="true" size={15} />
            <span className="sr-only">Broadcast time zone</span>
            <select aria-label="Broadcast time zone" value={zoneChoice} onChange={(event) => changeZone(event.target.value as ZoneChoice)} className="max-w-[210px] cursor-pointer bg-transparent py-2 text-base font-bold sm:text-sm">
              <option value="local">Local time ({localZone})</option>
              <option value="japan">Japan time (JST)</option>
            </select>
          </label>
        </div> : null}
      </section>

      {scheduleState.status === "unauthenticated" ? (
        <section aria-labelledby="schedule-connect-heading" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><UserRound aria-hidden="true" size={22} /></span>
            <div className="min-w-0">
              <h2 id="schedule-connect-heading" className="text-lg font-extrabold">Connect MyAnimeList to personalize your schedule</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">Your broadcast lineup is matched against titles in your imported MyAnimeList list. Your list stays private to your account.</p>
              {malConfigured ? <a href="/api/auth/mal/start" className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-4 text-sm font-extrabold text-[#312a58]">Connect MyAnimeList <ExternalLink aria-hidden="true" size={14} /></a> : <p className="mt-4 text-sm font-semibold text-[var(--text-soft)]">MyAnimeList connection is not configured on this server yet.</p>}
            </div>
          </div>
        </section>
      ) : null}

      {scheduleState.status === "list_not_imported" ? (
        <section aria-labelledby="schedule-import-heading" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-6 sm:p-8">
          <h2 id="schedule-import-heading" className="text-lg font-extrabold">Import your MyAnimeList list to build your schedule</h2>
          <p role="status" aria-live="polite" className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">{syncBusy ? "Syncing your MyAnimeList list… Your saved lineup will appear when the import finishes." : malSyncStatus === "error" ? "The latest list sync needs attention. " + (malSyncError ?? "Try importing again.") : "A list import is needed before we can match this season’s broadcasts to your saved anime."}</p>
          <button type="button" disabled={syncBusy || !malUserId} onClick={syncList} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-4 text-sm font-extrabold text-[#312a58] disabled:cursor-not-allowed disabled:opacity-50"><RotateCw aria-hidden="true" size={15} className={syncBusy ? "animate-spin" : ""} />{syncBusy ? "Syncing list…" : malSyncStatus === "error" ? "Retry list import" : "Import MyAnimeList list"}</button>
        </section>
      ) : null}

      {scheduleState.status === "ready" && matchedAnimeCount === 0 ? (
        <section aria-labelledby="schedule-no-match-heading" className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><CalendarDays aria-hidden="true" size={22} /></span>
            <div>
              <h2 id="schedule-no-match-heading" className="text-lg font-extrabold">No {seasonTitle} broadcasts match your list yet</h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">We checked your imported MyAnimeList titles against the current season. Try syncing your list again later, or explore the <a href="/seasonal" className="font-semibold text-[var(--primary)] underline underline-offset-4">seasonal anime guide</a>.</p>
              {malUserId ? <button type="button" disabled={syncBusy} onClick={syncList} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[var(--border-strong)] px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-50"><RotateCw aria-hidden="true" size={15} className={syncBusy ? "animate-spin" : ""} />Sync MyAnimeList</button> : null}
            </div>
          </div>
        </section>
      ) : null}

      {showSchedulePanel ? <>
      <section aria-label="Schedule filters and search" className="mb-5 flex flex-col gap-4 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div role="group" aria-label="Broadcast language" className="flex flex-wrap gap-2">
          {airTypeOptions.map((option) => (
            <button key={option.value} type="button" aria-pressed={airType === option.value} onClick={() => setAirType(option.value)} className={`min-h-10 rounded-full border px-4 text-sm font-bold transition-colors ${airType === option.value ? "border-transparent bg-[var(--primary-container)] text-[#312a58]" : "border-[var(--border)] text-[var(--text-soft)] hover:bg-[var(--bg-low)]"}`}>
              {option.label}
            </button>
          ))}
        </div>
        <label className="relative block min-w-0 sm:w-64">
          <span className="sr-only">Search this week schedule</span>
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this week..." className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--bg)] pl-9 pr-3 text-base sm:text-sm" />
        </label>
        <p className="text-xs leading-5 text-[var(--text-faint)]">The AnimeSchedule Sub view can include Raw episodes when no subtitled listing is available.</p>
      </section>

      <section aria-label="Days of the week" className="mb-6 grid grid-cols-4 gap-2 lg:grid-cols-7">
        {days.map((day, index) => {
          const active = selectedDay === index;
          const dayLabel = calendarLabel(day, { weekday: "short" });
          const dayName = calendarLabel(day, { weekday: "long", month: "long", day: "numeric" });
          return (
            <button key={calendarDateKey(day)} type="button" aria-pressed={active} aria-label={`${dayName}, ${scheduledByDay[index]} scheduled`} onClick={() => setSelectedDay(index)} className={`min-h-20 rounded-xl border px-2 py-2 text-left transition-colors sm:min-h-[108px] sm:px-3 sm:py-3 ${active ? "border-[var(--border-strong)] bg-[var(--primary-soft)] text-[var(--primary)] shadow-sm" : "border-[var(--border)] bg-[var(--bg-lowest)] text-[var(--text-soft)] hover:border-[var(--border-strong)]"}`}>
              <span className="flex items-center justify-between text-[0.62rem] font-extrabold uppercase tracking-wide sm:text-xs">
                {dayLabel}
                {calendarDateKey(day) === calendarDateKey(todayInZone) ? <span className="rounded-full bg-[var(--primary-container)] px-1.5 py-0.5 text-[0.55rem] text-[#312a58] sm:px-2 sm:text-[0.6rem]">Today</span> : null}
              </span>
              <span className="mt-1 block text-[0.9rem] font-extrabold tabular-nums sm:mt-2 sm:text-xl">{calendarLabel(day, { month: "short", day: "numeric" })}</span>
              <span className="mt-1 block text-[0.62rem] sm:text-xs">{scheduledByDay[index]} scheduled</span>
            </button>
          );
        })}
      </section>

      <section id="schedule-day" aria-labelledby="schedule-day-heading" className="min-h-[360px] rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-4 sm:p-6 lg:p-8">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-2 text-[var(--primary)]">{timezoneLabel}</p>
            <h2 id="schedule-day-heading" className="flex items-center gap-2 text-xl font-extrabold sm:text-2xl"><CalendarDays aria-hidden="true" size={22} /> {selectedDateLabel}</h2>
          </div>
          <p role="status" aria-live="polite" className="text-xs text-[var(--text-soft)]">
            {loading ? "Loading broadcast schedule..." : error ? "Schedule data could not be loaded." : `${scheduledForDay.length} ${scheduledForDay.length === 1 ? "title" : "titles"}`}
          </p>
        </div>

        {loading ? <div aria-hidden="true" className="grid gap-3 md:grid-cols-2">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl bg-[var(--bg-low)] motion-reduce:animate-none" />)}</div> : null}

        {error ? (
          <div role="alert" className="rounded-xl border border-[var(--border-strong)] bg-[var(--bg-low)] p-6 sm:p-8">
            <h3 className="text-lg font-extrabold">{error === "not_configured" ? "Connect the broadcast schedule" : errorSource === "catalog" ? "The AnimeSchedule catalog is taking a break" : "The broadcast schedule is taking a break"}</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--text-soft)]">
              {error === "not_configured"
                ? "Add an AnimeSchedule application token to the server environment as ANIMESCHEDULE_API_TOKEN, then restart the app."
                : error === "invalid_payload"
                  ? errorSource === "catalog" ? "AnimeSchedule returned an unexpected catalog format. Try again shortly." : "AnimeSchedule returned an unexpected broadcast format. Try again shortly."
                  : errorSource === "catalog" ? "We could not load the current-season AnimeSchedule catalog. Check the connection and try again." : "We could not reach the AnimeSchedule broadcast timetable. Check the connection and try again."}
            </p>
            {error === "not_configured" ? <a href="https://animeschedule.net/api/v3/documentation/anime" target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-[var(--primary)] underline underline-offset-4">AnimeSchedule API setup <ExternalLink aria-hidden="true" size={14} /></a> : null}
            <div><button type="button" onClick={retry} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--primary-container)] px-4 text-sm font-extrabold text-[#312a58]"><RotateCw aria-hidden="true" size={15} /> Try again</button></div>
          </div>
        ) : null}

        {!loading && !error && scheduledForDay.length === 0 ? (
          <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-[var(--border-strong)] px-5 py-12 text-center">
            <div>
              <CalendarDays aria-hidden="true" className="mx-auto mb-4 text-[var(--primary)]" size={30} />
              <h3 className="text-lg font-extrabold">{query.trim() ? tbdItems.length > 0 ? "No scheduled broadcasts match this day" : "No titles match your search" : "No broadcasts listed for this day"}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--text-soft)]">{query.trim() ? tbdItems.length > 0 ? "Matching time-to-be-confirmed entries are listed for the week below." : "Try another title or clear the search." : "Choose another day or broadcast language to explore the week."}</p>
            </div>
          </div>
        ) : null}

        {!loading && !error && scheduledForDay.length > 0 ? (
          <div className="space-y-8">
            {countsBySlot.map((slot) => slot.items.length > 0 ? (
              <section key={slot.id} aria-labelledby={`slot-${slot.id}`}>
                <div className="mb-3 flex items-center gap-3">
                  <h3 id={`slot-${slot.id}`} className="shrink-0 rounded-full bg-[var(--bg-low)] px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide">{slot.label}</h3>
                  <span className="hidden h-px flex-1 bg-[var(--border)] sm:block" />
                  <span className="text-xs text-[var(--text-faint)]">{slot.range} | {slot.items.length}</span>
                </div>
                <div className="grid items-stretch gap-3 lg:grid-cols-2">{slot.items.map((anime) => <AnimeScheduleCard key={anime.id} anime={anime} timeZone={timeZone} />)}</div>
              </section>
            ) : null)}
          </div>
        ) : null}
      </section>

      {!loading && !error && tbdItems.length > 0 ? (
        <section aria-labelledby="slot-tbd" className="mt-5 rounded-2xl border border-[var(--border)] bg-[var(--bg-lowest)] p-4 sm:p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 id="slot-tbd" className="text-lg font-extrabold sm:text-xl">Time to be confirmed this week</h2>
            <span className="shrink-0 text-xs text-[var(--text-faint)]">{tbdItems.length} {tbdItems.length === 1 ? "title" : "titles"}</span>
          </div>
          <div className="grid items-stretch gap-3 lg:grid-cols-2">{tbdItems.map((anime) => <AnimeScheduleCard key={anime.id} anime={anime} timeZone={timeZone} />)}</div>
        </section>
      ) : null}

      <footer className="mt-5 flex flex-col items-start justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-lowest)] px-4 py-3 text-xs text-[var(--text-soft)] sm:flex-row sm:items-center">
        <p>Broadcast times shown in {timezoneLabel}.</p>
        <a href="https://animeschedule.net" target="_blank" rel="noreferrer" className="inline-flex min-h-9 items-center gap-1 font-semibold underline underline-offset-4 hover:text-[var(--primary)]">Schedule data by AnimeSchedule.net <ExternalLink aria-hidden="true" size={12} /></a>
      </footer>
      </> : null}

    </AppShell>
  );
}
