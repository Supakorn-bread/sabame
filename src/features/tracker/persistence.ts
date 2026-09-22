import type { MalListStatus, MalOperation } from "@/features/mal/types";

import type { Anime, DemoSession, LibraryEntry, LibraryStatus } from "./types";

const LIBRARY_STATUSES = new Set<LibraryStatus>([
  "watching", "planned", "completed", "on_hold", "dropped",
]);
const MAL_STATUSES = new Set<MalListStatus["status"]>([
  "watching", "completed", "on_hold", "dropped", "plan_to_watch",
]);
const OPERATION_STATES = new Set<MalOperation["state"]>(["pending", "conflict", "failed", "synced"]);

export interface PersistedMalAccount {
  library: Record<string, LibraryEntry>;
  catalog: Record<string, Anime>;
  operations: MalOperation[];
  remote: Record<string, MalListStatus | null>;
  imported: boolean;
  lastSyncedAt?: string;
}

export interface RestoredTracker {
  session: DemoSession | null;
  library: Record<string, LibraryEntry>;
  catalog: Record<string, Anime>;
  demoLibrary: Record<string, LibraryEntry>;
  demoCatalog: Record<string, Anime>;
  malAccounts: Record<string, PersistedMalAccount>;
}

function finiteDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function savedRemote(value: unknown): MalListStatus | null | undefined {
  if (value === null) return null;
  if (!value || typeof value !== "object") return;
  const item = value as MalListStatus;
  if (!MAL_STATUSES.has(item.status) ||
    !Number.isSafeInteger(item.num_episodes_watched) || item.num_episodes_watched < 0 ||
    !Number.isSafeInteger(item.score) || item.score < 0 || item.score > 10 ||
    typeof item.is_rewatching !== "boolean" || !finiteDate(item.updated_at)) return;
  return { status: item.status, num_episodes_watched: item.num_episodes_watched, score: item.score, is_rewatching: item.is_rewatching, updated_at: item.updated_at };
}

export function savedAnime(value: unknown): Anime | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as Anime;
  if (!/^mal-[1-9]\d*$/.test(item.id) || typeof item.title !== "string" || item.title.length > 300 ||
    !(item.totalEpisodes === null || Number.isSafeInteger(item.totalEpisodes) && item.totalEpisodes > 0 && item.totalEpisodes <= 10_000)) return;

  return {
    id: item.id,
    title: item.title,
    subtitle: typeof item.subtitle === "string" ? item.subtitle.slice(0, 300) : "",
    synopsis: typeof item.synopsis === "string" ? item.synopsis.slice(0, 10_000) : "",
    genres: Array.isArray(item.genres) ? item.genres.filter((genre): genre is string => typeof genre === "string").slice(0, 50) : [],
    totalEpisodes: item.totalEpisodes,
    episodeMinutes: Number.isFinite(item.episodeMinutes) && item.episodeMinutes > 0 ? Math.min(item.episodeMinutes, 1_440) : 0,
    accent: "violet",
    coverUrl: typeof item.coverUrl === "string" && item.coverUrl.startsWith("https://cdn.myanimelist.net/") ? item.coverUrl : undefined,
    heroUrl: typeof item.heroUrl === "string" && item.heroUrl.startsWith("https://cdn.myanimelist.net/") ? item.heroUrl : undefined,
    score: typeof item.score === "string" ? item.score.slice(0, 10) : undefined,
  };
}

function restoreCatalog(value: unknown) {
  const catalog: Record<string, Anime> = {};
  if (!value || typeof value !== "object") return catalog;
  for (const candidate of Object.values(value)) {
    const anime = savedAnime(candidate);
    if (anime) catalog[anime.id] = anime;
  }
  return catalog;
}

function savedEntry(id: string, value: unknown): LibraryEntry | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as LibraryEntry;
  if (item.animeId !== id || !LIBRARY_STATUSES.has(item.status) ||
    !Number.isSafeInteger(item.currentEpisode) || item.currentEpisode < 1 || item.currentEpisode > 10_000 ||
    !Number.isSafeInteger(item.watchedEpisodes) || item.watchedEpisodes < 0 || item.watchedEpisodes > 10_000 ||
    !Number.isFinite(item.playbackSeconds) || item.playbackSeconds < 0 || item.playbackSeconds > 86_400 ||
    !finiteDate(item.updatedAt)) return;

  return {
    animeId: id,
    status: item.status,
    watchedEpisodes: item.watchedEpisodes,
    currentEpisode: item.currentEpisode,
    playbackSeconds: item.playbackSeconds,
    updatedAt: item.updatedAt,
    ...(Number.isFinite(item.playbackDurationSeconds) && item.playbackDurationSeconds! > 0 && item.playbackDurationSeconds! <= 86_400
      ? { playbackDurationSeconds: item.playbackDurationSeconds } : {}),
    ...(Number.isSafeInteger(item.personalScore) && item.personalScore! >= 0 && item.personalScore! <= 10
      ? { personalScore: item.personalScore } : {}),
    ...(typeof item.isRewatching === "boolean" ? { isRewatching: item.isRewatching } : {}),
  };
}

