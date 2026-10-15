type FishTrackPose = {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
};

type FishVerticalPositionInput = {
  height: number;
  seabedHeight: number;
  lane: number;
  turnRadius: number;
  size: number;
  pathOffsetY: number;
  driftPhase: number;
};

const FISH_DRIFT_AMPLITUDE = 7;

function fishSpriteRadius(size: number) {
  return Math.hypot(size * 0.509, size * 0.54);
}

export function sampleFishTrack(
  distance: number,
  halfWidth: number,
  radius: number,
): FishTrackPose {
  const straightLength = (halfWidth - radius) * 2;
  const arcLength = Math.PI * radius;
  const pathLength = (straightLength + arcLength) * 2;
  const progress = distance % pathLength;
  const end = halfWidth - radius;
  if (progress < straightLength) {
    return { x: -end + progress, y: radius, velocityX: 1, velocityY: 0 };
  }
  if (progress < straightLength + arcLength) {
    const angle = (progress - straightLength) / radius;
    return {
      x: end + Math.sin(angle) * radius,
      y: Math.cos(angle) * radius,
      velocityX: Math.cos(angle),
      velocityY: -Math.sin(angle),
    };
  }
  if (progress < straightLength * 2 + arcLength) {
    return {
      x: end - (progress - straightLength - arcLength),
      y: -radius,
      velocityX: -1,
      velocityY: 0,
    };
  }
  const angle = (progress - straightLength * 2 - arcLength) / radius;
  return {
    x: -end - Math.sin(angle) * radius,
    y: -Math.cos(angle) * radius,
    velocityX: -Math.cos(angle),
    velocityY: Math.sin(angle),
  };
}

export function getFishVerticalPosition({
  height,
  seabedHeight,
  lane,
  turnRadius,
  size,
  pathOffsetY,
  driftPhase,
}: FishVerticalPositionInput) {
  const laneInset =
    turnRadius + FISH_DRIFT_AMPLITUDE + fishSpriteRadius(size);
  const laneHeight = height - seabedHeight - laneInset * 2;
  return (
    seabedHeight +
    laneInset +
    lane * laneHeight +
    pathOffsetY +
    Math.sin(driftPhase) * FISH_DRIFT_AMPLITUDE
  );
}
