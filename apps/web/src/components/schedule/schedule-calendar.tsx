"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { buildCalendarGroups, calendarDateKey, carouselIndices, minuteLabel, type CalendarGroup } from "@/features/schedule/calendar";
import { displayTime, getEffectiveDate, isDelayed, type ScheduleAnime } from "@/features/schedule/model";
import styles from "./schedule-calendar.module.css";

export type CalendarView = "week" | "day";
type Activation = "hover" | "activate";
type CoverOrigin = { left: number; top: number; width: number; height: number };
type OpenOverlay = { group: CalendarGroup; anchor: HTMLButtonElement; activation: Activation; phase: "opening" | "open" | "closing" } & (
  | { kind: "carousel"; startIndex: number; openingPointer: { x: number; y: number } | null }
  | { kind: "detail"; selectedIndex: number; selection: Activation; origin?: CoverOrigin }
);
type OverlayState = { kind: "closed" } | OpenOverlay;
type Placement = { direction: "left" | "right"; left: number; top: number; coverWidth: number; coverHeight: number; detailWidth: number; carouselCoverWidth: number };

function isHoverPointer(event: ReactPointerEvent) {
  return event.pointerType === "mouse" || event.pointerType === "pen" && event.buttons === 0;
}

function containsPointer(element: Element, event: ReactPointerEvent) {
  if (event.relatedTarget instanceof Node && element.contains(event.relatedTarget)) return true;
  const bounds = element.getBoundingClientRect();
  return event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top && event.clientY <= bounds.bottom;
}

function Poster({ anime }: { anime: ScheduleAnime }) {
  const [failedPath, setFailedPath] = useState<string | null>(null);
  return <span className={styles.coverImage}>
    {anime.imageVersionRoute && anime.imageVersionRoute !== failedPath
      ? <Image src={`https://img.animeschedule.net/production/assets/public/img/${anime.imageVersionRoute}`} alt="" fill sizes="144px" className="object-cover" onError={() => setFailedPath(anime.imageVersionRoute)} />
      : <span aria-hidden="true" className="grid h-full place-items-center">{anime.title.trim().charAt(0).toLocaleUpperCase()}</span>}
  </span>;
}

