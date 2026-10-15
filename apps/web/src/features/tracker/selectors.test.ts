// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createSeedLibrary, getAnimeById } from "./seed";
import { filterLibrary, getContinueWatching, getLibraryCounts, getRecentActivity, getTrackedLibrary, getTrackingStatus } from "./selectors";
import type { MalOperation } from "@/features/mal/types";

describe("tracker selectors", () => {
  it("keeps demo membership unchanged and excludes local account workspaces from counts and cards", () => {
    const library = createSeedLibrary();
    const state = { library, malUser: null, malSync: { status: "synced" as const, operations: [], conflicts: [], remote: {} } };
    expect(getTrackedLibrary(state)).toBe(library);
    const account = { ...state, malUser: { id: 42, name: "Viewer" } };
    expect(getLibraryCounts(getTrackedLibrary(account)).all).toBe(0);
    expect(filterLibrary(getTrackedLibrary(account), "all", "")).toEqual([]);
    expect(getContinueWatching(getTrackedLibrary(account))).toEqual([]);
  });
  it("includes every unresolved tracking state and ignores a synced receipt without remote membership", () => {
    const entries = Object.values(createSeedLibrary()).slice(0, 4);
    const library = Object.fromEntries(entries.map((entry, index) => [`mal-${index + 1}`, { ...entry, animeId: `mal-${index + 1}` }]));
    const catalog = Object.fromEntries(entries.map((entry, index) => [`mal-${index + 1}`, { ...getAnimeById(entry.animeId)!, id: `mal-${index + 1}` }]));
    const operations: MalOperation[] = [
      { id: "pending", animeId: "mal-1", state: "pending", changes: { status: "watching" }, base: null },
      { id: "conflict", animeId: "mal-2", state: "conflict", changes: { status: "watching" }, base: null },
      { id: "failed", animeId: "mal-3", state: "failed", changes: { status: "watching" }, base: null },
      { id: "synced", animeId: "mal-4", state: "synced", changes: { status: "completed" }, base: null },
    ];
    const state = { library, malUser: { id: 42, name: "Viewer" }, malSync: { status: "synced" as const, operations, conflicts: [], remote: {} } };
    expect(Object.keys(getTrackedLibrary(state))).toEqual(["mal-1", "mal-2", "mal-3"]);
    expect(getTrackingStatus(state, "mal-4")).toBe("untracked");
    expect(getLibraryCounts(getTrackedLibrary(state), catalog)).toEqual({ all: 3, watching: 3, planned: 0, completed: 0, on_hold: 0, dropped: 0 });
  });

  it("orders continue-watching titles by latest activity", () => {
    const results = getContinueWatching(createSeedLibrary());

    expect(results.map(({ anime }) => anime.id)).toEqual([
      "skyward-bloom",
      "neon-requiem",
      "moonlit-recipe",
    ]);
  });

  it("calculates status totals", () => {
    expect(getLibraryCounts(createSeedLibrary())).toEqual({
      all: 6,
      watching: 3,
      planned: 2,
      completed: 1,
      on_hold: 0,
      dropped: 0,
    });
  });

  it("counts and filters on-hold and dropped entries", () => {
    const library = createSeedLibrary();
    library["skyward-bloom"] = { ...library["skyward-bloom"], status: "on_hold" };
    library["neon-requiem"] = { ...library["neon-requiem"], status: "dropped" };

    expect(getLibraryCounts(library)).toMatchObject({ watching: 1, on_hold: 1, dropped: 1 });
    expect(filterLibrary(library, "on_hold", "").map(({ anime }) => anime.id)).toEqual(["skyward-bloom"]);
  });

  it("returns the latest activity with matching anime data", () => {
    const activity = getRecentActivity(createSeedLibrary(), 2);

    expect(activity).toHaveLength(2);
    expect(activity[0].anime.id).toBe("skyward-bloom");
    expect(activity[0].entry.updatedAt > activity[1].entry.updatedAt).toBe(true);
  });

  it("filters the library by status and normalized title search", () => {
    const library = createSeedLibrary();

    expect(filterLibrary(library, "completed", "").map(({ anime }) => anime.id)).toEqual(["last-shrine"]);
    expect(filterLibrary(library, "all", "  MUSHOKU ").map(({ anime }) => anime.id)).toEqual(["moonlit-recipe"]);
    expect(filterLibrary(library, "planned", "eminence").map(({ anime }) => anime.id)).toEqual(["harbor-of-wishes"]);
  });
});
