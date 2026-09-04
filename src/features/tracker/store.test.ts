// @vitest-environment node

import { describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";

import { createTrackerStore, TRACKER_STORAGE_KEY } from "./store";

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
});
