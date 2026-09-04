// @vitest-environment node

import { describe, expect, it } from "vitest";

import { createSeedLibrary } from "./seed";
import { filterLibrary, getContinueWatching, getLibraryCounts, getRecentActivity } from "./selectors";

describe("tracker selectors", () => {
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
    });
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
    expect(filterLibrary(library, "all", "  MOONLIT ").map(({ anime }) => anime.id)).toEqual(["moonlit-recipe"]);
    expect(filterLibrary(library, "planned", "harbor").map(({ anime }) => anime.id)).toEqual(["harbor-of-wishes"]);
  });
});
