import type { Anime, LibraryEntry } from "@sabame/domain/tracker";

import type {
  MalChanges,
  MalLibraryItem,
  MalLibraryResponse,
  MalListStatus,
  MalMutationResponse,
  MalOperation,
  MalSessionResponse,
  MalUser,
} from "./types";

function invalidResponse(): never {
  throw new Error("The MAL service returned an unreadable response.");
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return invalidResponse();
  return value as Record<string, unknown>;
}

function string(value: unknown, min = 0, max = Infinity): string {
  if (typeof value !== "string" || value.length < min || value.length > max) return invalidResponse();
  return value;
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") return invalidResponse();
  return value;
}

function number(value: unknown, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) return invalidResponse();
  return value;
}

function integer(value: unknown, min: number, max: number): number {
  const result = number(value, min, max);
  if (!Number.isSafeInteger(result)) return invalidResponse();
  return result;
}

function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) return invalidResponse();
  return result;
}

function oneOf<T extends string>(value: unknown, values: readonly T[]): T {
  const result = values.find(candidate => candidate === value);
  if (result === undefined) return invalidResponse();
  return result;
}

function array<T>(value: unknown, parse: (value: unknown) => T): T[] {
  if (!Array.isArray(value)) return invalidResponse();
  return value.map(parse);
}

function animeId(value: unknown): string {
  const result = string(value);
  if (!/^mal-[1-9]\d{0,7}$/.test(result)) return invalidResponse();
  return result;
}

function image(value: unknown): string {
  const result = string(value);
  if (!result.startsWith("https://cdn.myanimelist.net/")) return invalidResponse();
  return result;
}

const libraryStatuses = ["watching", "planned", "completed", "on_hold", "dropped"] as const;
const malStatuses = ["watching", "plan_to_watch", "completed", "on_hold", "dropped"] as const;

function user(value: unknown): MalUser {
  const item = object(value);
  return {
    id: integer(item.id, 1, Number.MAX_SAFE_INTEGER),
    name: string(item.name, 1, 100),
    ...(item.picture !== undefined ? { picture: image(item.picture) } : {}),
  };
}

function remote(value: unknown): MalListStatus {
  const item = object(value);
  return {
    status: oneOf(item.status, malStatuses),
    num_episodes_watched: integer(item.num_episodes_watched, 0, 10_000),
    score: integer(item.score, 0, 10),
    is_rewatching: boolean(item.is_rewatching),
    updated_at: date(item.updated_at),
  };
}

function anime(value: unknown): Anime {
  const item = object(value);
  const genres = array(item.genres, value => string(value));
  if (genres.length > 50) return invalidResponse();
  return {
    id: animeId(item.id),
    title: string(item.title, 1, 300),
    subtitle: string(item.subtitle, 0, 300),
    synopsis: string(item.synopsis, 0, 10_000),
    genres,
    totalEpisodes: item.totalEpisodes === null ? null : integer(item.totalEpisodes, 1, 10_000),
    episodeMinutes: integer(item.episodeMinutes, 0, 1_440),
    accent: oneOf(item.accent, ["violet", "cyan", "rose", "amber", "indigo", "emerald"]),
    ...(item.coverUrl !== undefined ? { coverUrl: image(item.coverUrl) } : {}),
    ...(item.heroUrl !== undefined ? { heroUrl: image(item.heroUrl) } : {}),
    ...(item.score !== undefined ? { score: string(item.score) } : {}),
  };
}

function entry(value: unknown): LibraryEntry {
  const item = object(value);
  return {
    animeId: animeId(item.animeId),
    status: oneOf(item.status, libraryStatuses),
    watchedEpisodes: integer(item.watchedEpisodes, 0, 10_000),
    currentEpisode: integer(item.currentEpisode, 1, 10_000),
    playbackSeconds: number(item.playbackSeconds, 0, 86_400),
    updatedAt: date(item.updatedAt),
    ...(item.playbackDurationSeconds !== undefined
      ? { playbackDurationSeconds: number(item.playbackDurationSeconds, Number.MIN_VALUE, 86_400) } : {}),
    ...(item.personalScore !== undefined ? { personalScore: integer(item.personalScore, 0, 10) } : {}),
    ...(item.isRewatching !== undefined ? { isRewatching: boolean(item.isRewatching) } : {}),
  };
}

function libraryItem(value: unknown): MalLibraryItem {
  const item = object(value);
  const parsed = { anime: anime(item.anime), entry: entry(item.entry), remote: remote(item.remote) };
  if (parsed.anime.id !== parsed.entry.animeId) return invalidResponse();
  return parsed;
}

function changes(value: unknown): MalChanges {
  const item = object(value);
  if (item.watchedEpisodes === undefined && item.status === undefined) return invalidResponse();
  return {
    ...(item.watchedEpisodes !== undefined ? { watchedEpisodes: integer(item.watchedEpisodes, 0, 10_000) } : {}),
    ...(item.status !== undefined ? { status: oneOf(item.status, libraryStatuses) } : {}),
  };
}

function operation(value: unknown): MalOperation {
  const item = object(value);
  const id = string(item.id, 1, 100);
  if (!/^[\w-]+$/.test(id)) return invalidResponse();
  return {
    id,
    animeId: animeId(item.animeId),
    changes: changes(item.changes),
    base: item.base === null ? null : remote(item.base),
    state: oneOf(item.state, ["pending", "conflict", "failed", "synced"]),
    ...(item.remote !== undefined ? { remote: item.remote === null ? null : remote(item.remote) } : {}),
    ...(item.error !== undefined ? { error: string(item.error) } : {}),
    ...(item.submitted !== undefined ? { submitted: boolean(item.submitted) } : {}),
  };
}

export function parseMalSessionResponse(value: unknown): MalSessionResponse {
  const body = object(value);
  return { configured: boolean(body.configured), user: body.user === null ? null : user(body.user) };
}

export function parseMalLibraryResponse(value: unknown): MalLibraryResponse {
  const body = object(value);
  return {
    user: user(body.user),
    items: array(body.items, libraryItem),
    operations: array(body.operations, operation),
    imported: boolean(body.imported),
    lastSyncedAt: body.lastSyncedAt === null ? null : date(body.lastSyncedAt),
    ...(body.nextCursor !== undefined ? { nextCursor: string(body.nextCursor, 1, 1024) } : {}),
  };
}

function sameRemote(left: MalListStatus | null, right: MalListStatus | null): boolean {
  if (left === null || right === null) return left === right;
  return left.status === right.status && left.num_episodes_watched === right.num_episodes_watched
    && left.score === right.score && left.is_rewatching === right.is_rewatching && left.updated_at === right.updated_at;
}

export function parseMalMutationResponse(value: unknown, submitted: MalOperation): MalMutationResponse {
  const body = object(value);
  const receipt = operation(body.operation);
  const item = body.item !== undefined ? libraryItem(body.item) : undefined;
  const removed = body.removed !== undefined ? boolean(body.removed) : undefined;
  if (receipt.state === "synced") {
    if (item ? removed === true : removed !== true) return invalidResponse();
  } else if (item || removed === true) return invalidResponse();
  if (receipt.id !== submitted.id || receipt.animeId !== submitted.animeId
    || receipt.changes.watchedEpisodes !== submitted.changes.watchedEpisodes
    || receipt.changes.status !== submitted.changes.status || !sameRemote(receipt.base, submitted.base)
    || item && item.anime.id !== submitted.animeId) return invalidResponse();
  return {
    operation: receipt,
    ...(item ? { item } : {}),
    ...(removed !== undefined ? { removed } : {}),
  };
}
