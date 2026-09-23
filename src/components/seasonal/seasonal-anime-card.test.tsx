import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { SeasonalAnime } from "@/features/seasonal/model";
import type { TrackerStore } from "@/features/tracker/store";
import type { LibraryEntry } from "@/features/tracker/types";
import { trackerStore } from "@/features/tracker/store";
import { SeasonalAnimeCard } from "./seasonal-anime-card";

const anime: SeasonalAnime = {
  id: "mal-999999999",
  title: "Seasonal fixture",
  subtitle: "",
  synopsis: "A seasonal anime used by the component test.",
  genres: ["Fantasy"],
  totalEpisodes: 12,
  episodeMinutes: 24,
  accent: "violet",
  score: "8.42",
  format: "tv",
  studios: ["Fixture Studio"],
  members: 123_456,
  continuing: false,
  startDate: "2026-07-01",
};

let originalLibrary: TrackerStore["library"];

function makeLibraryEntry(personalScore?: number): LibraryEntry {
  return {
    animeId: anime.id,
    status: "planned",
    watchedEpisodes: 0,
    currentEpisode: 1,
    playbackSeconds: 0,
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...(personalScore !== undefined ? { personalScore } : {}),
  };
}

function setPersonalScore(personalScore?: number) {
  trackerStore.setState((state) => {
    const entry = state.library[anime.id];
    if (!entry) throw new Error("Test anime must be in the library");

    const updatedEntry = { ...entry };
    if (personalScore === undefined) delete updatedEntry.personalScore;
    else updatedEntry.personalScore = personalScore;

    return { library: { ...state.library, [anime.id]: updatedEntry } };
  });
}

beforeEach(() => {
  originalLibrary = trackerStore.getState().library;
  const library = { ...originalLibrary };
  delete library[anime.id];
  trackerStore.setState({ library });
});

afterEach(() => {
  cleanup();
  trackerStore.setState({ library: originalLibrary });
});

describe("SeasonalAnimeCard personal score", () => {
  it("shows the user's score and keeps the community MAL score visible", () => {
    trackerStore.setState((state) => ({
      library: { ...state.library, [anime.id]: makeLibraryEntry(8) },
    }));

    render(<SeasonalAnimeCard anime={anime} />);

    expect(screen.getByText("Your score: 8/10")).toBeInTheDocument();
    expect(screen.getByText("8.42")).toBeInTheDocument();
  });

  it.each([
    ["unset", undefined],
    ["zero", 0],
  ])("shows Not scored for a library anime with a %s score", (_label, personalScore) => {
    trackerStore.setState((state) => ({
      library: { ...state.library, [anime.id]: makeLibraryEntry(personalScore) },
    }));

    render(<SeasonalAnimeCard anime={anime} />);

    expect(screen.getByText("Your score: Not scored")).toBeInTheDocument();
    expect(screen.getByText("8.42")).toBeInTheDocument();
  });

  it("does not show a personal score for anime outside the library", () => {
    render(<SeasonalAnimeCard anime={anime} />);

    expect(screen.queryByText(/^Your score:/)).not.toBeInTheDocument();
    expect(screen.getByText("8.42")).toBeInTheDocument();
  });

  it("reacts to score changes, score removal, and library removal", () => {
    trackerStore.setState((state) => ({
      library: { ...state.library, [anime.id]: makeLibraryEntry(6) },
    }));

    render(<SeasonalAnimeCard anime={anime} />);
    expect(screen.getByText("Your score: 6/10")).toBeInTheDocument();

    act(() => setPersonalScore(9));
    expect(screen.getByText("Your score: 9/10")).toBeInTheDocument();

    act(() => setPersonalScore());
    expect(screen.getByText("Your score: Not scored")).toBeInTheDocument();

    act(() => {
      trackerStore.setState((state) => {
        const library = { ...state.library };
        delete library[anime.id];
        return { library };
      });
    });
    expect(screen.queryByText(/^Your score:/)).not.toBeInTheDocument();
  });
});
