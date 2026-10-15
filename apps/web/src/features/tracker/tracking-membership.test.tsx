import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WatchPage from "@/app/watch/[animeId]/page";
import { SeasonalAnimeCard } from "@/components/seasonal/seasonal-anime-card";
import { trackerStore } from "./store";
import type { SeasonalAnime } from "@/features/seasonal/model";

const anime: SeasonalAnime = {
  id: "mal-101", title: "Unlisted title", subtitle: "", synopsis: "", genres: [],
  totalEpisodes: 12, episodeMinutes: 24, accent: "violet", studios: [], members: 10,
  format: "tv", continuing: false,
};
vi.mock("next/navigation", () => ({ useParams: () => ({ animeId: "mal-101" }) }));
vi.mock("@/components/layout/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));
vi.mock("@/features/media/use-catalog", () => ({ useCatalogAnime: () => ({ anime }), useCatalogEpisodes: () => [1, 2, 3] }));
vi.mock("@/components/media-player", () => ({ MediaPlayer: () => <div>Player</div> }));
vi.mock("@/components/simulated-player", () => ({ SimulatedPlayer: () => <div>Demo player</div> }));

const initial = trackerStore.getState();
beforeEach(() => {
  trackerStore.setState(initial, true);
  const version = trackerStore.getState().beginMalBootstrap();
  trackerStore.getState().activateMalAccount(version, true, { id: 42, name: "Viewer" });
  trackerStore.getState().registerAnime(anime);
  trackerStore.getState().finishMalBootstrap(version);
});
afterEach(() => { cleanup(); trackerStore.setState(initial, true); });

describe("unlisted MAL title", () => {
  it("labels local playback clearly and creates an intent only after Add", () => {
    render(<WatchPage />);
    expect(screen.getByText("Not on your MyAnimeList")).toBeInTheDocument();
    expect(screen.queryByText(/Progress matches the latest MyAnimeList sync/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Episode 2/ }));
    expect(trackerStore.getState().library[anime.id].currentEpisode).toBe(2);
    expect(trackerStore.getState().malSync.operations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Add to MyAnimeList" }));
    expect(trackerStore.getState().malSync.operations.map(({ changes, base }) => ({ changes, base }))).toEqual([{ changes: { status: "planned" }, base: null }]);
    expect(screen.getByText(/waiting for MyAnimeList confirmation/)).toBeInTheDocument();
  });
  it("does not label a seasonal playback workspace as library membership", () => {
    trackerStore.getState().ensureEntry(anime.id);
    render(<SeasonalAnimeCard anime={anime} />);
    expect(screen.queryByText("In your library")).not.toBeInTheDocument();
    expect(screen.queryByText(/^Your score:/)).not.toBeInTheDocument();
    act(() => trackerStore.getState().setStatus(anime.id, "planned"));
    expect(screen.getByText("In your library")).toBeInTheDocument();
  });
});
