// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackerStore } from "./store";
import type { MalLibraryResponse, MalListStatus } from "@/features/mal/types";

const remote: MalListStatus = { status: "on_hold", num_episodes_watched: 2, score: 8, is_rewatching: false, updated_at: "2026-09-22T00:00:00Z" };
const snapshot: MalLibraryResponse = {
  user: { id: 42, name: "Viewer" }, imported: true, lastSyncedAt: remote.updated_at, operations: [],
  items: [{ anime: { id: "mal-100", title: "Test", subtitle: "", synopsis: "", genres: [], totalEpisodes: 12, episodeMinutes: 24, accent: "violet" }, entry: { animeId: "mal-100", status: "on_hold", watchedEpisodes: 2, currentEpisode: 3, playbackSeconds: 0, updatedAt: remote.updated_at }, remote }],
};
function setup() {
  let serialized: string | null = null;
  const storage = { getItem: () => serialized, setItem: (_: string, value: string) => { serialized = value; }, removeItem: () => { serialized = null; } };
  const store = createTrackerStore({ storage, onMalOperation: () => {} });
  const version = store.getState().beginMalBootstrap();
  store.getState().activateMalAccount(version, true, snapshot.user);
  store.getState().applyMalLibrary(version, snapshot);
  store.getState().finishMalBootstrap(version);
  return { store, storage, version };
}

describe("MAL state boundaries", () => {
  it("preserves imported status during playback and progress-only edits", () => {
    const { store } = setup();
    store.getState().selectEpisode("mal-100", 4);
    store.getState().setPlaybackPosition("mal-100", 200, 1440, 4);
    expect(store.getState().library["mal-100"].status).toBe("on_hold");
    expect(store.getState().malSync.operations).toEqual([]);
    store.getState().setWatchedEpisodes("mal-100", 12);
    expect(store.getState().library["mal-100"].status).toBe("on_hold");
    expect(store.getState().malSync.operations[0].changes).toEqual({ watchedEpisodes: 12 });
  });
  it("does not rewrite a captured conflict baseline after importing changed MAL data", () => {
    const { store, version, storage } = setup();
    store.getState().setWatchedEpisodes("mal-100", 3);
    const operation = store.getState().malSync.operations[0];
    const newer = { ...remote, num_episodes_watched: 8 };
    store.getState().applyMalLibrary(version, { ...snapshot, items: [{ ...snapshot.items[0], remote: newer, entry: { ...snapshot.items[0].entry, watchedEpisodes: 8 } }] });
    expect(store.getState().rebasePendingMalOperation(42, operation.id)?.base?.num_episodes_watched).toBe(2);
    const restored = createTrackerStore({ storage });
    expect(restored.getState().malAccounts["42"].operations[0].submitted).toBe(true);
    expect(restored.getState().malUser).toBeNull();
  });
  it("rebases only unsent subsequent edits on its own acknowledged write", () => {
    const { store } = setup();
    store.getState().setWatchedEpisodes("mal-100", 3);
    store.getState().setWatchedEpisodes("mal-100", 4);
    const [first, second] = store.getState().malSync.operations;
    store.getState().rebasePendingMalOperation(42, first.id);
    const acknowledged = { ...remote, num_episodes_watched: 3 };
    store.getState().applyMalOperation(42, first.id, { ...first, state: "synced" }, { ...snapshot.items[0], remote: acknowledged, entry: { ...snapshot.items[0].entry, watchedEpisodes: 3 } });
    expect(store.getState().malSync.operations.find(operation => operation.id === second.id)?.base?.num_episodes_watched).toBe(3);
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(4);
  });
  it("keeps conflicts actionable even when more edits are queued", () => {
    const { store } = setup();
    store.getState().setWatchedEpisodes("mal-100", 3);
    store.getState().setWatchedEpisodes("mal-100", 4);
    const first = store.getState().malSync.operations[0];
    store.getState().applyMalOperation(42, first.id, { ...first, state: "conflict", remote: { ...remote, num_episodes_watched: 8 } });
    expect(store.getState().malSync.status).toBe("error");
    expect(store.getState().malSync.conflicts).toHaveLength(1);
  });
  it("using MAL discards pre-existing unsent edits but preserves edits made after the choice", () => {
    const { store } = setup();
    store.getState().setWatchedEpisodes("mal-100", 3);
    store.getState().setWatchedEpisodes("mal-100", 4);
    const [first, second] = store.getState().malSync.operations;
    store.getState().rebasePendingMalOperation(42, first.id);
    store.getState().setWatchedEpisodes("mal-100", 7);
    const acknowledged = { ...remote, num_episodes_watched: 6 };
    store.getState().applyMalOperation(42, first.id, { ...first, state: "synced", remote: acknowledged }, { ...snapshot.items[0], remote: acknowledged, entry: { ...snapshot.items[0].entry, watchedEpisodes: 6 } }, false, [second.id]);
    expect(store.getState().malSync.operations.some(operation => operation.id === second.id)).toBe(false);
    expect(store.getState().library["mal-100"].watchedEpisodes).toBe(7);
    expect(store.getState().malSync.operations.at(-1)?.base?.num_episodes_watched).toBe(6);
  });
  it("does not send seed progress or apply a previous account response", () => {
    const { store, version } = setup();
    store.getState().ensureEntry("skyward-bloom");
    store.getState().setWatchedEpisodes("skyward-bloom", 5);
    expect(store.getState().library["skyward-bloom"]).toBeUndefined();
    expect(store.getState().malSync.operations).toEqual([]);
    store.getState().clearMalAccount();
    const next = store.getState().beginMalBootstrap();
    store.getState().activateMalAccount(next, true, { id: 99, name: "Other" });
    expect(store.getState().applyMalLibrary(version, snapshot)).toBe(false);
    expect(store.getState().library).toEqual({});
  });
});
