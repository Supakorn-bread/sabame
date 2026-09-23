import { describe, expect, it } from "vitest";
import {
  calendarDateInTimeZone,
  getDateKey,
  getEffectiveDate,
  getIsoWeek,
  isDelayed,
  isScheduleWeek,
  isoWeekDates,
  isoWeeksInYear,
  normalizeSchedulePayload,
  shiftIsoWeek,
} from "./model";

describe("schedule payload normalization", () => {
  it("keeps distinct air types, episodes, and dates while removing exact duplicates", () => {
    const raw = { title: "Blue Comet", route: "blue-comet", airType: "Raw", episodeNumber: 4, episodeDate: "2026-05-01T10:00:00Z" };
    const sub = { ...raw, airType: "Sub" };
    const nextEpisode = { ...raw, episodeNumber: 5, episodeDate: "2026-05-08T10:00:00Z" };

    const items = normalizeSchedulePayload([raw, sub, nextEpisode, raw]);

    expect(items).toHaveLength(3);
    expect(items.map((item) => item.airType)).toEqual(["Raw", "Sub", "Raw"]);
    expect(items[0]).toMatchObject({ title: "Blue Comet", episodeNumber: 4, episodeDate: raw.episodeDate });
  });

  it("preserves delayed and unknown-time titles without treating the sentinel as a real date", () => {
    const items = normalizeSchedulePayload([
      { title: "Delayed Comet", route: "delayed-comet", status: "Delayed", episodeDate: "0001-01-01T00:00:00Z", delayedUntil: null, delayedText: "Broadcast date pending" },
      { title: "Time TBD", route: "time-tbd", episodeDate: null },
    ]);

    expect(items[0].episodeDate).toBeNull();
    expect(getEffectiveDate(items[0])).toBeNull();
    expect(isDelayed(items[0])).toBe(true);
    expect(items[0].delayedText).toBe("Broadcast date pending");
    expect(items[1].episodeDate).toBeNull();
    expect(getEffectiveDate(items[1])).toBeNull();
  });

  it("drops unsafe or malformed entries, bounds text fields, and rejects malformed collection shapes", () => {
    const items = normalizeSchedulePayload([
      { title: " Valid title ".repeat(30), route: "valid-title" },
      { title: "External", route: "../external" },
      null,
      { title: "", route: "empty-title" },
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].title).toHaveLength(240);
    expect(items[0].imageVersionRoute).toBeNull();
    expect(() => normalizeSchedulePayload({ items: [] })).toThrow("invalid_schedule_payload");
    expect(() => normalizeSchedulePayload(Array.from({ length: 501 }, () => ({})))).toThrow("invalid_schedule_payload");
  });

  it("validates and retains a poster slug without accepting arbitrary URLs", () => {
    const items = normalizeSchedulePayload([
      { title: "Poster", route: "poster-anime", imageVersionRoute: "poster-v3-42" },
      { title: "Unsafe", route: "unsafe-image", imageVersionRoute: "https://elsewhere.test/poster.jpg" },
    ]);

    expect(items.map((item) => item.imageVersionRoute)).toEqual(["poster-v3-42", null]);
  });
});

describe("timezone-aware week helpers", () => {
  it("uses ISO weeks across year boundaries and shifts complete weeks", () => {
    expect(getIsoWeek(new Date(2021, 0, 1))).toEqual({ year: 2020, week: 53 });
    expect(isoWeeksInYear(2020)).toBe(53);
    expect(isoWeeksInYear(2021)).toBe(52);
    expect(shiftIsoWeek({ year: 2025, week: 1 }, -1)).toEqual({ year: 2024, week: 52 });
    expect(isoWeekDates({ year: 2025, week: 1 }).map((day) => [day.getFullYear(), day.getMonth() + 1, day.getDate()])).toEqual([
      [2024, 12, 30], [2024, 12, 31], [2025, 1, 1], [2025, 1, 2], [2025, 1, 3], [2025, 1, 4], [2025, 1, 5],
    ]);
    expect(isScheduleWeek({ year: 2025, week: 53 })).toBe(false);
    expect(isScheduleWeek({ year: 2020, week: 53 })).toBe(true);
  });

  it("groups boundary instants by the chosen IANA calendar date", () => {
    const instant = new Date("2024-12-30T01:00:00Z");
    const losAngelesDate = calendarDateInTimeZone(instant, "America/Los_Angeles");
    const tokyoDate = calendarDateInTimeZone(instant, "Asia/Tokyo");

    expect([losAngelesDate.getFullYear(), losAngelesDate.getMonth() + 1, losAngelesDate.getDate()]).toEqual([2024, 12, 29]);
    expect(getIsoWeek(losAngelesDate)).toEqual({ year: 2024, week: 52 });
    expect([tokyoDate.getFullYear(), tokyoDate.getMonth() + 1, tokyoDate.getDate()]).toEqual([2024, 12, 30]);
    expect(getIsoWeek(tokyoDate)).toEqual({ year: 2025, week: 1 });
    expect(getDateKey(instant, "America/Los_Angeles")).toBe("2024-12-29");
    expect(getDateKey(instant, "Asia/Tokyo")).toBe("2024-12-30");
  });
});
