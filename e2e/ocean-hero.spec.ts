import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function waitForOceanImages(page: Page) {
  await expect.poll(() => page.locator("#home-hero img").evaluateAll((images) =>
    images.filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
}

test("ocean hero reuses the daytime artwork through a gradual night transition", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("link", { name: "Explore Sabame" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  const brand = page.getByRole("link", { name: "Sabame home", exact: true }).locator("img");
  await expect(brand).toHaveAttribute("src", /sabame-mark/);
  await expect.poll(() => brand.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("href", /icon\.png/);
  const iconResponse = await page.request.get((await icon.getAttribute("href"))!);
  expect(iconResponse.ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-icon\.png/);
  await expect(page.getByTestId("ocean-fish")).toHaveCount(2);
  const background = page.getByTestId("ocean-background");
  const image = background.locator("img");
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const originalSource = await image.getAttribute("src");
  expect(originalSource).toContain("ocean-clouds.webp");
  const lightFilter = await background.evaluate((el) => getComputedStyle(el).filter);
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toBeVisible();
  await expect(page.getByText(/Good anime brighter days/i)).toHaveCount(0);
  await expect.poll(() => page.getByTestId("ocean-card").evaluateAll((cards) =>
    cards.every((card) => Number(getComputedStyle(card).opacity) === 1),
  )).toBe(true);
  await expect(page.getByRole("button", { name: /(?:Pause|Resume) (?:ocean animation|motion)/i })).toHaveCount(0);
  await expect.poll(() => page.getByTestId("ocean-card").evaluateAll((cards) =>
    cards.map((card) => ({ opacity: getComputedStyle(card).opacity, display: getComputedStyle(card).display })),
  )).toEqual(Array.from({ length: 5 }, () => ({ opacity: "1", display: "block" })));
  await waitForOceanImages(page);
  await page.screenshot({ path: "test-results/ocean-day.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  const themeButton = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect.poll(() => background.evaluate((el) => el.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
  await background.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
  expect(await background.evaluate((el) => getComputedStyle(el).filter)).not.toBe(lightFilter);
  await expect(image).toHaveAttribute("src", originalSource!);
  await page.locator("#home-hero").evaluate(async (el) => {
    await Promise.all(el.getAnimations({ subtree: true })
      .filter((animation) => animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished));
  });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/ocean-night.png", fullPage: true });
  await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await background.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
  expect(await background.evaluate((el) => getComputedStyle(el).filter)).toBe(lightFilter);
  await expect(image).toHaveAttribute("src", originalSource!);
});

test("wide ocean preserves the illustration aspect ratio", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await waitForOceanImages(page);
  const hero = await page.locator("#home-hero").boundingBox();
  expect(hero!.width / hero!.height).toBeCloseTo(1586 / 992, 1);
  await expect(page.getByTestId("ocean-card")).toHaveCount(5);
  const waterCuts = await page.locator('.ocean-hero__poster[class*="--surface-"]').evaluateAll((cards) => cards.map((card) => {
    const cut = getComputedStyle(card.querySelector(".ocean-hero__poster-water")!).clipPath;
    const inset = Number.parseFloat(cut.slice("inset(".length));
    return (card as HTMLElement).offsetTop + inset;
  }));
  for (const cut of waterCuts) expect(Math.abs(cut - hero!.height * 0.5)).toBeLessThan(1);
  await page.screenshot({ path: "test-results/ocean-wide.png", fullPage: true });
});

test("water surface and underwater lighting animate and respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.goto("/");
  const canvas = page.getByTestId("ocean-water-canvas");
  await expect(canvas).toBeVisible();
  const sample = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const regions = [0.50, 0.70];
    return regions.map((depth) => {
      const pixels = context.getImageData(0, Math.floor(element.height * depth), element.width, Math.max(1, Math.floor(element.height * 0.12))).data;
      let hash = 0;
      let alpha = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        hash = (hash * 31 + pixels[index] + pixels[index + 1] + pixels[index + 2] + pixels[index + 3]) | 0;
        alpha += pixels[index + 3];
      }
      return { hash, alpha };
    });
  });
  await expect.poll(async () => (await sample()).every(({ alpha }) => alpha > 0)).toBe(true);
  const initial = await sample();
  await expect.poll(async () => (await sample()).every(({ hash }, index) => hash !== initial[index].hash)).toBe(true);
  const paintedSurface = page.locator(".ocean-hero__surface-art");
  const firstTransform = await paintedSurface.evaluate((el) => getComputedStyle(el).transform);
  await expect.poll(() => paintedSurface.evaluate((el) => getComputedStyle(el).transform)).not.toBe(firstTransform);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute("data-paused", "true");
  expect(await page.locator("#home-hero").evaluate((el) => el.getAnimations({ subtree: true })
    .every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations !== Infinity))).toBe(true);
  const stopped = await sample();
  await page.waitForTimeout(200);
  expect(await sample()).toEqual(stopped);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(async () => (await sample()).some(({ hash }, index) => hash !== stopped[index].hash)).toBe(true);
});

test("mobile ocean honors reduced motion and allows normal page scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await waitForOceanImages(page);
  const scene = page.getByTestId("ocean-scene");
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await scene.evaluate((el) => el.getAnimations({ subtree: true }).every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations !== Infinity))).toBe(true);
  await page.screenshot({ path: "test-results/ocean-mobile.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(scene).toHaveAttribute("data-paused", "true");
  const themeButton = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await themeButton.click();
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toHaveCSS("color", "rgb(243, 248, 255)");
  await page.screenshot({ path: "test-results/ocean-mobile-night.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.mouse.move(195, 600);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Take a look" }).click();
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeInViewport();
});
