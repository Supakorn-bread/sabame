import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { HomeDepth, HomeDepthFooter } from "./home-depth";

describe("HomeDepth", () => {
  it("keeps the watchlist section, feature summaries, note, and demo destination intact", () => {
    render(
      <>
        <HomeDepth />
        <HomeDepthFooter />
      </>,
    );

    expect(screen.getByRole("region", { name: "A home for your watchlist." })).toHaveAttribute(
      "id",
      "features",
    );
    expect(screen.getByText("Less keeping track. More getting lost.")).toBeInTheDocument();

    const articles = screen.getAllByRole("article");
    expect(articles).toHaveLength(3);
    expect(within(articles[0]!).getByRole("heading", { name: "One list. Every story." })).toBeInTheDocument();
    expect(within(articles[0]!).getByText("Keep what you’re watching, what’s next, and what you’ve finished together.")).toBeInTheDocument();
    expect(within(articles[1]!).getByRole("heading", { name: "Pick up where you left off." })).toBeInTheDocument();
    expect(within(articles[2]!).getByRole("heading", { name: "Make room for anime." })).toBeInTheDocument();
    expect(screen.getByText("Your demo watchlist is saved in this browser. Connect MyAnimeList to bring your own list along.")).toBeInTheDocument();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("Sabame · One episode at a time.")).toBeInTheDocument();
    expect(within(footer).getByRole("link", { name: "Enter the demo" })).toHaveAttribute("href", "/login");
  });
});
