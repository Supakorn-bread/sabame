// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { animeParadiseSeedSegment, hasAnimeParadiseSeedConfiguration } from "./seed-provider-mappings";

it("reuses reviewed exact season mappings for canonical account titles", () => {
  expect(animeParadiseSeedSegment("mal-55701", 1)).toEqual(animeParadiseSeedSegment("last-shrine", 1));
  expect(animeParadiseSeedSegment("mal-52991", 28)?.expectedUnitCount).toBe(28);
  expect(hasAnimeParadiseSeedConfiguration("mal-42310")).toBe(true);
  expect(animeParadiseSeedSegment("mal-42310", 1)).toBeUndefined();
});
it("does not alias a single MAL cour to a combined demo season", () => {
  expect(hasAnimeParadiseSeedConfiguration("mal-51179")).toBe(false);
  expect(animeParadiseSeedSegment("mal-51179", 13)).toBeUndefined();
});
