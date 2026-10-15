import { describe, expect, it } from "vitest";
import type { ScheduleAnime } from "./model";
import { buildCalendarGroups, carouselIndices, minuteLabel } from "./calendar";
const anime: ScheduleAnime = { id: "a", title: "A", route: "a", imageVersionRoute: null, episodeDate: "2026-09-23T05:00:00Z", delayedUntil: null, delayedText: null, episodeNumber: 1, subtractedEpisodeNumber: null, status: "Upcoming", airingStatus: null, airType: "Raw" };
describe("calendar grouping", () => {
  it("groups only the same selected-zone date and exact minute", () => {
    const groups = buildCalendarGroups([anime, { ...anime, id: "b", episodeDate: "2026-09-23T05:00:59Z" }, { ...anime, id: "c", episodeDate: "2026-09-23T05:01:00Z" }, { ...anime, id: "d", episodeDate: "2026-09-24T05:00:00Z" }], "Asia/Bangkok", ["2026-09-23", "2026-09-24"]);
    expect(groups.map((group) => [group.dateKey, minuteLabel(group.minuteOfDay), group.items.map((item) => item.id)])).toEqual([["2026-09-23", "12:00", ["a", "b"]], ["2026-09-24", "12:00", ["d"]], ["2026-09-23", "12:01", ["c"]]]);
  });
  it("uses delayedUntil and excludes undated and out-of-week entries", () => {
    const groups = buildCalendarGroups([{ ...anime, status: "Delayed", delayedUntil: "2026-09-24T17:15:00Z" }, { ...anime, id: "tbd", status: "Delayed" }, { ...anime, id: "outside", episodeDate: "2026-09-30T05:00:00Z" }], "Asia/Tokyo", ["2026-09-25"]);
    expect(groups.map((group) => [group.dateKey, minuteLabel(group.minuteOfDay), group.items.map((item) => item.id)])).toEqual([["2026-09-25", "02:15", ["a"]]]);
  });
  it("moves the date when the selected timezone crosses midnight", () => {
    const item = { ...anime, episodeDate: "2026-09-23T16:00:00Z" };
    expect(buildCalendarGroups([item], "Asia/Bangkok", ["2026-09-23"])[0]?.minuteOfDay).toBe(1380);
    expect(buildCalendarGroups([item], "Asia/Tokyo", ["2026-09-24"])[0]?.minuteOfDay).toBe(60);
  });
  it("shows actual counts and bounds the carousel window", () => {
    expect(carouselIndices(1, 0)).toEqual([0]);
    expect(carouselIndices(2, 1)).toEqual([0, 1]);
    expect(carouselIndices(3, 0)).toEqual([0, 1, 2]);
    expect(carouselIndices(4, 3)).toEqual([1, 2, 3]);
  });
});
