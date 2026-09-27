// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";

import { createTrackerStore, TRACKER_STORAGE_KEY } from "./store";
import type { MalLibraryResponse, MalListStatus, MalUser } from "@/features/mal/types";
import type { Anime, LibraryEntry } from "./types";

function memoryStorage(initialValue?: string): StateStorage & { value: string | null; lastName: string | null } {
  return {
    value: initialValue ?? null,
    lastName: null,
    getItem(name) {
      this.lastName = name;
      return this.value;
    },
    setItem(name, value) {
      this.lastName = name;
      this.value = value;
    },
    removeItem(name) {
      this.lastName = name;
      this.value = null;
    },
  };
}

const malUser = (id: number): MalUser => ({ id, name: `viewer-${id}` });
const remote = (watched = 0): MalListStatus => ({
  status: "watching", num_episodes_watched: watched, score: 8, is_rewatching: true,
  updated_at: "2026-09-15T10:00:00.000Z",
});
const malAnime = (id: number): Anime => ({
  id: `mal-${id}`, title: `Anime ${id}`, subtitle: "", synopsis: "", genres: [],
  totalEpisodes: 12, episodeMinutes: 24, accent: "violet", score: "7.9",
});
function libraryResponse(user: MalUser, entries: Array<{ anime: Anime; entry: LibraryEntry; remote: MalListStatus }> = []): MalLibraryResponse {
  return { user, items: entries, operations: [], imported: true, lastSyncedAt: "2026-09-15T10:00:00.000Z" };
}

