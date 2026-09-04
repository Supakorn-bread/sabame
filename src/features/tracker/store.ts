"use client";

import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import {
  persist,
  type PersistStorage,
  type StateStorage,
  type StorageValue,
} from "zustand/middleware";

import {
  completeEpisode,
  selectEpisode as selectEpisodeModel,
  setLibraryStatus,
  setPlaybackPosition as setPlaybackPositionModel,
  setWatchedEpisodes as setWatchedEpisodesModel,
  validateDemoCredentials,
} from "./model";
import { createSeedLibrary, getAnimeById } from "./seed";
import type {
  CredentialErrors,
  DemoSession,
  LibraryEntry,
  LibraryStatus,
} from "./types";

export const TRACKER_STORAGE_KEY = "sabame:v1";
export const TRACKER_STORAGE_VERSION = 1;

interface PersistedTrackerState {
  session: DemoSession | null;
  library: Record<string, LibraryEntry>;
}

export interface TrackerStore extends PersistedTrackerState {
  hasHydrated: boolean;
  storageWarning: boolean;
  finishHydration: (storageWarning?: boolean) => void;
  login: (email: string, password: string) => { success: true } | { success: false; errors: CredentialErrors };
  logout: () => void;
  setStatus: (animeId: string, status: LibraryStatus) => void;
  setWatchedEpisodes: (animeId: string, episodes: number) => void;
  setPlaybackPosition: (animeId: string, seconds: number) => void;
  selectEpisode: (animeId: string, episode: number) => void;
  markEpisodeComplete: (animeId: string) => void;
  resetDemo: () => void;
}

interface CreateTrackerStoreOptions {
  storage?: StateStorage;
  now?: () => string;
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

function createSafeJsonStorage(
  storage: StateStorage,
  onStorageError: () => void,
): PersistStorage<PersistedTrackerState> {
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
  return {
    animeId,
    status: "planned",
    watchedEpisodes: 0,
    currentEpisode: 1,
    playbackSeconds: 0,
    updatedAt,
  };
}

function displayNameFromEmail(email: string) {
  const localPart = email.split("@")[0] || "Viewer";
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ") || "Viewer";
}

export function createTrackerStore(options: CreateTrackerStoreOptions = {}) {
  const now = options.now ?? (() => new Date().toISOString());
  let storageWarning = false;
  let reportStorageError = () => {
    storageWarning = true;
  };
  const storage = createSafeJsonStorage(options.storage ?? browserStorage, () => reportStorageError());

  const store = createStore<TrackerStore>()(
    persist(
      (set, get) => {
        const updateEntry = (
          animeId: string,
          updater: (entry: LibraryEntry) => LibraryEntry,
        ) => {
          const anime = getAnimeById(animeId);
          if (!anime) return;

          const entry = get().library[animeId] ?? createEntry(animeId, now());
          set((state) => ({
            library: { ...state.library, [animeId]: updater(entry) },
          }));
        };

        return {
          session: null,
          library: createSeedLibrary(),
          hasHydrated: false,
          storageWarning: false,
          finishHydration: (warning = false) => set({ hasHydrated: true, storageWarning: warning }),
          login: (email, password) => {
            const validation = validateDemoCredentials(email, password);
            if (!validation.valid) return { success: false, errors: validation.errors };

            const normalizedEmail = email.trim().toLowerCase();
            set({
              session: {
                email: normalizedEmail,
                displayName: displayNameFromEmail(normalizedEmail),
                loginAt: now(),
              },
            });
            return { success: true };
          },
          logout: () => set({ session: null }),
          setStatus: (animeId, status) => {
            updateEntry(animeId, (entry) => setLibraryStatus(entry, status, now()));
          },
          setWatchedEpisodes: (animeId, episodes) => {
            const anime = getAnimeById(animeId);
            if (!anime) return;
            updateEntry(animeId, (entry) => setWatchedEpisodesModel(entry, anime, episodes, now()));
          },
          setPlaybackPosition: (animeId, seconds) => {
            const anime = getAnimeById(animeId);
            if (!anime) return;
            updateEntry(animeId, (entry) => setPlaybackPositionModel(entry, anime, seconds, now()));
          },
          selectEpisode: (animeId, episode) => {
            const anime = getAnimeById(animeId);
            if (!anime) return;
            updateEntry(animeId, (entry) => selectEpisodeModel(entry, anime, episode, now()));
          },
          markEpisodeComplete: (animeId) => {
            const anime = getAnimeById(animeId);
            if (!anime) return;
            updateEntry(animeId, (entry) => completeEpisode(entry, anime, now()));
          },
          resetDemo: () => set({ session: null, library: createSeedLibrary(), storageWarning: false }),
        };
      },
      {
        name: TRACKER_STORAGE_KEY,
        version: TRACKER_STORAGE_VERSION,
        storage,
        partialize: (state) => ({ session: state.session, library: state.library }),
        merge: (persisted, current) => {
          const restored = persisted as Partial<PersistedTrackerState> | undefined;
          return {
            ...current,
            session: restored?.session ?? current.session,
            library: restored?.library
              ? { ...current.library, ...restored.library }
              : current.library,
          };
        },
        onRehydrateStorage: () => (state, error) => {
          state?.finishHydration(Boolean(error) || storageWarning);
        },
      },
    ),
  );

  reportStorageError = () => {
    storageWarning = true;
    store.setState({ storageWarning: true });
  };

  if (!store.getState().hasHydrated && store.persist.hasHydrated()) {
    store.getState().finishHydration(storageWarning);
  }

  return store;
}

export const trackerStore = createTrackerStore();

export function useTrackerStore<T>(selector: (state: TrackerStore) => T): T {
  return useStore(trackerStore, selector);
}
