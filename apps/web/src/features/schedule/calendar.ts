import { getDateKey, getEffectiveDate, type ScheduleAnime } from "./model";

export interface CalendarGroup {
  id: string;
  dateKey: string;
  minuteOfDay: number;
  items: [ScheduleAnime, ...ScheduleAnime[]];
}

export function buildCalendarGroups(items: readonly ScheduleAnime[], timeZone: string, dateKeys: readonly string[]): CalendarGroup[] {
  const days = new Set(dateKeys);
  const formatter = new Intl.DateTimeFormat("en", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const groups = new Map<string, CalendarGroup>();
  for (const anime of items) {
    const effectiveDate = getEffectiveDate(anime);
    if (!effectiveDate) continue;
    const date = new Date(effectiveDate);
    const dateKey = getDateKey(date, timeZone);
    if (!days.has(dateKey)) continue;
    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    const minute = Number(parts.find((part) => part.type === "minute")?.value);
    const minuteOfDay = hour * 60 + minute;
    const id = `${dateKey}:${minuteOfDay}`;
    const group = groups.get(id);
    if (group) group.items.push(anime);
    else groups.set(id, { id, dateKey, minuteOfDay, items: [anime] });
  }
  return [...groups.values()].sort((a, b) => a.minuteOfDay - b.minuteOfDay || a.dateKey.localeCompare(b.dateKey));
}

export function calendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function minuteLabel(minuteOfDay: number): string {
  return `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
}

export function carouselIndices(count: number, start: number): number[] {
  const windowStart = Math.max(0, Math.min(start, Math.max(0, count - 3)));
  return Array.from({ length: Math.min(3, count) }, (_, index) => windowStart + index);
}
