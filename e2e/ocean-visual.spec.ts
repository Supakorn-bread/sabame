import { expect, test } from "@playwright/test";

const checkpoints = [
  {
    name: "fish-straight.png",
    elapsed: 0,
    clip: { x: 1160, y: 440, width: 250, height: 180 },
  },
  {
    name: "bubble-origin.png",
    elapsed: 1700,
    clip: { x: 265, y: 730, width: 80, height: 145 },
  },
  {
    name: "seabed-plants.png",
    elapsed: 1700,
    threshold: 0.02,
    clip: { x: 390, y: 770, width: 210, height: 129 },
  },
  {
    name: "fish-mid-turn.png",
    elapsed: 4700,
    clip: { x: 1160, y: 440, width: 250, height: 180 },
  },
];

test("depth fish turn, rooted plants, and bubbles keep their rendered appearance", async ({
  page,
}, testInfo) => {
  testInfo.snapshotSuffix = "";
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/prototype/ocean");
  const region = page.getByTestId("ocean-depth-region");
  const scene = page.getByTestId("ocean-depth-scene");
  await expect(region).toHaveAttribute("data-water-status", "ready", {
    timeout: 15_000,
  });
  await expect(scene).toHaveAttribute("data-paused", "true");
  await page.evaluate(async () => {
    await document.fonts.ready;
    window.scrollTo(0, document.documentElement.scrollHeight);
  });
  await expect(page.getByTestId("ocean-seabed")).toBeInViewport();
  await page.clock.install({ time: new Date("2026-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2026-01-01T00:00:01Z"));

  let elapsed = 0;
  for (const checkpoint of checkpoints) {
    if (checkpoint.elapsed > elapsed) {
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(scene).toHaveAttribute("data-paused", "false");
      await page.clock.runFor(checkpoint.elapsed - elapsed);
      elapsed = checkpoint.elapsed;
    }
    await expect.soft(page).toHaveScreenshot(checkpoint.name, {
      clip: checkpoint.clip,
      animations: "disabled",
      threshold: checkpoint.threshold ?? 0.1,
      maxDiffPixels: 8,
    });
  }
});
