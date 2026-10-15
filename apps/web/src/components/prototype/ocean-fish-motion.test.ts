import { describe, expect, it } from "vitest";

import {
  getFishVerticalPosition,
  sampleFishTrack,
} from "./ocean-fish-motion";

function sceneFish(index: number, width: number) {
  const seed = (index * 0.61803398875 + 0.19) % 1;
  const depth = index % 3;
  const size = 114 - depth * 18 + seed * 14;
  const travelWidth = Math.max(
    width * 0.12,
    Math.min(
      width * (0.38 + seed * 0.08),
      width * 0.5 - size * 0.62 - 24,
    ),
  );
  const turnRadius = Math.min(size * 0.3 + depth * 7, travelWidth * 0.8);
  const pathLength =
    (travelWidth - turnRadius) * 4 + Math.PI * turnRadius * 2;

  return {
    seed,
    depth,
    lane: (index + 0.55) / 14,
    size,
    travelWidth,
    turnRadius,
    pathLength,
  };
}

function shaderSpriteRadius(size: number) {
  return Math.hypot(size * 0.509, size * 0.54);
}

describe("ocean fish motion", () => {
  it("contains index 13 at phase 0 in the reproduced 1440×952.8 viewport", () => {
    const height = 952.78125;
    const seabedHeight = 160;
    const fish = sceneFish(13, 1440);
    const pose = sampleFishTrack(
      fish.seed * fish.pathLength,
      fish.travelWidth,
      fish.turnRadius,
    );
    const centerY = getFishVerticalPosition({
      height,
      seabedHeight,
      lane: fish.lane,
      turnRadius: fish.turnRadius,
      size: fish.size,
      pathOffsetY: pose.y,
      driftPhase: fish.seed * 8,
    });

    expect(pose.y).toBeCloseTo(fish.turnRadius, 10);
    expect(centerY + shaderSpriteRadius(fish.size)).toBeLessThanOrEqual(height);
  });

  it.each([
    { width: 320, height: 720, seabedHeight: 106.666667 },
    { width: 390, height: 844, seabedHeight: 106.666667 },
    { width: 768, height: 1024, seabedHeight: 106.666667 },
    { width: 1440, height: 952.78125, seabedHeight: 160 },
  ])("bounds all 14 fish at $width×$height", (layout) => {
    Array.from({ length: 14 }, (_, index) => sceneFish(index, layout.width)).forEach(
      (fish) => {
        const straightLength = (fish.travelWidth - fish.turnRadius) * 2;
        const arcLength = Math.PI * fish.turnRadius;
        const pathOffsets = [
          sampleFishTrack(0, fish.travelWidth, fish.turnRadius).y,
          sampleFishTrack(
            straightLength + arcLength,
            fish.travelWidth,
            fish.turnRadius,
          ).y,
        ];

        pathOffsets.forEach((pathOffsetY) => {
          [-Math.PI / 2, Math.PI / 2].forEach((driftPhase) => {
            const centerY = getFishVerticalPosition({
              height: layout.height,
              seabedHeight: layout.seabedHeight,
              lane: fish.lane,
              turnRadius: fish.turnRadius,
              size: fish.size,
              pathOffsetY,
              driftPhase,
            });
            const radius = shaderSpriteRadius(fish.size);

            expect(centerY - radius).toBeGreaterThanOrEqual(
              layout.seabedHeight,
            );
            expect(centerY + radius).toBeLessThanOrEqual(layout.height);
          });
        });
      },
    );
  });

  it("keeps position and tangent continuous across capsule seams", () => {
    const halfWidth = 80;
    const radius = 20;
    const straightLength = (halfWidth - radius) * 2;
    const arcLength = Math.PI * radius;
    const seams = [
      { distance: straightLength, x: 60, y: 20, velocityX: 1, velocityY: 0 },
      {
        distance: straightLength + arcLength,
        x: 60,
        y: -20,
        velocityX: -1,
        velocityY: 0,
      },
      {
        distance: straightLength * 2 + arcLength,
        x: -60,
        y: -20,
        velocityX: -1,
        velocityY: 0,
      },
      {
        distance: straightLength * 2 + arcLength * 2,
        x: -60,
        y: 20,
        velocityX: 1,
        velocityY: 0,
      },
    ];

    seams.forEach((seam) => {
      const at = sampleFishTrack(seam.distance, halfWidth, radius);
      const before = sampleFishTrack(seam.distance - 0.001, halfWidth, radius);
      const after = sampleFishTrack(seam.distance + 0.001, halfWidth, radius);

      expect(at.x).toBeCloseTo(seam.x, 10);
      expect(at.y).toBeCloseTo(seam.y, 10);
      expect(at.velocityX).toBeCloseTo(seam.velocityX, 10);
      expect(at.velocityY).toBeCloseTo(seam.velocityY, 10);
      expect(before.x).toBeCloseTo(seam.x, 2);
      expect(before.y).toBeCloseTo(seam.y, 2);
      expect(before.velocityX).toBeCloseTo(seam.velocityX, 2);
      expect(before.velocityY).toBeCloseTo(seam.velocityY, 2);
      expect(after.x).toBeCloseTo(seam.x, 2);
      expect(after.y).toBeCloseTo(seam.y, 2);
      expect(after.velocityX).toBeCloseTo(seam.velocityX, 2);
      expect(after.velocityY).toBeCloseTo(seam.velocityY, 2);
    });
  });

  it("keeps the capsule’s right and left turn midpoints smooth", () => {
    const halfWidth = 80;
    const radius = 20;
    const straightLength = (halfWidth - radius) * 2;
    const arcLength = Math.PI * radius;
    const rightTurn = sampleFishTrack(
      straightLength + arcLength / 2,
      halfWidth,
      radius,
    );
    const leftTurn = sampleFishTrack(
      straightLength * 2 + (arcLength * 3) / 2,
      halfWidth,
      radius,
    );

    expect(rightTurn.x).toBeCloseTo(80, 10);
    expect(rightTurn.y).toBeCloseTo(0, 10);
    expect(rightTurn.velocityX).toBeCloseTo(0, 10);
    expect(rightTurn.velocityY).toBeCloseTo(-1, 10);
    expect(leftTurn.x).toBeCloseTo(-80, 10);
    expect(leftTurn.y).toBeCloseTo(0, 10);
    expect(leftTurn.velocityX).toBeCloseTo(0, 10);
    expect(leftTurn.velocityY).toBeCloseTo(1, 10);
  });
});
