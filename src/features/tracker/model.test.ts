// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  completeEpisode,
  selectEpisode,
  setLibraryStatus,
  setPlaybackPosition,
  setWatchedEpisodes,
  validateDemoCredentials,
} from "./model";
import type { Anime, LibraryEntry } from "./types";

const anime: Anime = {
  id: "skyward-bloom",
  title: "Skyward Bloom",
  subtitle: "空へ咲く",
  synopsis: "A courier follows a trail of flowers through cities in the clouds.",
  genres: ["Adventure", "Fantasy"],
  totalEpisodes: 12,
  episodeMinutes: 24,
  accent: "violet",
};

const entry: LibraryEntry = {
  animeId: anime.id,
  status: "watching",
  watchedEpisodes: 3,
  currentEpisode: 4,
  playbackSeconds: 420,
  updatedAt: "2026-08-30T10:00:00.000Z",
};

describe("demo credential validation", () => {
  it("accepts a valid email and six-character password", () => {
    expect(validateDemoCredentials("viewer@sabame.app", "123456")).toEqual({
      valid: true,
      errors: {},
    });
  });

  it("returns field-level errors for invalid credentials", () => {
    expect(validateDemoCredentials("not-an-email", "short")).toEqual({
      valid: false,
      errors: {
        email: "Enter a valid email address.",
        password: "Use at least 6 characters.",
      },
    });
  });
});

describe("tracker progress rules", () => {
  it("clamps watched episodes and keeps the next episode in range", () => {
    expect(setWatchedEpisodes(entry, anime, 99, "2026-08-30T11:00:00.000Z")).toMatchObject({
      watchedEpisodes: 12,
      currentEpisode: 12,
      playbackSeconds: 0,
      status: "completed",
    });

    expect(setWatchedEpisodes(entry, anime, -2, "2026-08-30T11:00:00.000Z")).toMatchObject({
      watchedEpisodes: 0,
      currentEpisode: 1,
      playbackSeconds: 0,
    });
  });

  it("clamps playback to the selected episode duration", () => {
    const durationSeconds = anime.episodeMinutes * 60;

    expect(setPlaybackPosition(entry, anime, durationSeconds + 500, "2026-08-30T11:00:00.000Z").playbackSeconds).toBe(
      durationSeconds,
    );
    expect(setPlaybackPosition(entry, anime, -30, "2026-08-30T11:00:00.000Z").playbackSeconds).toBe(0);
  });

  it("resets playback when selecting another episode", () => {
    expect(selectEpisode(entry, anime, 8, "2026-08-30T11:00:00.000Z")).toMatchObject({
      currentEpisode: 8,
      playbackSeconds: 0,
      status: "watching",
    });
  });

  it("marks an episode watched and advances until the series is complete", () => {
    expect(completeEpisode(entry, anime, "2026-08-30T11:00:00.000Z")).toMatchObject({
      watchedEpisodes: 4,
      currentEpisode: 5,
      playbackSeconds: 0,
      status: "watching",
    });

    const finale = { ...entry, watchedEpisodes: 11, currentEpisode: 12 };
    expect(completeEpisode(finale, anime, "2026-08-30T11:00:00.000Z")).toMatchObject({
      watchedEpisodes: 12,
      currentEpisode: 12,
      status: "completed",
    });
  });

  it("preserves progress while moving between library statuses", () => {
    expect(setLibraryStatus(entry, "planned", "2026-08-30T11:00:00.000Z")).toEqual({
      ...entry,
      status: "planned",
      updatedAt: "2026-08-30T11:00:00.000Z",
    });
  });
});
