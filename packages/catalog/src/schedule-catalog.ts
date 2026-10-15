
import type { SeasonSelection } from "@sabame/domain/seasonal";
import { requestAnimeSchedule, ScheduleServiceError } from "./schedule.js";

interface AnimeScheduleAnime {
  route: string;
  websites: { mal: string };
}

interface AnimeSchedulePage {
  page: number;
  totalAmount: number;
  recordCount: number;
  anime: AnimeScheduleAnime[];
}

type AnimeScheduleFilter =
  | { kind: "season"; selection: SeasonSelection }
  | { kind: "ongoing" };

interface CachedRoutes {
  expiresAt: number;
  routesByMalId: ReadonlyMap<number, readonly string[]>;
}

const CACHE_TTL_MS = 15 * 60_000;
const CACHE_LIMIT = 8;
const MAX_CATALOG_ANIME = 1_000;
const MAX_PAGE_SIZE = 100;
const MAX_CATALOG_PAGES = 64;
const CATALOG_DEADLINE_MS = 20_000;
const PAGE_CONCURRENCY = 2;
const routePattern = /^[a-z\d][a-z\d_-]{0,511}$/i;
const cache = new Map<string, CachedRoutes>();
const inFlight = new Map<string, Promise<ReadonlyMap<number, readonly string[]>>>();

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parsePage(value: unknown, expectedPage: number): AnimeSchedulePage {
  const source = record(value);
  if (!source || source.page !== expectedPage
    || !Number.isSafeInteger(source.totalAmount) || (source.totalAmount as number) < 0
    || (source.totalAmount as number) > MAX_CATALOG_ANIME
    || !Array.isArray(source.anime) || source.anime.length > MAX_PAGE_SIZE) {
    throw new ScheduleServiceError("invalid_payload");
  }

  return {
    page: source.page as number,
    totalAmount: source.totalAmount as number,
    recordCount: source.anime.length,
    anime: source.anime.flatMap((entry) => {
      const anime = record(entry);
      const websites = record(anime?.websites);
      return typeof anime?.route === "string" && routePattern.test(anime.route)
        && typeof websites?.mal === "string"
        ? [{ route: anime.route, websites: { mal: websites.mal } }]
        : [];
    }),
  };
}

function malIdFromWebsite(value: string): number | null {
  try {
    const url = new URL(
      /^(?:www\.)?myanimelist\.net\//i.test(value)
        ? `https://${value}`
        : value,
    );
    if (url.protocol !== "https:" || !["myanimelist.net", "www.myanimelist.net"].includes(url.hostname)) return null;
    const match = /^\/anime\/([1-9]\d{0,7})(?:\/|$)/.exec(url.pathname);
    if (!match) return null;
    const id = Number(match[1]);
    return Number.isSafeInteger(id) ? id : null;
  } catch {
    return null;
  }
}

async function requestPage(filter: AnimeScheduleFilter, page: number, signal: AbortSignal): Promise<AnimeSchedulePage> {
  const params = new URLSearchParams();
  if (filter.kind === "season") {
    params.set("years", String(filter.selection.year));
    params.set("seasons", filter.selection.season);
  } else {
    params.set("airing-statuses", "ongoing");
  }
  params.set("page", String(page));
  const payload = await requestAnimeSchedule("anime", params, signal);
  return parsePage(payload, page);
}

async function loadPages(filter: AnimeScheduleFilter, deadline: AbortSignal): Promise<AnimeSchedulePage[]> {
  const first = await requestPage(filter, 1, deadline);
  if (first.totalAmount === 0) {
    if (first.recordCount !== 0) throw new ScheduleServiceError("invalid_payload");
    return [];
  }
  if (first.recordCount === 0 || first.recordCount > first.totalAmount) {
    throw new ScheduleServiceError("invalid_payload");
  }

  const pageCount = Math.ceil(first.totalAmount / first.recordCount);
  if (pageCount > MAX_CATALOG_PAGES) throw new ScheduleServiceError("invalid_payload");
  const pages = [first];
  for (let start = 2; start <= pageCount; start += PAGE_CONCURRENCY) {
    const end = Math.min(pageCount, start + PAGE_CONCURRENCY - 1);
    const batch = await Promise.allSettled(
      Array.from({ length: end - start + 1 }, (_, index) => requestPage(filter, start + index, deadline)),
    );
    for (const result of batch) {
      if (result.status === "rejected") throw result.reason;
      pages.push(result.value);
    }
  }
  if (pages.some((page, index) => page.page !== index + 1 || page.totalAmount !== first.totalAmount)
    || pages.reduce((total, page) => total + page.recordCount, 0) !== first.totalAmount) {
    throw new ScheduleServiceError("invalid_payload");
  }
  return pages;
}

async function loadRoutes(selection: SeasonSelection): Promise<ReadonlyMap<number, readonly string[]>> {
  const deadline = AbortSignal.timeout(CATALOG_DEADLINE_MS);
  const [seasonResult, ongoingResult] = await Promise.allSettled([
    loadPages({ kind: "season", selection }, deadline),
    loadPages({ kind: "ongoing" }, deadline),
  ]);
  if (seasonResult.status === "rejected") throw seasonResult.reason;
  if (ongoingResult.status === "rejected") throw ongoingResult.reason;

  const routesByMalId = new Map<number, Set<string>>();
  for (const page of [...seasonResult.value, ...ongoingResult.value]) {
    for (const anime of page.anime) {
      const malId = malIdFromWebsite(anime.websites.mal);
      if (malId === null) continue;
      const routes = routesByMalId.get(malId) ?? new Set<string>();
      routes.add(anime.route.toLocaleLowerCase("en"));
      routesByMalId.set(malId, routes);
    }
  }
  return new Map([...routesByMalId].map(([malId, routes]) => [malId, [...routes]]));
}

export async function fetchScheduleRoutes(selection: SeasonSelection): Promise<ReadonlyMap<number, readonly string[]>> {
  const key = String(selection.year) + ":" + selection.season;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.routesByMalId;
  if (cached) cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = loadRoutes(selection)
    .then((routesByMalId) => {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { routesByMalId, expiresAt: Date.now() + CACHE_TTL_MS });
      return routesByMalId;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}