function Details({ anime, timeZone, focusTarget }: { anime: ScheduleAnime; timeZone: string; focusTarget?: (element: HTMLAnchorElement | null) => void }) {
  const date = getEffectiveDate(anime);
  const episode = anime.episodeNumber === null ? "Episode to be confirmed"
    : anime.subtractedEpisodeNumber !== null && anime.subtractedEpisodeNumber < anime.episodeNumber
      ? `Episodes ${anime.subtractedEpisodeNumber}-${anime.episodeNumber}` : `Episode ${anime.episodeNumber}`;
  const status = isDelayed(anime) ? "Delayed" : (anime.airingStatus ?? anime.status ?? "Scheduled").replaceAll("_", " ");
  return <div className={styles.detailInner} role="region" aria-label={`${anime.title} broadcast information`} tabIndex={0}>
    <div className="mb-3 flex flex-wrap items-center gap-2 text-xs"><span className="rounded bg-[var(--primary-soft)] px-2 py-1 font-bold text-[var(--primary)]">RAW</span><span className="text-[var(--text-soft)]">{status}</span></div>
    <h3 className="break-words text-lg font-extrabold leading-snug">{anime.title}</h3>
    <p className="mt-2 text-sm text-[var(--text-soft)]">{episode}</p>
    <p className="mt-3 font-bold tabular-nums text-[var(--primary)]">{date ? displayTime(date, timeZone) : "Time TBD"}</p>
    {isDelayed(anime) ? <p className="mt-3 text-xs font-semibold text-[var(--gold)]">{anime.delayedText ?? (date ? `Rescheduled to ${displayTime(date, timeZone)}` : "A new time has not been announced.")}</p> : null}
    <a ref={focusTarget} href={`https://animeschedule.net/anime/${encodeURIComponent(anime.route)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--primary)] underline underline-offset-4">Anime details <ExternalLink aria-hidden="true" size={13} /></a>
  </div>;
}

function CalendarOverlay({ state, timeZone, onChange, onClosed }: { state: OpenOverlay; timeZone: string; onChange: (state: OverlayState) => void; onClosed: (restoreFocus: boolean) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const lastPointer = useRef(state.kind === "carousel" ? state.openingPointer : null);
  const focusTarget = useRef<HTMLElement | null>(null);
  const setFocusTarget = useCallback((element: HTMLElement | null) => { focusTarget.current = element; }, []);
  const [placement, setPlacement] = useState<Placement | null>(null);
  const isDetail = state.kind === "detail";
  const moveFocus = state.kind === "detail" ? state.selection === "activate" : state.activation === "activate";
  const origin = state.kind === "detail" ? state.origin : undefined;
  const anchor = state.anchor;
  const close = useCallback((restore = false) => onClosed(restore), [onClosed]);

  useLayoutEffect(() => {
    let frame = 0;
    function measure() {
      const rect = anchor.getBoundingClientRect();
      const gutter = 12;
      const viewportWidth = document.documentElement.clientWidth;
      const coverWidth = origin?.width || rect.width || 144;
      const coverHeight = origin?.height || rect.height || 201.6;
      const originLeft = rect.left + (origin?.left ?? 0);
      const originTop = rect.top + (origin?.top ?? 0);
      const detailWidth = Math.min(320, viewportWidth - gutter * 2 - coverWidth);
      const carouselItemCount = Math.min(3, state.group.items.length);
      const carouselOverhead = 114 + (carouselItemCount + 1) * 10;
      const carouselWidth = Math.min(carouselItemCount * 144 + carouselOverhead, viewportWidth - gutter * 2);
      const carouselCoverWidth = Math.min(144, (carouselWidth - carouselOverhead) / carouselItemCount);
      const width = isDetail ? coverWidth + detailWidth : carouselWidth;
      const carouselOriginIndex = carouselItemCount >= 3 ? 1 : 0;
      const direction = originLeft + coverWidth + detailWidth > viewportWidth - gutter ? "left" : "right";
      const proposedLeft = isDetail ? originLeft - (direction === "left" ? detailWidth : 0) : rect.left - 67 - carouselOriginIndex * (carouselCoverWidth + 10);
      const left = Math.max(gutter, Math.min(proposedLeft, viewportWidth - width - gutter));
      const height = isDetail ? coverHeight : carouselCoverWidth * 1.4 + 34;
      setPlacement({
        direction,
        left,
        top: isDetail ? originTop : Math.max(gutter, Math.min(rect.top - 21, window.innerHeight - height - gutter)),
        coverWidth,
        coverHeight,
        detailWidth,
        carouselCoverWidth,
      });
    }
    function scrolled(event: Event) {
      if (event.target instanceof Node && root.current?.contains(event.target)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", scrolled, true);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("scroll", scrolled, true); };
  }, [anchor, isDetail, origin, state.group.items.length]);

  useEffect(() => {
    if (state.phase !== "opening" || !placement) return;
    const frame = requestAnimationFrame(() => { onChange({ ...state, phase: "open" }); });
    return () => cancelAnimationFrame(frame);
  }, [onChange, placement, state]);

  const positioned = placement !== null;
  useEffect(() => {
    if (moveFocus && positioned) focusTarget.current?.focus({ preventScroll: true });
  }, [isDetail, moveFocus, positioned]);

  useEffect(() => {
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target) && !anchor.contains(event.target)) close();
    }
    function keyboard(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); close(true); }
    }
    function moved() { close(); }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", keyboard);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", keyboard);
      window.removeEventListener("resize", moved);
    };
  }, [anchor, close]);

  if (!placement) return null;
  const activeIndex = state.kind === "detail" ? state.selectedIndex : state.startIndex + (state.group.items.length >= 3 ? 1 : 0);
  const anime = state.group.items[activeIndex] ?? state.group.items[0];
  const variables = { "--cover-width": `${placement.coverWidth}px`, "--cover-height": `${placement.coverHeight}px`, "--detail-width": `${placement.detailWidth}px`, "--available-height": `${Math.max(0, window.innerHeight - placement.top)}px`, "--carousel-cover-width": `${placement.carouselCoverWidth}px`, left: isDetail && placement.direction === "left" ? undefined : placement.left, right: isDetail && placement.direction === "left" ? document.documentElement.clientWidth - placement.left - placement.coverWidth - placement.detailWidth : undefined, top: placement.top } as CSSProperties;
  const coverStyle = { width: placement.coverWidth, height: placement.coverHeight };
  const indices = carouselIndices(state.group.items.length, state.kind === "carousel" ? state.startIndex : 0);
  function selectCover(index: number, element: HTMLButtonElement, selection: Activation) {
    const rect = element.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    onChange({ kind: "detail", group: state.group, anchor, activation: state.activation, selectedIndex: index, selection, origin: { left: rect.left - anchorRect.left, top: rect.top - anchorRect.top, width: rect.width, height: rect.height }, phase: "opening" });
  }
  return createPortal(<div ref={root} role="dialog" aria-label={isDetail ? `${anime.title} broadcast details` : `${state.group.items.length} broadcasts at ${minuteLabel(state.group.minuteOfDay)}`} data-schedule-overlay={state.kind} data-phase={state.phase} data-direction={isDetail ? placement.direction : undefined} className={`${styles.overlay} ${isDetail ? `${styles.detailOverlay} ${placement.direction === "left" ? styles.expandLeft : ""}` : ""} ${state.phase === "open" ? styles.expanded : ""}`} style={variables} onPointerEnter={() => {
    if (state.phase === "closing" && state.group.items.length === 1) onChange({ ...state, phase: "open" });
  }} onPointerMove={(event) => { lastPointer.current = { x: event.clientX, y: event.clientY }; }} onPointerLeave={(event) => {
    lastPointer.current = { x: event.clientX, y: event.clientY };
    if (state.group.items.length > 1) return;
    if (containsPointer(event.currentTarget, event) || containsPointer(anchor, event)) return;
    if (isHoverPointer(event)) close();
  }}>
    {state.kind === "detail" ? <>
      <button ref={state.group.items.length === 1 ? setFocusTarget : undefined} type="button" aria-label={`${anime.title} cover`} className={styles.cover} style={coverStyle} onClick={() => onChange({ ...state, activation: "activate", selection: "activate" })}><Poster anime={anime} /></button>
      <div className={styles.detail}><Details anime={anime} timeZone={timeZone} focusTarget={state.group.items.length > 1 ? setFocusTarget : undefined} /></div>
    </> : <div className={styles.carousel}>
      <button type="button" aria-label="Previous broadcast" disabled={state.startIndex === 0} className={styles.control} onClick={() => onChange({ ...state, startIndex: state.startIndex - 1 })}><ChevronLeft aria-hidden="true" size={18} /></button>
      {indices.map((index) => {
        const item = state.group.items[index];
        const center = state.group.items.length < 3 || index === state.startIndex + 1;
        const originIndex = state.startIndex + (state.group.items.length >= 3 ? 1 : 0);
        return <button ref={(state.group.items.length < 3 ? index === state.startIndex : center) ? setFocusTarget : undefined} key={item.id} type="button" aria-label={`Show details for ${item.title}`} className={`${styles.cover} ${styles.carouselCover} ${center ? "" : styles.sideCover}`} style={{ "--fan-offset": `${(originIndex - index) * (placement.carouselCoverWidth + 10)}px`, zIndex: index === originIndex ? 1 : 0 } as CSSProperties} onPointerMove={(event) => {
          if (state.phase !== "open" || !isHoverPointer(event) || event.buttons !== 0) return;
          if (lastPointer.current?.x === event.clientX && lastPointer.current.y === event.clientY) return;
          selectCover(index, event.currentTarget, "hover");
        }} onClick={(event) => selectCover(index, event.currentTarget, "activate")}><Poster anime={item} /></button>;
      })}
      <button type="button" aria-label="Next broadcast" disabled={state.startIndex >= state.group.items.length - 3} className={styles.control} onClick={() => onChange({ ...state, startIndex: state.startIndex + 1 })}><ChevronRight aria-hidden="true" size={18} /></button>
      <span className="sr-only" role="status">{anime.title}, {activeIndex + 1} of {state.group.items.length}</span>
    </div>}
  </div>, document.body);
}

export function ScheduleCalendar({ days, items, timeZone, view, selectedDay }: { days: readonly Date[]; items: readonly ScheduleAnime[]; timeZone: string; view: CalendarView; selectedDay: number }) {
  const dateKeys = days.map(calendarDateKey);
  const groups = useMemo(() => buildCalendarGroups(items, timeZone, days.map(calendarDateKey)), [days, items, timeZone]);
  const [overlay, setOverlay] = useState<OverlayState>({ kind: "closed" });
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const restoreFocusOnClose = useRef(false);
  const pendingFocus = useRef<HTMLButtonElement | null>(null);
  const dismissedHover = useRef<HTMLButtonElement | null>(null);
  const changeOverlay = useCallback((next: OverlayState) => {
    if (closeTimer.current !== null) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOverlay(next);
  }, []);
  useLayoutEffect(() => {
    if (overlay.kind !== "closed") return;
    const anchor = pendingFocus.current;
    pendingFocus.current = null;
    if (anchor?.isConnected) anchor.focus({ preventScroll: true });
  }, [overlay.kind]);
  const close = useCallback((restoreFocus: boolean) => {
    if (overlay.kind === "closed" || overlay.phase === "closing") return;
    if (restoreFocus && overlay.activation === "activate") restoreFocusOnClose.current = true;
    const anchor = overlay.anchor;
    if (restoreFocus) dismissedHover.current = anchor;
    setOverlay({ ...overlay, phase: "closing" });
    closeTimer.current = setTimeout(() => {
      const activeElement = document.activeElement;
      const focusInOverlay = activeElement instanceof Element && activeElement.closest("[data-schedule-overlay]") !== null;
      if (restoreFocusOnClose.current || focusInOverlay || overlay.activation === "activate" && activeElement === document.body) pendingFocus.current = anchor;
      setOverlay({ kind: "closed" });
    }, window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? 0 : 220);
  }, [overlay]);
  useEffect(() => () => { if (closeTimer.current !== null) clearTimeout(closeTimer.current); }, []);
  const groupMap = new Map(groups.map((group) => [group.id, group]));
  const rows = [...new Set(groups.filter((group) => view === "week" || group.dateKey === dateKeys[selectedDay]).map((group) => group.minuteOfDay))];
  const visibleDays = view === "week" ? days : days.slice(selectedDay, selectedDay + 1);
  function open(group: CalendarGroup, anchor: HTMLButtonElement, activation: Activation, openingPointer: { x: number; y: number } | null = null) {
    restoreFocusOnClose.current = false;
    if (activation === "activate") dismissedHover.current = null;
    pendingFocus.current = null;
    changeOverlay(group.items.length > 1
      ? { kind: "carousel", group, startIndex: 0, anchor, activation, openingPointer, phase: "opening" }
      : { kind: "detail", group, selectedIndex: 0, anchor, activation, selection: activation, phase: "opening" });
  }
  const cover = (group: CalendarGroup) => <button type="button" aria-label={group.items.length === 1 ? `Show details for ${group.items[0].title}` : `${group.items.length} broadcasts at ${minuteLabel(group.minuteOfDay)}`} aria-haspopup="dialog" aria-expanded={overlay.kind !== "closed" && overlay.group.id === group.id} className={styles.cover} style={overlay.kind !== "closed" && overlay.group.id === group.id ? { visibility: "hidden" } : undefined} onPointerEnter={(event) => {
    if (dismissedHover.current === event.currentTarget) return;
    if (view === "week" && group.items.length === 1 && isHoverPointer(event)) open(group, event.currentTarget, "hover");
  }} onPointerLeave={(event) => {
    if (dismissedHover.current === event.currentTarget && !containsPointer(event.currentTarget, event)) dismissedHover.current = null;
    if (overlay.kind === "closed" || overlay.group.id !== group.id || group.items.length > 1 || !isHoverPointer(event)) return;
    if (containsPointer(event.currentTarget, event)) return;
    const portal = document.querySelector("[data-schedule-overlay]");
    if (portal && containsPointer(portal, event)) return;
    close(false);
  }} onClick={(event) => open(group, event.currentTarget, "activate", event.detail === 0 ? null : { x: event.clientX, y: event.clientY })}><Poster anime={group.items[group.items.length >= 3 ? 1 : 0]} />{group.items.length > 1 ? <span className={styles.badge} aria-hidden="true">{group.items.length}</span> : null}</button>;
  return <>
    {rows.length > 0 ? <table className={styles.table} aria-label={view === "week" ? "Weekly broadcast calendar" : "Daily broadcast calendar"}>
      <thead><tr><th scope="col"><span className="sr-only">Time</span></th>{visibleDays.map((date) => <th scope="col" key={calendarDateKey(date)}><span className="block font-extrabold">{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span><span className="mt-1 block font-medium text-[var(--text-soft)]">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date)}</span></th>)}</tr></thead>
      <tbody>{rows.map((minute) => <tr key={minute}><th scope="row">{minuteLabel(minute)}</th>{visibleDays.map((date) => { const group = groupMap.get(`${calendarDateKey(date)}:${minute}`); return <td key={calendarDateKey(date)}>{group ? cover(group) : null}</td>; })}</tr>)}</tbody>
    </table> : null}
    {overlay.kind !== "closed" ? <CalendarOverlay key={overlay.group.id} state={overlay} timeZone={timeZone} onChange={changeOverlay} onClosed={close} /> : null}
  </>;
}
