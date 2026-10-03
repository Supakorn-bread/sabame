import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSwellGlintStarts, sampleOceanSwell } from "./ocean-water-math";
import { OceanWaterEffects } from "./ocean-water-effects";

function createContext() {
  const gradient = { addColorStop: vi.fn() } as unknown as CanvasGradient;
  return {
    beginPath: vi.fn(),
    bezierCurveTo: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => gradient),
    fill: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function findPeak(layer: number, time: number, start: number, end: number) {
  let peakX = start;
  let peakY = Number.NEGATIVE_INFINITY;
  for (let x = start; x <= end; x += 0.25) {
    const y = sampleOceanSwell(x, 1200, time, layer);
    if (y > peakY) {
      peakX = x;
      peakY = y;
    }
  }
  return peakX;
}

describe("OceanWaterEffects", () => {
  let context: CanvasRenderingContext2D;
  let animationFrame: ReturnType<typeof vi.fn>;
  let cancelFrame: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    context = createContext();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 320, 640));
    vi.stubGlobal("ResizeObserver", undefined);
    animationFrame = vi.fn(() => 41);
    cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", animationFrame);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("draws a static water layer without scheduling frames when paused", () => {
    render(<OceanWaterEffects paused />);

    expect(screen.getByTestId("ocean-water-canvas")).toBeVisible();
    expect(context.clearRect).toHaveBeenCalledOnce();
    expect(animationFrame).not.toHaveBeenCalled();
  });

  it("draws a continuous gradient body to the bottom and reports its Canvas fallback state", () => {
    const onCanvasReady = vi.fn();

    render(<OceanWaterEffects paused onCanvasReady={onCanvasReady} />);

    expect(onCanvasReady).toHaveBeenCalledWith(true);
    const bodyGradient = vi.mocked(context.createLinearGradient).mock.calls.find(([, , , endY]) => endY === 640);
    expect(bodyGradient).toBeDefined();
    expect(bodyGradient?.[1]).toBeLessThan(640);
  });

  it("cancels its frame and resize listener when the renderer unmounts", () => {
    const removeListener = vi.spyOn(window, "removeEventListener");
    const { unmount } = render(<OceanWaterEffects paused={false} />);
    expect(animationFrame).toHaveBeenCalledOnce();

    unmount();

    expect(cancelFrame).toHaveBeenCalledWith(41);
    expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
  });

  it("keeps the rendered fallback when a 2D canvas context is unavailable", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);

    const onCanvasReady = vi.fn();
    render(<OceanWaterEffects paused={false} onCanvasReady={onCanvasReady} />);

    expect(onCanvasReady).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("ocean-water-canvas")).toBeVisible();
    expect(animationFrame).not.toHaveBeenCalled();
  });

  it("sends the two broad surface swells in opposite directions", () => {
    const backBefore = findPeak(0, 0, 55, 105);
    const backAfter = findPeak(0, 1, 70, 125);
    const frontBefore = findPeak(1, 0, 80, 125);
    const frontAfter = findPeak(1, 1, 50, 105);

    expect(backAfter - backBefore).toBeGreaterThan(12);
    expect(frontAfter - frontBefore).toBeLessThan(-12);
  });

  it("keeps visible crest positions continuous through a full cycle and long dwell", () => {
    const width = 1200;
    const spacing = 174;
    const frontWaveSpeed = 0.52 * (width * 0.24) / (Math.PI * 2);
    const cycle = spacing / frontWaveSpeed;
    const visibleStarts = (time: number) => getSwellGlintStarts(width, time, spacing, 1)
      .filter((start) => start >= -24 && start <= width + 24)
      .sort((a, b) => a - b);
    const atStart = visibleStarts(0);
    const nearStart = visibleStarts(0.001);
    const afterCycle = visibleStarts(cycle);
    const afterLongDwell = visibleStarts(100_000);

    expect(nearStart).toHaveLength(atStart.length);
    expect(afterCycle).toHaveLength(atStart.length);
    atStart.forEach((start, index) => {
      expect(nearStart[index]).toBeCloseTo(start, 1);
      expect(afterCycle[index]).toBeCloseTo(start, 8);
    });
    expect(afterLongDwell.length).toBeGreaterThanOrEqual(atStart.length - 1);
    expect(afterLongDwell.length).toBeLessThanOrEqual(atStart.length + 1);
    expect(afterLongDwell.every((start) => start >= -24 && start <= width + 24)).toBe(true);
  });

  it("scales the swell height down on phones and keeps it restrained on wide screens", () => {
    const maximumHeight = (width: number) => {
      let maximum = 0;
      for (let x = 0; x <= width; x += 3) {
        for (let layer = 0; layer < 4; layer++) {
          maximum = Math.max(maximum, Math.abs(sampleOceanSwell(x, width, 0.5, layer)));
        }
      }
      return maximum;
    };

    const mobileHeight = maximumHeight(390);
    const desktopHeight = maximumHeight(1440);
    const wideHeight = maximumHeight(1920);

    expect(mobileHeight).toBeLessThan(desktopHeight * 0.8);
    expect(desktopHeight).toBeLessThan(16.2);
    expect(wideHeight).toBeLessThan(16.2);
  });
});
