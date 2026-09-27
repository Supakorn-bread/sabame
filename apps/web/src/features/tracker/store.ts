"use client";

import { useStore } from "zustand";
import { createStore, type StoreApi } from "zustand/vanilla";
import { persist, type PersistStorage, type StateStorage, type StorageValue } from "zustand/middleware";

import type {
  MalLibraryResponse,
  MalListStatus,
  MalOperation,
  MalUser,
} from "@/features/mal/types";
import {
  completeEpisode,
  selectEpisode as selectEpisodeModel,
  setLibraryStatus,
  setPlaybackPosition as setPlaybackPositionModel,
  setWatchedEpisodes as setWatchedEpisodesModel,
  validateDemoCredentials,
} from "./model";
import { restoreTracker, savedAnime, type PersistedMalAccount } from "./persistence";
import { createSeedLibrary, getAnimeById } from "./seed";
import type { Anime, CredentialErrors, DemoSession, LibraryEntry, LibraryStatus } from "./types";

export const TRACKER_STORAGE_KEY = "sabame:v1";
export const TRACKER_STORAGE_VERSION = 3;

const MAL_ANIME_ID = /^mal-[1-9]\d*$/;

export type MalSyncStatus = "idle" | "syncing" | "synced" | "error" | "reconnect";

export interface MalSyncState {
  status: MalSyncStatus;
  error?: string;
  lastSyncedAt?: string;
  operations: MalOperation[];
  conflicts: MalOperation[];
  remote: Record<string, MalListStatus | null>;
}

interface PersistedTrackerState {
  session: DemoSession | null;
  demoLibrary: Record<string, LibraryEntry>;
  demoCatalog: Record<string, Anime>;
  malAccounts: Record<string, PersistedMalAccount>;
}

export interface TrackerStore extends PersistedTrackerState {
  library: Record<string, LibraryEntry>;
  catalog: Record<string, Anime>;
  malUser: MalUser | null;
  malConfigured: boolean;
  authReady: boolean;
  malSync: MalSyncState;
  hasHydrated: boolean;
  storageWarning: boolean;
  malSessionVersion: number;
  malRevision: number;
  malRevisionByAnime: Record<string, number>;
  finishHydration: (storageWarning?: boolean) => void;
  beginMalBootstrap: () => number;
  activateMalAccount: (version: number, configured: boolean, user: MalUser | null) => boolean;
  finishMalBootstrap: (version: number) => void;
  clearMalAccount: (configured?: boolean) => void;
  applyMalLibrary: (version: number, response: MalLibraryResponse, expectedRevision?: number) => boolean;
  setMalSync: (status: MalSyncStatus, error?: string, lastSyncedAt?: string) => void;
  rebasePendingMalOperation: (userId: number, operationId: string) => MalOperation | undefined;
  applyMalOperation: (userId: number, operationId: string, operation: MalOperation, item?: MalLibraryResponse["items"][number], removed?: boolean, discardOperationIds?: string[]) => boolean;
  markFailedMalOperation: (userId: number, operationId: string, message: string, reconnect?: boolean) => void;
  retryFailedMalOperations: () => void;
  login: (email: string, password: string) => { success: true } | { success: false; errors: CredentialErrors };
  logout: () => void;
  ensureEntry: (animeId: string) => void;
  setStatus: (animeId: string, status: LibraryStatus) => void;
  setWatchedEpisodes: (animeId: string, episodes: number) => void;
  registerAnime: (anime: Anime) => void;
  setPlaybackPosition: (animeId: string, seconds: number, durationSeconds?: number, expectedEpisode?: number) => void;
  selectEpisode: (animeId: string, episode: number) => void;
  markEpisodeComplete: (animeId: string, expectedEpisode?: number) => void;
  resetDemo: () => void;
}

interface CreateTrackerStoreOptions {
  storage?: StateStorage;
  now?: () => string;
  createOperationId?: () => string;
  onMalOperation?: () => void;
}

let malOperationListener: (() => void) | undefined;

export function setMalOperationListener(listener?: () => void) {
  malOperationListener = listener;
}