describe("tracker store", () => {
  it("starts with a useful demo library", () => {
    const store = createTrackerStore({ storage: memoryStorage() });
    const entries = Object.values(store.getState().library);

    expect(entries.length).toBeGreaterThanOrEqual(5);
    expect(entries.some((entry) => entry.status === "watching" && entry.playbackSeconds > 0)).toBe(true);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it("validates demo login and persists a safe session", () => {
    const storage = memoryStorage();
    const store = createTrackerStore({
      storage,
      now: () => "2026-08-30T12:00:00.000Z",
    });

    expect(store.getState().login("invalid", "123")).toMatchObject({ success: false });
    expect(store.getState().session).toBeNull();

    expect(store.getState().login("viewer@sabame.app", "123456")).toEqual({ success: true });
    expect(store.getState().session).toEqual({
      email: "viewer@sabame.app",
      displayName: "Viewer",
      loginAt: "2026-08-30T12:00:00.000Z",
    });
    expect(storage.value).toContain("viewer@sabame.app");
    expect(storage.value).not.toContain("123456");
  });

  it("preserves library progress when logging out", () => {
    const store = createTrackerStore({
      storage: memoryStorage(),
      now: () => "2026-08-30T12:00:00.000Z",
    });

    store.getState().login("viewer@sabame.app", "123456");
    store.getState().setPlaybackPosition("skyward-bloom", 900);
    const progressBeforeLogout = store.getState().library["skyward-bloom"];
    store.getState().logout();

    expect(store.getState().session).toBeNull();
    expect(store.getState().library["skyward-bloom"]).toEqual(progressBeforeLogout);
  });

  it("rehydrates persisted session and progress", () => {
    const storage = memoryStorage();
    const firstStore = createTrackerStore({ storage });
    firstStore.getState().login("viewer@sabame.app", "123456");
    firstStore.getState().selectEpisode("skyward-bloom", 7);
    firstStore.getState().setPlaybackPosition("skyward-bloom", 312);

    const rehydratedStore = createTrackerStore({ storage });

    expect(rehydratedStore.getState().session?.email).toBe("viewer@sabame.app");
    expect(rehydratedStore.getState().library["skyward-bloom"]).toMatchObject({
      currentEpisode: 7,
      playbackSeconds: 312,
    });
    expect(storage.lastName).toBe(TRACKER_STORAGE_KEY);
  });

  it("falls back to seed data and surfaces a warning for corrupt storage", async () => {
    const storage = memoryStorage("{ definitely-not-json }");
    const store = createTrackerStore({ storage });

    await store.persist.rehydrate();

    expect(Object.keys(store.getState().library).length).toBeGreaterThan(0);
    expect(store.getState().storageWarning).toBe(true);
    expect(store.getState().hasHydrated).toBe(true);
  });

  it("resets the complete demo state", () => {
    const store = createTrackerStore({ storage: memoryStorage() });
    const seededProgress = store.getState().library["skyward-bloom"];

    store.getState().login("viewer@sabame.app", "123456");
    store.getState().markEpisodeComplete("skyward-bloom");
    store.getState().resetDemo();

    expect(store.getState().session).toBeNull();
    expect(store.getState().library["skyward-bloom"]).toEqual(seededProgress);
  });

  it("isolates demo progress and every MAL account", () => {
    const storage = memoryStorage();
    const store = createTrackerStore({ storage, createOperationId: () => "account-operation" });
    store.getState().setPlaybackPosition("skyward-bloom", 901);
    const demoProgress = store.getState().library["skyward-bloom"];
    const anime = malAnime(101);
    const entry: LibraryEntry = {
      animeId: anime.id, status: "watching", watchedEpisodes: 2, currentEpisode: 3,
      playbackSeconds: 0, personalScore: 8, isRewatching: true, updatedAt: "2026-09-15T10:00:00.000Z",
    };

    let version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, malUser(1));
    store.getState().applyMalLibrary(version, libraryResponse(malUser(1), [{ anime, entry, remote: remote(2) }]));
    store.getState().setWatchedEpisodes(anime.id, 3);
    expect(store.getState().malSync.operations).toHaveLength(1);

    store.getState().clearMalAccount();
    expect(store.getState().library["skyward-bloom"]).toEqual(demoProgress);
    version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, malUser(2));
    store.getState().applyMalLibrary(version, libraryResponse(malUser(2)));
    expect(store.getState().library).toEqual({});

    version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, malUser(1));
    expect(store.getState().library[anime.id].watchedEpisodes).toBe(3);
    expect(store.getState().malSync.operations[0].changes).toEqual({ watchedEpisodes: 3 });

    const restored = createTrackerStore({ storage });
    expect(restored.getState().malUser).toBeNull();
    expect(restored.getState().session?.malUserId).toBeUndefined();
    expect(restored.getState().library["skyward-bloom"]).toEqual(demoProgress);
    expect(restored.getState().malAccounts["1"].library[anime.id].watchedEpisodes).toBe(3);
  });

  it("queues only explicit canonical MAL edits", async () => {
    let notifications = 0;
    const ids = ["status-id", "progress-id", "complete-id"];
    const store = createTrackerStore({
      storage: memoryStorage(),
      createOperationId: () => ids.shift() ?? "extra-id",
      onMalOperation: () => { notifications += 1; },
    });
    const user = malUser(1);
    const anime = malAnime(202);
    const version = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(version, true, user);
    store.getState().registerAnime(anime);
    store.getState().ensureEntry(anime.id);
    store.getState().selectEpisode(anime.id, 2);
    store.getState().setPlaybackPosition(anime.id, 120, 1_440, 2);
    store.getState().registerAnime({ ...anime, id: "local-title" });
    expect(store.getState().malSync.operations).toEqual([]);

    store.getState().setStatus(anime.id, "on_hold");
    store.getState().setWatchedEpisodes(anime.id, 4);
    store.getState().markEpisodeComplete(anime.id, 99);
    expect(store.getState().malSync.operations.map(({ id, changes }) => ({ id, changes }))).toEqual([
      { id: "status-id", changes: { status: "on_hold" } },
      { id: "progress-id", changes: { watchedEpisodes: 4 } },
    ]);
    await Promise.resolve();
    expect(notifications).toBe(2);
  });
});
