import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Anime, LibraryEntry } from "@/features/tracker/types";
import { LibraryAnimeCard } from "./library-anime-card";

const anime: Anime = {
  id: "mal-987654",
  title: "Library Card Fixture",
  subtitle: "",
  synopsis: "",
  genres: ["Fantasy"],
  totalEpisodes: null,
  episodeMinutes: 24,
  accent: "violet",
  score: "8.42",
};

const entry: LibraryEntry = {
  animeId: anime.id,
  status: "watching",
  watchedEpisodes: 2,
  currentEpisode: 3,
  playbackSeconds: 0,
  personalScore: 9,
  updatedAt: "2026-09-23T00:00:00.000Z",
};

function renderCard() {
  const onProgressChange = vi.fn();
  const onStatusChange = vi.fn();

  render(
    <LibraryAnimeCard
      anime={anime}
      entry={entry}
      onProgressChange={onProgressChange}
      onStatusChange={onStatusChange}
    />,
  );

  return { onProgressChange, onStatusChange };
}

function getCard() {
  const card = screen.getByTestId("library-card-content").closest("article");
  if (!card) throw new Error("Library card article was not rendered");
  return card;
}

describe("LibraryAnimeCard details panel", () => {
  it("opens on hover and closes on pointer leave after control interactions", async () => {
    const user = userEvent.setup();
    const { onProgressChange, onStatusChange } = renderCard();

    const panel = screen.getByTestId("library-card-content");
    const trigger = screen.getByRole("button", { name: "Show details for " + anime.title });
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("button", { name: "Increase " + anime.title + " watched episodes" }),
    ).not.toBeInTheDocument();

    await user.hover(getCard());
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(panel).not.toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByText("8.42").closest("dd")).toHaveTextContent("8.42 community");
    expect(screen.getByText("9/10").closest("dd")).toHaveTextContent("9/10 yours");
    expect(screen.getByText("2 / ?")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: anime.title + " watch progress" })).toHaveAttribute(
      "aria-valuetext",
      "2 of ? episodes watched",
    );
    await user.click(screen.getByRole("button", { name: "Decrease " + anime.title + " watched episodes" }));
    expect(onProgressChange).toHaveBeenCalledWith(anime.id, anime.title, 1);
    const increase = screen.getByRole("button", { name: "Increase " + anime.title + " watched episodes" });
    expect(increase).toBeEnabled();
    await user.click(increase);
    expect(onProgressChange).toHaveBeenCalledWith(anime.id, anime.title, 3);
    await user.selectOptions(screen.getByRole("combobox", { name: "Status for " + anime.title }), "completed");
    expect(onStatusChange).toHaveBeenCalledWith(anime.id, anime.title, "completed");

    await user.unhover(getCard());
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
  });

  it("toggles from the touch trigger, exposes no close button or inner scroller, and closes on Escape", () => {
    renderCard();
    const panel = screen.getByTestId("library-card-content");
    const trigger = screen.getByRole("button", { name: "Show details for " + anime.title });
    fireEvent.click(trigger);
    expect(panel).toHaveAttribute("aria-hidden", "false");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(within(panel).getByRole("heading", { level: 2 })).toHaveTextContent(anime.title);
    expect(screen.queryByRole("button", { name: "Close details for " + anime.title })).not.toBeInTheDocument();
    expect(panel.querySelector(".overflow-y-auto")).toBeNull();

    trigger.focus();
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    expect(panel).toHaveAttribute("aria-hidden", "false");
    fireEvent.click(trigger);
    expect(panel).toHaveAttribute("aria-hidden", "true");
    expect(panel).toHaveAttribute("inert");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("shows compact score fallbacks with descriptive accessible text", () => {
    render(
      <LibraryAnimeCard
        anime={{ ...anime, score: undefined }}
        entry={{ ...entry, personalScore: undefined }}
        onProgressChange={vi.fn()}
        onStatusChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Show details for " + anime.title }));

    expect(screen.getByText("Unrated").closest("dd")).toHaveTextContent("Unrated community");
    expect(screen.getByText("—").closest("dd")).toHaveTextContent("—Not scored");
  });
});
