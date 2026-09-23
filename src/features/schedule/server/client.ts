import "server-only";

import { isScheduleWeek, normalizeSchedulePayload, type AirType, type ScheduleAnime, type ScheduleWeek } from "../model";

export class ScheduleServiceError extends Error {
  constructor(public readonly code: "not_configured" | "upstream_unavailable" | "invalid_payload" | "timeout") {
    super(code);
  }
}

interface CachedSchedule {
  expiresAt: number;
  items: ScheduleAnime[];
}

const CACHE_TTL_MS = 5 * 60_000;
const CACHE_LIMIT = 24;
const RESPONSE_LIMIT_BYTES = 2_000_000;
const timetableResourcePattern = /^timetables\/(all|raw|sub|dub)$/;
const cache = new Map<string, CachedSchedule>();
const inFlight = new Map<string, Promise<ScheduleAnime[]>>();

export function isTimeZone(value: string): boolean {
  if (!value || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const advertisedLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(advertisedLength) && advertisedLength > RESPONSE_LIMIT_BYTES) {
    throw new ScheduleServiceError("invalid_payload");
  }
  if (!response.body) throw new ScheduleServiceError("invalid_payload");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > RESPONSE_LIMIT_BYTES) {
        await reader.cancel();
        throw new ScheduleServiceError("invalid_payload");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new ScheduleServiceError("invalid_payload");
  }
}

export async function requestAnimeSchedule(
  resource: "anime" | "timetables/all" | "timetables/raw" | "timetables/sub" | "timetables/dub",
  params: URLSearchParams,
  signal?: AbortSignal,
): Promise<unknown> {
  if (resource !== "anime" && !timetableResourcePattern.test(resource)) {
    throw new ScheduleServiceError("invalid_payload");
  }
  const token = process.env.ANIMESCHEDULE_API_TOKEN?.trim();
  if (!token) throw new ScheduleServiceError("not_configured");

  const requestSignal = signal ?? AbortSignal.timeout(8_000);
  let response: Response;
  try {
    response = await fetch("https://animeschedule.net/api/v3/" + resource + "?" + params, {
      headers: { Accept: "application/json", Authorization: "Bearer " + token },
      cache: "no-store",
      redirect: "error",
      signal: requestSignal,
    });
  } catch (error) {
    const reason = requestSignal.aborted ? requestSignal.reason : error;
    if (reason instanceof Error && reason.name === "TimeoutError") throw new ScheduleServiceError("timeout");
    throw new ScheduleServiceError("upstream_unavailable");
  }
  if (!response.ok) throw new ScheduleServiceError("upstream_unavailable");
  return readBoundedJson(response);
}

async function requestSchedule(week: ScheduleWeek, timeZone: string, airType: AirType): Promise<ScheduleAnime[]> {
  if (!isScheduleWeek(week) || !isTimeZone(timeZone)) throw new ScheduleServiceError("invalid_payload");

  const query = new URLSearchParams({ year: String(week.year), week: String(week.week), tz: timeZone });
  try {
    const resourceByAirType = { all: "timetables/all", raw: "timetables/raw", sub: "timetables/sub", dub: "timetables/dub" } as const;
    return normalizeSchedulePayload(await requestAnimeSchedule(resourceByAirType[airType], query));
  } catch (error) {
    if (error instanceof ScheduleServiceError) throw error;
    throw new ScheduleServiceError("invalid_payload");
  }
}

export async function fetchSchedule(
  week: ScheduleWeek,
  timeZone: string,
  airType: AirType,
): Promise<ScheduleAnime[]> {
  if (!isScheduleWeek(week) || !isTimeZone(timeZone)) throw new ScheduleServiceError("invalid_payload");

  const key = String(week.year) + "-" + week.week + ":" + timeZone + ":" + airType;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.items;
  if (cached) cache.delete(key);

  const existing = inFlight.get(key);
  if (existing) return existing;

  const pending = requestSchedule(week, timeZone, airType)
    .then((items) => {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
      cache.set(key, { items, expiresAt: Date.now() + CACHE_TTL_MS });
      return items;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, pending);
  return pending;
}