import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OceanHero } from "./ocean-hero";

vi.mock("./ocean-water-effects", () => ({
  OceanWaterEffects: ({ paused }: { paused: boolean }) => (
    <div data-testid="ocean-waves" data-paused={String(paused)} />
  ),
}));

describe("OceanHero", () => {
  it("renders accessible copy, destinations, and an image-independent illustrated fallback", () => {
    render(<OceanHero />);

    expect(screen.getByRole("region", { name: "Dive into your next story." })).toHaveAttribute(
      "id",
      "home-hero",
    );
    expect(screen.getByText("Your next watch starts here")).toBeInTheDocument();
    expect(screen.getByText("Discover anime you’ll love. Keep your watchlist, episode progress, and next story together.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Explore Sabame" })).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Take a look" })).toHaveAttribute("href", "#features");

    const background = screen.getByTestId("ocean-background");
    expect(background.querySelector("img")).toBeNull();
    expect(background.querySelectorAll(".ocean-hero__cloud")).toHaveLength(2);
    expect(background.querySelector(".ocean-hero__sun")).not.toBeNull();
    expect(screen.getByTestId("ocean-static-waterline").querySelectorAll("path")).toHaveLength(2);

    const scene = screen.getByTestId("ocean-scene");
    expect(scene).toHaveAttribute("aria-hidden", "true");
    expect(screen.getAllByTestId("ocean-card")).toHaveLength(3);
    expect(screen.getByTestId("ocean-waves")).toBeInTheDocument();
    expect(screen.getAllByTestId("ocean-fish")).toHaveLength(2);
    for (const fish of screen.getAllByTestId("ocean-fish")) {
      expect(fish.closest('[aria-hidden="true"]')).not.toBeNull();
      expect(fish.querySelector("img")).toHaveAttribute("alt", "");
    }
  });

  it("has no motion control and pauses automatically when the document is hidden", () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    try {
      render(<OceanHero />);
      const scene = screen.getByTestId("ocean-scene");
      expect(screen.queryByRole("button")).not.toBeInTheDocument();
      expect(scene).toHaveAttribute("data-paused", "false");
      act(() => {
        hidden.mockReturnValue(true);
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(scene).toHaveAttribute("data-paused", "true");
      expect(screen.getByTestId("ocean-waves")).toHaveAttribute("data-paused", "true");
      act(() => {
        hidden.mockReturnValue(false);
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(scene).toHaveAttribute("data-paused", "false");
      expect(screen.getByTestId("ocean-waves")).toHaveAttribute("data-paused", "false");
    } finally {
      hidden.mockRestore();
    }
  });
});
