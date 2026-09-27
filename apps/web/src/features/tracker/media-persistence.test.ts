// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createTrackerStore, TRACKER_STORAGE_KEY } from "./store";
import { restoreTracker } from "./persistence";
import type { Anime } from "./types";

const anime: Anime = { id: "mal-999", title: "Unknown season", subtitle: "", synopsis: "", genres: [], totalEpisodes: null, episodeMinutes: 0, accent: "violet" };
function storage(initial: string | null = null) {
  let value = initial;
  return { getItem: () => value, setItem: (_: string, next: string) => { value = next; }, removeItem: () => { value = null; } };
}
describe("catalog and playback persistence", () => {
  it("migrates v1 without losing session or seed progress", () => {
    const old = createTrackerStore({ storage: storage() });
    old.getState().login("viewer@example.com", "secret1"); old.getState().selectEpisode("skyward-bloom", 8);
    const persisted = storage(JSON.stringify({ version: 1, state: { session: old.getState().session, library: old.getState().library } }));
    const migrated = createTrackerStore({ storage: persisted });
    expect(migrated.getState().session?.email).toBe("viewer@example.com");
    expect(migrated.getState().library["skyward-bloom"].currentEpisode).toBe(8);
    expect(JSON.parse(persisted.getItem()!).version).toBe(3);
    expect(TRACKER_STORAGE_KEY).toBe("sabame:v1");
  });
  it("unknown episode counts never auto-complete and actual duration controls progress", () => {
    const store = createTrackerStore({ storage: storage() });
    store.getState().registerAnime(anime); store.getState().setStatus(anime.id, "planned");
    store.getState().setPlaybackPosition(anime.id, 2000, 1800, 1);
    expect(store.getState().library[anime.id].playbackSeconds).toBe(1800);
    expect(store.getState().library[anime.id].status).toBe("watching");
    store.getState().markEpisodeComplete(anime.id);
    expect(store.getState().library[anime.id]).toMatchObject({ currentEpisode: 2, status: "watching", playbackSeconds: 0 });
    store.getState().setPlaybackPosition(anime.id, 999, 1800, 1);
    expect(store.getState().library[anime.id].playbackSeconds).toBe(0);
  });
  it("persists only whitelisted metadata and never stream URLs or raw responses", () => {
    const persisted = storage(); const store = createTrackerStore({ storage: persisted });
    store.getState().registerAnime({ ...anime, video: { url: "SECRET_STREAM" }, subtitles: [{ url: "SECRET_SUB" }] } as Anime);
    store.getState().setStatus(anime.id, "planned");
    expect(persisted.getItem()).not.toContain("SECRET");
    expect(createTrackerStore({ storage: persisted }).getState().catalog[anime.id].totalEpisodes).toBeNull();
    expect(restoreTracker({ catalog: { bad: { ...anime, totalEpisodes: -1 } }, library: { bad: { playbackSeconds: -10 } } })).toMatchObject({ catalog: {}, library: {} });
  });
});
