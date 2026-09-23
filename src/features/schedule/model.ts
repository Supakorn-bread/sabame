export const airTypes = ["all", "sub", "dub", "raw"] as const;
export type AirType = (typeof airTypes)[number];

export interface ScheduleWeek {
  year: number;
  week: number;
}

export interface ScheduleAnime {
  id: string;
  title: string;
  route: string;
  imageVersionRoute: string | null;
  episodeDate: string | null;
  delayedUntil: string | null;
  delayedText: string | null;
  episodeNumber: number | null;
  subtractedEpisodeNumber: number | null;
  status: string | null;
  airingStatus: string | null;
  airType: string;
}

const MAX_ITEMS = 500;
const routePattern = /^[a-z\d][a-z\d_-]{0,127}$/i;
const imageRoutePattern = new RegExp("^[a-z0-9][a-z0-9._-]*(?:/[a-z0-9][a-z0-9._-]*){0,8}$", "i");

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim().slice(0, maxLength)
    : null;
}

function dateTime(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 64) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && timestamp > 0 ? value : null;
}

function episode(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** Validate upstream records and keep only fields rendered by the schedule UI. */
export function normalizeSchedulePayload(payload: unknown): ScheduleAnime[] {
  if (!Array.isArray(payload) || payload.length > MAX_ITEMS) throw new Error("invalid_schedule_payload");

  const items: ScheduleAnime[] = [];
  for (const value of payload) {
    const source = record(value);
    if (!source) continue;

    const title = text(source.title, 240);
    const route = text(source.route, 128);
    if (!title || !route || !routePattern.test(route)) continue;

    const airType = text(source.airType, 32) ?? "all";
    const episodeDate = dateTime(source.episodeDate);
    const delayedUntil = dateTime(source.delayedUntil);
    const episodeNumber = episode(source.episodeNumber);
    const subtractedEpisodeNumber = episode(source.subtractedEpisodeNumber);
    const id = [
      route.toLocaleLowerCase("en"),
      airType.toLocaleLowerCase("en"),
      episodeDate ?? delayedUntil ?? "tbd",
      subtractedEpisodeNumber ?? "",
      episodeNumber ?? "",
    ].join(":");

    const imageVersionRoute = text(source.imageVersionRoute, 128);
    items.push({
      id,
      title,
      route,
      imageVersionRoute: imageVersionRoute && imageRoutePattern.test(imageVersionRoute) ? imageVersionRoute : null,
      episodeDate,
      delayedUntil,
      delayedText: text(source.delayedText, 120),
      episodeNumber,
      subtractedEpisodeNumber,
      status: text(source.status, 32),
      airingStatus: text(source.airingStatus, 32),
      airType,
    });
  }

  return [...new Map(items.map((item) => [item.id, item])).values()];
}

export function isAirType(value: string | null): value is AirType {
  return airTypes.some((type) => type === value);
}

function isoWeekForCalendarDate(year: number, month: number, day: number): ScheduleWeek {
  const utcDate = new Date(Date.UTC(year, month, day));
  const weekday = utcDate.getUTCDay() || 7;
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - weekday);
  const weekYear = utcDate.getUTCFullYear();
  const jan4 = new Date(Date.UTC(weekYear, 0, 4));
  const firstWeekday = jan4.getUTCDay() || 7;
  jan4.setUTCDate(jan4.getUTCDate() + 4 - firstWeekday);
  return { year: weekYear, week: 1 + Math.round((utcDate.getTime() - jan4.getTime()) / 604_800_000) };
}

export function isoWeeksInYear(year: number): number {
  return isoWeekForCalendarDate(year, 11, 28).week;
}

export function isScheduleWeek(value: ScheduleWeek): boolean {
  return Number.isInteger(value.year) && value.year >= 2000 && value.year <= 2100
    && Number.isInteger(value.week) && value.week >= 1 && value.week <= isoWeeksInYear(value.year);
}

/** Interpret date by its user's local calendar fields, not its UTC date. */
export function getIsoWeek(date: Date): ScheduleWeek {
  return isoWeekForCalendarDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Return the seven dates for the requested ISO week as local calendar dates. */
export function isoWeekDates({ year, week }: ScheduleWeek): Date[] {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const mondayOffset = (jan4.getUTCDay() + 6) % 7;
  const firstMonday = new Date(Date.UTC(year, 0, 4 - mondayOffset));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstMonday);
    date.setUTCDate(firstMonday.getUTCDate() + (week - 1) * 7 + index);
    return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  });
}

export function shiftIsoWeek(week: ScheduleWeek, amount: number): ScheduleWeek {
  const monday = isoWeekDates(week)[0];
  monday.setDate(monday.getDate() + amount * 7);
  return getIsoWeek(monday);
}

export function calendarDateInTimeZone(date: Date, timeZone: string): Date {
  const parts = new Intl.DateTimeFormat("en", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  return new Date(part("year"), part("month") - 1, part("day"));
}

export function getDateKey(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function displayTime(isoDate: string, timeZone: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(isoDate));
}

export function getEffectiveDate(item: ScheduleAnime): string | null {
  if (item.status?.toLowerCase() === "delayed") return item.delayedUntil;
  return item.episodeDate;
}

export function isDelayed(item: ScheduleAnime): boolean {
  return item.status?.toLowerCase() === "delayed";
}
