import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SimulatedPlayer } from "./simulated-player";

afterEach(() => vi.useRealTimers());

describe("SimulatedPlayer", () => {
  it("advances playback while playing and pauses on request", () => {
    vi.useFakeTimers();
    const onPositionChange = vi.fn();

    render(
      <SimulatedPlayer
        title="Skyward Bloom"
        episode={6}
        durationSeconds={120}
        initialPosition={60}
        onPositionChange={onPositionChange}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Play episode" })[0]);
    expect(screen.getAllByRole("button", { name: "Pause episode" })).not.toHaveLength(0);

    act(() => vi.advanceTimersByTime(2_000));
    expect(onPositionChange).toHaveBeenLastCalledWith(62);

    fireEvent.click(screen.getAllByRole("button", { name: "Pause episode" })[0]);
    act(() => vi.advanceTimersByTime(2_000));
    expect(onPositionChange).toHaveBeenCalledTimes(2);
  });

  it("supports seeking and an explicit completion action", () => {
    const onPositionChange = vi.fn();
    const onComplete = vi.fn();

    render(
      <SimulatedPlayer
        title="Skyward Bloom"
        episode={6}
        durationSeconds={120}
        initialPosition={20}
        onPositionChange={onPositionChange}
        onComplete={onComplete}
      />,
    );

    fireEvent.change(screen.getByLabelText("Playback position"), { target: { value: "95" } });
    expect(onPositionChange).toHaveBeenLastCalledWith(95);

    fireEvent.click(screen.getAllByRole("button", { name: "Mark episode complete" })[0]);
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