const browserStorage: StateStorage = {
  getItem(name) {
    return typeof window === "undefined" ? null : window.localStorage.getItem(name);
  },
  setItem(name, value) {
    if (typeof window !== "undefined") window.localStorage.setItem(name, value);
  },
  removeItem(name) {
    if (typeof window !== "undefined") window.localStorage.removeItem(name);
  },
};

function createSafeJsonStorage(storage: StateStorage, onStorageError: () => void): PersistStorage<PersistedTrackerState> {
  const parse = (value: string | null): StorageValue<PersistedTrackerState> | null => {
    if (value === null) return null;
    try {
      return JSON.parse(value) as StorageValue<PersistedTrackerState>;
    } catch {
      onStorageError();
      return null;
    }
  };
  return {
    getItem(name) {
      try {
        const value = storage.getItem(name);
        return value instanceof Promise ? value.then(parse).catch(() => (onStorageError(), null)) : parse(value);
      } catch {
        onStorageError();
        return null;
      }
    },
    setItem(name, value) {
      try {
        return storage.setItem(name, JSON.stringify(value));
      } catch {
        onStorageError();
      }
    },
    removeItem(name) {
      try {
        return storage.removeItem(name);
      } catch {
        onStorageError();
      }
    },
  };
}

function createEntry(animeId: string, updatedAt: string): LibraryEntry {
  return { animeId, status: "planned", watchedEpisodes: 0, currentEpisode: 1, playbackSeconds: 0, updatedAt };
}

function emptyAccount(): PersistedMalAccount {
  return { library: {}, catalog: {}, operations: [], remote: {}, imported: false };
}

function syncState(account?: PersistedMalAccount, status: MalSyncStatus = "idle", error?: string): MalSyncState {
  const operations = account?.operations ?? [];
  return {
    status,
    ...(error ? { error } : {}),
    ...(account?.lastSyncedAt ? { lastSyncedAt: account.lastSyncedAt } : {}),
    operations,
    conflicts: operations.filter((operation) => operation.state === "conflict"),
    remote: account?.remote ?? {},
  };
}

function settledSyncState(account: PersistedMalAccount) {
  const failed = account.operations.find((operation) => operation.state === "failed");
  if (failed) return syncState(account, failed.error === "reconnect_required" ? "reconnect" : "error", failed.error);
  if (account.operations.some((operation) => operation.state === "conflict")) {
    return syncState(account, "error", "A MAL change needs your choice.");
  }
  if (account.operations.some((operation) => operation.state === "pending")) return syncState(account, "syncing");
  return syncState(account, "synced");
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] || "Viewer";
  return localPart.split(/[._-]+/).filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(" ") || "Viewer";
}

function defaultOperationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `op-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withLocalPlayback(remote: LibraryEntry, local?: LibraryEntry): LibraryEntry {
  if (!local) return remote;
  return {
    ...remote,
    currentEpisode: local.currentEpisode,
    playbackSeconds: local.playbackSeconds,
    ...(local.playbackDurationSeconds ? { playbackDurationSeconds: local.playbackDurationSeconds } : {}),
  };
}

function replayOperation(entry: LibraryEntry, operation: MalOperation, totalEpisodes?: number | null): LibraryEntry {
  if (operation.state === "synced") return entry;
  const watchedEpisodes = operation.changes.watchedEpisodes ?? entry.watchedEpisodes;
  return {
    ...entry,
    watchedEpisodes,
    currentEpisode: Math.min(totalEpisodes ?? 10_000, Math.max(entry.currentEpisode, watchedEpisodes + 1)),
    status: operation.changes.status ?? entry.status,
  };
}

export function createTrackerStore(options: CreateTrackerStoreOptions = {}): StoreApi<TrackerStore> & {
  persist: { rehydrate: () => Promise<void> | void; hasHydrated: () => boolean };
} {
  const now = options.now ?? (() => new Date().toISOString());
  const createOperationId = options.createOperationId ?? defaultOperationId;
  let storageWarning = false;
  let reportStorageError = () => { storageWarning = true; };
  const storage = createSafeJsonStorage(options.storage ?? browserStorage, () => reportStorageError());

  const store = createStore<TrackerStore>()(
    persist(
      (set, get) => {
        const findAnime = (id: string) => getAnimeById(id) ?? get().catalog[id];
        const notifyMalOperation = () => queueMicrotask(() => (options.onMalOperation ?? malOperationListener)?.());
        const commitActive = (library: Record<string, LibraryEntry>, catalog = get().catalog) => {
          const state = get();
          if (state.malUser) {
            const key = String(state.malUser.id);
            const account = state.malAccounts[key] ?? emptyAccount();
            set({ library, catalog, malAccounts: { ...state.malAccounts, [key]: { ...account, library, catalog } } });
          } else {
            set({ library, catalog, demoLibrary: library, demoCatalog: catalog });
          }
        };
        const queueMalChange = (animeId: string, changes: MalOperation["changes"]) => {
          const state = get();
          if (!state.malUser || !MAL_ANIME_ID.test(animeId) || Object.keys(changes).length === 0) return;
          const key = String(state.malUser.id);
          const account = state.malAccounts[key] ?? emptyAccount();
          const operation: MalOperation = {
            id: createOperationId(), animeId, changes, base: account.remote[animeId] ?? null, state: "pending",
          };
          const operations = [...account.operations, operation];
          const malRevision = state.malRevision + 1;
          const nextAccount = { ...account, operations };
          set({
            malRevision,
            malRevisionByAnime: { ...state.malRevisionByAnime, [animeId]: malRevision },
            malAccounts: { ...state.malAccounts, [key]: nextAccount },
            malSync: syncState(nextAccount, "syncing"),
          });
          notifyMalOperation();
        };
        const updateEntry = (animeId: string, updater: (entry: LibraryEntry, anime: Anime) => LibraryEntry) => {
          const anime = findAnime(animeId);
          if (!anime) return;
          const state = get();
          const entry = state.library[animeId] ?? createEntry(animeId, now());
          commitActive({ ...state.library, [animeId]: updater(entry, anime) });
        };

        const initialLibrary = createSeedLibrary();
        return {
          session: null,
          demoLibrary: initialLibrary,
          demoCatalog: {},
          malAccounts: {},
          library: initialLibrary,
          catalog: {},
          malUser: null,
          malConfigured: false,
          authReady: false,
          malSync: syncState(),
          hasHydrated: false,
          storageWarning: false,
          malSessionVersion: 0,
          malRevision: 0,
          malRevisionByAnime: {},
          finishHydration: (warning = false) => set({ hasHydrated: true, storageWarning: warning }),
          beginMalBootstrap: () => {
            const version = get().malSessionVersion + 1;
            set({ malSessionVersion: version, authReady: false });
            return version;
          },
          activateMalAccount: (version, configured, user) => {
            if (get().malSessionVersion !== version) return false;
            if (!user) {
              const state = get();
              set({
                malConfigured: configured,
                malUser: null,
                session: state.session?.malUserId ? null : state.session,
                library: state.demoLibrary,
                catalog: state.demoCatalog,
                malSync: syncState(),
                malRevisionByAnime: {},
              });
              return true;
            }
            const state = get();
            const account = state.malAccounts[String(user.id)] ?? emptyAccount();
            set({
              malConfigured: configured,
              malUser: user,
              session: {
                displayName: user.name,
                loginAt: now(),
                malUserId: user.id,
                username: user.name,
                ...(user.picture ? { picture: user.picture } : {}),
              },
              library: account.library,
              catalog: account.catalog,
              malAccounts: { ...state.malAccounts, [String(user.id)]: account },
              malSync: syncState(account, "syncing"),
              malRevisionByAnime: {},
            });
            return true;
          },
          finishMalBootstrap: (version) => {
            if (get().malSessionVersion === version) set({ authReady: true });
          },
          clearMalAccount: (configured = get().malConfigured) => {
            const state = get();
            set({
              malSessionVersion: state.malSessionVersion + 1,
              authReady: true,
              malConfigured: configured,
              malUser: null,
              session: state.session?.malUserId ? null : state.session,
              library: state.demoLibrary,
              catalog: state.demoCatalog,
              malSync: syncState(),
              malRevisionByAnime: {},
            });
          },
          applyMalLibrary: (version, response, expectedRevision) => {
            const state = get();
            if (state.malSessionVersion !== version || state.malUser?.id !== response.user.id ||
              (expectedRevision !== undefined && state.malRevision !== expectedRevision)) return false;
            const key = String(response.user.id);
            const previous = state.malAccounts[key] ?? emptyAccount();
            const library: Record<string, LibraryEntry> = {};
            const catalog: Record<string, Anime> = {};
            const remote: Record<string, MalListStatus | null> = {};
            for (const item of response.items) {
              if (!MAL_ANIME_ID.test(item.anime.id)) continue;
              const anime = savedAnime(item.anime);
              if (!anime) continue;
              catalog[anime.id] = anime;
              library[anime.id] = withLocalPlayback(item.entry, previous.library[anime.id]);
              remote[anime.id] = item.remote;
            }
            const serverIds = new Set(response.operations.map((operation) => operation.id));
            const operations = [
              ...response.operations.map(operation => ({ ...operation, submitted: true })),
              ...previous.operations.filter((operation) => operation.state !== "synced" && !serverIds.has(operation.id)),
            ];
            for (const operation of operations) {
              const entry = library[operation.animeId] ?? previous.library[operation.animeId];
              if (!catalog[operation.animeId] && previous.catalog[operation.animeId]) catalog[operation.animeId] = previous.catalog[operation.animeId];
              if (entry) library[operation.animeId] = replayOperation(entry, operation, catalog[operation.animeId]?.totalEpisodes);
              if (operation.remote !== undefined) remote[operation.animeId] = operation.remote;
            }
            const account: PersistedMalAccount = {
              library, catalog, operations, remote,
              imported: response.imported,
              ...(response.lastSyncedAt ? { lastSyncedAt: response.lastSyncedAt } : {}),
            };
            set({
              library, catalog,
              malUser: response.user,
              session: { ...state.session!, displayName: response.user.name, username: response.user.name,
                ...(response.user.picture ? { picture: response.user.picture } : {}) },
              malAccounts: { ...state.malAccounts, [key]: account },
              malSync: settledSyncState(account),
            });
            return true;
          },
          setMalSync: (status, error, lastSyncedAt) => {
            const state = get();
            if (!state.malUser) return;
            const key = String(state.malUser.id);
            const current = state.malAccounts[key] ?? emptyAccount();
            const account = lastSyncedAt ? { ...current, lastSyncedAt } : current;
            set({
              malAccounts: lastSyncedAt ? { ...state.malAccounts, [key]: account } : state.malAccounts,
              malSync: syncState(account, status, error),
            });
          },
          rebasePendingMalOperation: (userId, operationId) => {
            const state = get();
            if (state.malUser?.id !== userId) return;
            const key = String(userId);
            const account = state.malAccounts[key] ?? emptyAccount();
            const candidate = account.operations.find((operation) => operation.id === operationId);
            if (!candidate || candidate.state !== "pending") return;
            // A newly pulled remote snapshot must never erase the original conflict baseline.
            const rebased = { ...candidate, submitted: true };
            const operations = account.operations.map((operation) => operation.id === operationId ? rebased : operation);
            const nextAccount = { ...account, operations };
            set({
              malAccounts: { ...state.malAccounts, [key]: nextAccount },
              malSync: syncState(nextAccount, "syncing"),
            });
            return rebased;
          },
          applyMalOperation: (userId, operationId, operation, item, removed = false, discardOperationIds = []) => {
            const state = get();
            if (state.malUser?.id !== userId) return false;
            const key = String(userId);
            const account = state.malAccounts[key] ?? emptyAccount();
            const index = account.operations.findIndex((candidate) => candidate.id === operationId);
            if (index < 0) return false;
            const operations = account.operations.map((candidate, candidateIndex) => {
              if (candidateIndex === index) return { ...operation, submitted: true };
              if (candidateIndex > index && candidate.animeId === operation.animeId && !candidate.submitted && operation.state === "synced") {
                return { ...candidate, base: item?.remote ?? null };
              }
              return candidate;
            }).filter(candidate => !(operation.state === "synced" && candidate.animeId === operation.animeId && !candidate.submitted && discardOperationIds.includes(candidate.id)));
            const hasLaterLocalChange = operations.slice(index + 1)
              .some((candidate) => candidate.animeId === operation.animeId && candidate.state !== "synced");
            const library = { ...state.library };
            const catalog = { ...state.catalog };
            const remote = { ...account.remote };
            if (removed && !hasLaterLocalChange) {
              delete library[operation.animeId];
              delete remote[operation.animeId];
            } else if (item) {
              const anime = savedAnime(item.anime);
              if (anime) catalog[anime.id] = anime;
              remote[operation.animeId] = item.remote;
              if (!hasLaterLocalChange) library[operation.animeId] = withLocalPlayback(item.entry, state.library[operation.animeId]);
            } else if (operation.remote !== undefined) {
              remote[operation.animeId] = operation.remote;
            }
            const lastSyncedAt = operation.state === "synced" ? now() : account.lastSyncedAt;
            const nextAccount: PersistedMalAccount = {
              ...account, library, catalog, operations, remote,
              ...(lastSyncedAt ? { lastSyncedAt } : {}),
            };
            set({
              library, catalog,
              malAccounts: { ...state.malAccounts, [key]: nextAccount },
              malSync: settledSyncState(nextAccount),
            });
            return true;
          },
          markFailedMalOperation: (userId, operationId, message, reconnect = false) => {
            const state = get();
            if (state.malUser?.id !== userId) return;
            const key = String(userId);
            const account = state.malAccounts[key] ?? emptyAccount();
            if (!account.operations.some((operation) => operation.id === operationId)) return;
            const operations = account.operations.map((operation) => operation.id === operationId
              ? { ...operation, state: "failed" as const, error: message }
              : operation);
            const nextAccount = { ...account, operations };
            set({
              malAccounts: { ...state.malAccounts, [key]: nextAccount },
              malSync: syncState(nextAccount, reconnect ? "reconnect" : "error", message),
            });
          },
          retryFailedMalOperations: () => {
            const state = get();
            if (!state.malUser) return;
            const key = String(state.malUser.id);
            const account = state.malAccounts[key] ?? emptyAccount();
            const operations = account.operations.map((operation) => operation.state === "failed"
              ? { ...operation, state: "pending" as const, error: undefined }
              : operation);
            const nextAccount = { ...account, operations };
            set({ malAccounts: { ...state.malAccounts, [key]: nextAccount }, malSync: syncState(nextAccount, "syncing") });
          },
          login: (email, password) => {
            const validation = validateDemoCredentials(email, password);
            if (!validation.valid) return { success: false, errors: validation.errors };
            const normalizedEmail = email.trim().toLowerCase();
            const session = { email: normalizedEmail, displayName: displayNameFromEmail(normalizedEmail), loginAt: now() };
            const state = get();
            set({ session, malUser: null, library: state.demoLibrary, catalog: state.demoCatalog, malSync: syncState() });
            return { success: true };
          },
          logout: () => {
            const state = get();
            set({
              session: null, malUser: null, library: state.demoLibrary, catalog: state.demoCatalog,
              malSync: syncState(), malSessionVersion: state.malSessionVersion + 1,
            });
          },
          ensureEntry: (animeId) => {
            if (get().malUser && !MAL_ANIME_ID.test(animeId)) return;
            if (get().library[animeId] || !findAnime(animeId)) return;
            const state = get();
            commitActive({ ...state.library, [animeId]: createEntry(animeId, now()) });
          },
          setStatus: (animeId, status) => {
            if (get().malUser && !MAL_ANIME_ID.test(animeId)) return;
            const before = get().library[animeId];
            updateEntry(animeId, (entry) => setLibraryStatus(entry, status, now()));
            if (before?.status !== status || get().malUser && !get().malSync.remote[animeId]) queueMalChange(animeId, { status });
          },
          setWatchedEpisodes: (animeId, episodes) => {
            if (get().malUser && !MAL_ANIME_ID.test(animeId)) return;
            const before = get().library[animeId];
            updateEntry(animeId, (entry, anime) => {
              const updated = setWatchedEpisodesModel(entry, anime, episodes, now());
              return get().malUser ? { ...updated, status: entry.status } : updated;
            });
            const after = get().library[animeId];
            if (after && after.watchedEpisodes !== before?.watchedEpisodes) {
              queueMalChange(animeId, { watchedEpisodes: after.watchedEpisodes });
            }
          },
          registerAnime: (value) => {
            const anime = savedAnime(value);
            if (!anime) return;
            const state = get();
            commitActive(state.library, { ...state.catalog, [anime.id]: anime });
          },
          setPlaybackPosition: (animeId, seconds, durationSeconds, expectedEpisode) => {
            const current = get().library[animeId];
            if (expectedEpisode !== undefined && current?.currentEpisode !== expectedEpisode) return;
            updateEntry(animeId, (entry, anime) => {
              const updated = setPlaybackPositionModel(entry, anime, seconds, now(), durationSeconds);
              return get().malUser ? { ...updated, status: entry.status } : updated;
            });
          },
          selectEpisode: (animeId, episode) => {
            updateEntry(animeId, (entry, anime) => {
              const updated = selectEpisodeModel(entry, anime, episode, now());
              return get().malUser ? { ...updated, status: entry.status } : updated;
            });
          },
          markEpisodeComplete: (animeId, expectedEpisode) => {
            if (get().malUser && !MAL_ANIME_ID.test(animeId)) return;
            const before = get().library[animeId];
            if (!before || expectedEpisode !== undefined && before.currentEpisode !== expectedEpisode) return;
            updateEntry(animeId, (entry, anime) => {
              const updated = completeEpisode(entry, anime, now());
              return get().malUser && updated.status !== "completed" ? { ...updated, status: entry.status } : updated;
            });
            const after = get().library[animeId];
            if (!after || after.watchedEpisodes === before.watchedEpisodes) return;
            const anime = findAnime(animeId);
            queueMalChange(animeId, {
              watchedEpisodes: after.watchedEpisodes,
              ...(anime?.totalEpisodes !== null && after.watchedEpisodes === anime?.totalEpisodes ? { status: "completed" as const } : {}),
            });
          },
          resetDemo: () => {
            const state = get();
            const demoLibrary = createSeedLibrary();
            set({
              session: state.malUser ? state.session : null,
              demoLibrary, demoCatalog: {}, storageWarning: false,
              ...(state.malUser ? {} : { library: demoLibrary, catalog: {} }),
            });
          },
        };
      },
      {
        name: TRACKER_STORAGE_KEY,
        version: TRACKER_STORAGE_VERSION,
        storage,
        partialize: (state) => ({
          session: state.session?.malUserId ? null : state.session,
          demoLibrary: state.demoLibrary,
          demoCatalog: state.demoCatalog,
          malAccounts: state.malAccounts,
        }),
        migrate: (persisted) => {
          const restored = restoreTracker(persisted);
          return {
            session: restored.session,
            demoLibrary: restored.demoLibrary,
            demoCatalog: restored.demoCatalog,
            malAccounts: restored.malAccounts,
          };
        },
        merge: (persisted, current) => {
          const restored = restoreTracker(persisted);
          const demoLibrary = { ...current.demoLibrary, ...restored.demoLibrary };
          return {
            ...current,
            session: restored.session,
            demoLibrary,
            demoCatalog: restored.demoCatalog,
            malAccounts: restored.malAccounts,
            library: demoLibrary,
            catalog: restored.demoCatalog,
          };
        },
        onRehydrateStorage: () => (state, error) => state?.finishHydration(Boolean(error) || storageWarning),
      },
    ),
  );

  reportStorageError = () => {
    storageWarning = true;
    store.setState({ storageWarning: true });
  };
  if (!store.getState().hasHydrated && store.persist.hasHydrated()) store.getState().finishHydration(storageWarning);
  return store;
}

export const trackerStore = createTrackerStore();

export function useTrackerStore<T>(selector: (state: TrackerStore) => T): T {
  return useStore(trackerStore, selector);
}