function restoreLibrary(value: unknown) {
  const library: Record<string, LibraryEntry> = {};
  if (!value || typeof value !== "object") return library;
  for (const [id, candidate] of Object.entries(value)) {
    const entry = savedEntry(id, candidate);
    if (entry) library[id] = entry;
  }
  return library;
}

function savedOperation(value: unknown): MalOperation | undefined {
  if (!value || typeof value !== "object") return;
  const item = value as MalOperation;
  const base = savedRemote(item.base);
  const hasRemote = item.remote !== undefined;
  const remote = hasRemote ? savedRemote(item.remote) : undefined;
  const status = item.changes?.status;
  const watched = item.changes?.watchedEpisodes;
  if (typeof item.id !== "string" || item.id.length < 1 || item.id.length > 200 ||
    !/^mal-[1-9]\d*$/.test(item.animeId) || !OPERATION_STATES.has(item.state) ||
    base === undefined || hasRemote && remote === undefined ||
    (status === undefined && watched === undefined) ||
    (status !== undefined && !LIBRARY_STATUSES.has(status)) ||
    (watched !== undefined && (!Number.isSafeInteger(watched) || watched < 0 || watched > 10_000))) return;

  return {
    id: item.id,
    animeId: item.animeId,
    changes: {
      ...(watched !== undefined ? { watchedEpisodes: watched } : {}),
      ...(status !== undefined ? { status } : {}),
    },
    base,
    state: item.state,
    ...(item.submitted === true ? { submitted: true } : {}),
    ...(remote !== undefined ? { remote } : {}),
    ...(typeof item.error === "string" ? { error: item.error.slice(0, 500) } : {}),
  };
}

function restoreMalAccounts(value: unknown) {
  const accounts: Record<string, PersistedMalAccount> = {};
  if (!value || typeof value !== "object") return accounts;
  for (const [key, candidate] of Object.entries(value)) {
    if (!/^[1-9]\d*$/.test(key) || !candidate || typeof candidate !== "object") continue;
    const account = candidate as Partial<PersistedMalAccount>;
    const remote: Record<string, MalListStatus | null> = {};
    if (account.remote && typeof account.remote === "object") {
      for (const [animeId, baseline] of Object.entries(account.remote)) {
        if (!/^mal-[1-9]\d*$/.test(animeId)) continue;
        const saved = savedRemote(baseline);
        if (saved !== undefined) remote[animeId] = saved;
      }
    }
    accounts[key] = {
      library: restoreLibrary(account.library),
      catalog: restoreCatalog(account.catalog),
      operations: Array.isArray(account.operations) ? account.operations.flatMap((operation) => {
        const saved = savedOperation(operation);
        return saved ? [saved] : [];
      }) : [],
      remote,
      imported: account.imported === true,
      ...(finiteDate(account.lastSyncedAt) ? { lastSyncedAt: account.lastSyncedAt } : {}),
    };
  }
  return accounts;
}

export function restoreTracker(value: unknown): RestoredTracker {
  const state = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const legacyLibrary = restoreLibrary(state.library);
  const legacyCatalog = restoreCatalog(state.catalog);
  const demoLibrary = state.demoLibrary === undefined ? legacyLibrary : restoreLibrary(state.demoLibrary);
  const demoCatalog = state.demoCatalog === undefined ? legacyCatalog : restoreCatalog(state.demoCatalog);
  const candidate = state.session as DemoSession | null;
  // Browser state can restore a demo login, but never proves a MAL session.
  const session = candidate && candidate.malUserId === undefined && typeof candidate.email === "string" &&
    typeof candidate.displayName === "string" && finiteDate(candidate.loginAt)
    ? { email: candidate.email.slice(0, 320), displayName: candidate.displayName.slice(0, 100), loginAt: candidate.loginAt }
    : null;

  return {
    session,
    library: demoLibrary,
    catalog: demoCatalog,
    demoLibrary,
    demoCatalog,
    malAccounts: restoreMalAccounts(state.malAccounts),
  };
}
