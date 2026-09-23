import { describe, expect, it } from "vitest";
import { currentSeason, seasonHref, seasonLabel, seasonSelection } from "./model";

describe("season selection", () => {
  it.each([["2026-01-01", "winter"], ["2026-04-01", "spring"], ["2026-07-01", "summer"], ["2026-10-01", "fall"]])("uses the calendar boundary at %s", (date, season) => {
    expect(currentSeason(new Date(`${date}T00:00:00Z`))).toEqual({ year: 2026, season });
  });
  it("restores deep links and defaults invalid parameters to the current season", () => {
    const current = { year: 2026, season: "summer" as const };
    expect(seasonSelection(new URLSearchParams("year=2024&season=fall"), current)).toEqual({ year: 2024, season: "fall" });
    expect(seasonSelection(new URLSearchParams("year=99999&season=monsoon"), current)).toEqual(current);
    expect(seasonSelection(new URLSearchParams(), current)).toEqual(current);
    expect(seasonHref(current)).toBe("/seasonal?year=2026&season=summer");
    expect(seasonLabel(current)).toBe("Summer 2026");
  });
});
