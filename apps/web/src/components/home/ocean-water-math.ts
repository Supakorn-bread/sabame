const TAU = Math.PI * 2;

type SwellProfile = {
  amplitude: number;
  direction: 1 | -1;
  harmonicPhase: number;
  phase: number;
  speed: number;
  wavelengthRatio: number;
};

const swellProfiles: readonly SwellProfile[] = [
  { amplitude: 13.2, direction: 1, harmonicPhase: 0.35, phase: 0.42, speed: 0.38, wavelengthRatio: 0.34 },
  { amplitude: 9.4, direction: -1, harmonicPhase: -0.5, phase: -0.8, speed: 0.52, wavelengthRatio: 0.24 },
  { amplitude: 3.4, direction: 1, harmonicPhase: 0.9, phase: 1.6, speed: 0.32, wavelengthRatio: 0.46 },
  { amplitude: 2.2, direction: -1, harmonicPhase: -0.8, phase: 2.4, speed: 0.25, wavelengthRatio: 0.62 },
];

function getSwellTravelDistance(time: number, width: number, layer: number) {
  const profile = swellProfiles[layer];
  if (!profile) return 0;

  const wavelength = Math.max(118, width * profile.wavelengthRatio);
  return time * profile.direction * profile.speed * wavelength / TAU;
}

/** Returns visible foam-crest positions from stable world indices and continuous travel. */
export function getSwellGlintStarts(width: number, time: number, spacing: number, layer: number) {
  if (spacing <= 0 || width <= 0 || !swellProfiles[layer]) return [];

  const travel = getSwellTravelDistance(time, width, layer);
  const firstCrest = Math.floor((-travel - spacing) / spacing);
  const lastCrest = Math.ceil((width - travel) / spacing) + 1;
  const starts: number[] = [];

  for (let crest = firstCrest; crest <= lastCrest; crest++) {
    const baseX = crest * spacing + travel;
    starts.push(baseX + Math.sin(baseX * 0.013 + layer) * 13);
  }

  return starts;
}

/** Four measured swell profiles with two broad layers moving in opposite directions. */
export function sampleOceanSwell(x: number, width: number, time: number, layer: number) {
  const profile = swellProfiles[layer];
  if (!profile) return 0;

  const widthScale = Math.max(0.58, Math.min(width / 960, 1));
  const wavelength = Math.max(118, width * profile.wavelengthRatio);
  const angle = (x / wavelength) * TAU + profile.phase - time * profile.direction * profile.speed;
  const gentleHarmonics = Math.sin(angle)
    + Math.sin(angle * 2 + profile.harmonicPhase) * 0.14
    + Math.sin(angle * 3 - profile.harmonicPhase * 0.6) * 0.035;

  return gentleHarmonics * profile.amplitude * widthScale;
}
