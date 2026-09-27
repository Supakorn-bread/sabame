import type { Anime } from "./tracker.js";

export const seasons = [
  { value: "winter", label: "Winter", months: "Jan – Mar" },
  { value: "spring", label: "Spring", months: "Apr – Jun" },
  { value: "summer", label: "Summer", months: "Jul – Sep" },
  { value: "fall", label: "Fall", months: "Oct – Dec" },
] as const;
export type Season = (typeof seasons)[number]["value"];
export interface SeasonSelection { year: number; season: Season }
export interface SeasonalAnime extends Anime {
  format: string;
  studios: string[];
  startDate?: string;
  members: number;
  continuing: boolean;
}
export interface SeasonalResult { items: SeasonalAnime[]; nextPage: number | null }
export const firstSeasonYear = 1917;

export function currentSeason(date = new Date()): SeasonSelection {
  return { year: date.getUTCFullYear(), season: seasons[Math.floor(date.getUTCMonth() / 3)].value };
}
export function isSeason(value: unknown): value is Season {
  return seasons.some((season) => season.value === value);
}
export function validSeasonYear(value: number, currentYear: number) {
  return Number.isInteger(value) && value >= firstSeasonYear && value <= currentYear + 1;
}
export function seasonSelection(params: Pick<URLSearchParams, "get">, current: SeasonSelection): SeasonSelection {
  const year = Number(params.get("year"));
  const season = params.get("season");
  return { year: validSeasonYear(year, current.year) ? year : current.year, season: isSeason(season) ? season : current.season };
}
export function seasonLabel({ season, year }: SeasonSelection) {
  return `${seasons.find((item) => item.value === season)!.label} ${year}`;
}
export function seasonHref(selection: SeasonSelection) {
  return `/seasonal?${new URLSearchParams({ year: String(selection.year), season: selection.season })}`;
}
