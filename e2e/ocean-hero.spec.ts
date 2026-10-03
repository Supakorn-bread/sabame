import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function waitForHeroImages(page: Page) {
  await expect.poll(() => page.locator("#home-hero img").evaluateAll((images) =>
    images.filter((image) => image.getBoundingClientRect().width > 0)
      .every((image) => (image as HTMLImageElement).complete && (image as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
}

async function waitForHeroVisualSettled(page: Page) {
  await page.locator("#home-hero").evaluate(async (hero) => {
    const finiteAnimations = hero.getAnimations({ subtree: true }).filter((animation) =>
      animation.playState === "running" && animation.effect?.getTiming().iterations !== Infinity,
    );
    await Promise.all(finiteAnimations.map((animation) => animation.finished.catch(() => undefined)));
  });
  await expect.poll(() => page.getByTestId("ocean-card").evaluateAll((cards) =>
    cards.every((card) => Number(getComputedStyle(card).opacity) === 1),
  )).toBe(true);
}

async function selectTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: /^Theme:/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = (await page.locator("html").getAttribute("class")) ?? "";
    if (current.includes(theme)) return;
    await button.click();
  }
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
}

test("illustrated ocean hero keeps its copy, routes, and reversible day/night scene", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toBeVisible();
  await expect(page.getByText("Your next watch starts here")).toBeVisible();
  await expect(page.getByText("Discover anime you’ll love. Keep your watchlist, episode progress, and next story together.")).toBeVisible();

  const hero = page.locator("#home-hero");
  const background = page.getByTestId("ocean-background");
  const skyImage = background.locator("img");
  await expect(skyImage).toHaveCount(0);
  await expect(hero).toHaveAttribute("data-water-renderer", "canvas");
  await expect(page.getByTestId("ocean-static-waterline")).toBeHidden();
  await expect(page.getByTestId("ocean-card")).toHaveCount(3);
  await expect(page.getByTestId("ocean-fish")).toHaveCount(2);
  await waitForHeroImages(page);

  const primaryCta = page.getByRole("link", { name: "Explore Sabame" });
  const secondaryCta = page.getByRole("link", { name: "Take a look" });
  await expect(primaryCta).toHaveAttribute("href", "/login");
  await expect(secondaryCta).toHaveAttribute("href", "#features");
  await expect(primaryCta).toHaveCSS("cursor", "pointer");
  await primaryCta.click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await waitForHeroImages(page);

  const brand = page.getByRole("link", { name: "Sabame home", exact: true }).locator("img");
  await expect(brand).toHaveAttribute("src", /sabame-mark/);
  await expect.poll(() => brand.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  const icon = page.locator('link[rel="icon"]');
  await expect(icon).toHaveAttribute("href", /icon\.png/);
  const iconResponse = await page.request.get((await icon.getAttribute("href"))!);
  expect(iconResponse.ok()).toBe(true);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute("href", /apple-icon\.png/);
  await expect(page.getByRole("button", { name: /(?:Pause|Resume) (?:ocean animation|motion)/i })).toHaveCount(0);
  await waitForHeroVisualSettled(page);
  await page.screenshot({ path: "test-results/ocean-day.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const nightTint = page.locator(".ocean-hero__night-tint");
  const lightFilter = await background.evaluate((element) => getComputedStyle(element).filter);
  await selectTheme(page, "dark");
  await expect(nightTint).toHaveCSS("opacity", "1");
  await expect(background).not.toHaveCSS("filter", lightFilter);
  await expect(page.locator(".ocean-hero__moon")).toBeVisible();
  await waitForHeroVisualSettled(page);
  await page.screenshot({ path: "test-results/ocean-night.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  const originalPoster = await page.getByTestId("ocean-card").first().locator("img").getAttribute("src");
  await selectTheme(page, "light");
  await expect(nightTint).toHaveCSS("opacity", "0");
  await expect(page.getByTestId("ocean-card").first().locator("img")).toHaveAttribute("src", originalPoster!);
});

test("desktop hero is bounded, aligns to navigation, and keeps cards clear of copy", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await waitForHeroImages(page);

  const hero = page.locator("#home-hero");
  const brand = page.getByRole("link", { name: "Sabame home", exact: true });
  const measurements = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>("#home-hero")!;
    const content = document.querySelector<HTMLElement>(".ocean-hero__content")!;
    const brand = document.querySelector<HTMLElement>('.ocean-home-header a[aria-label="Sabame home"]')!;
    const heroRect = hero.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const brandRect = brand.getBoundingClientRect();
    const waterlineMarker = hero.querySelector<HTMLElement>("[data-testid=ocean-waterline-marker]")!;
    const cards = Array.from(hero.querySelectorAll<HTMLElement>("[data-testid='ocean-card']"));
    return {
      heroHeight: heroRect.height,
      contentTop: contentRect.top - heroRect.top,
      contentBottom: contentRect.bottom - heroRect.top,
      contentLeft: contentRect.left,
      contentRight: contentRect.right,
      brandLeft: brandRect.left,
      waterline: waterlineMarker.getBoundingClientRect().top - heroRect.top,
      cardCuts: cards.map((card) => {
        const top = card.offsetTop;
        const cut = Number.parseFloat(getComputedStyle(card).getPropertyValue("--ocean-card-cut")) * heroRect.height / 100;
        return { top, cut };
      }),
      cardRects: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
    };
  });

  expect(measurements.heroHeight).toBeGreaterThanOrEqual(760);
  expect(measurements.heroHeight).toBeLessThanOrEqual(900);
  expect(measurements.contentTop).toBeGreaterThanOrEqual(112);
  expect(Math.abs(measurements.contentLeft - measurements.brandLeft)).toBeLessThan(2);
  expect(measurements.cardCuts).toHaveLength(3);
  for (const { top, cut } of measurements.cardCuts) {
    expect(Math.abs(top + cut - measurements.waterline)).toBeLessThan(3);
  }
  for (const card of measurements.cardRects) {
    const overlapsCopy = card.left < measurements.contentRight
      && card.right > measurements.contentLeft
      && card.top < measurements.contentBottom
      && card.bottom > measurements.contentTop;
    expect(overlapsCopy).toBe(false);
  }

  await expect(hero).toHaveCSS("--ocean-waterline", "66%");
  await expect(page.getByTestId("ocean-card")).toHaveCount(3);
  await page.screenshot({ path: "test-results/ocean-wide.png", fullPage: true });
  await expect(brand).toBeVisible();
});

test("moving filled waves animate, fill the lower ocean, and respect reduced motion and offscreen pauses", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "no-preference", colorScheme: "light" });
  await page.goto("/");
  const canvas = page.getByTestId("ocean-water-canvas");
  const hero = page.locator("#home-hero");
  await expect(canvas).toBeVisible();
  await expect(hero).toHaveAttribute("data-water-renderer", "canvas");

  const sample = () => canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const canvasRect = element.getBoundingClientRect();
    const waterlineMarker = document.querySelector<HTMLElement>("[data-testid=ocean-waterline-marker]")!;
    const line = (waterlineMarker.getBoundingClientRect().top - canvasRect.top) / canvasRect.height;
    return [line - 0.035, line + 0.18].map((depth) => {
      const pixels = context.getImageData(0, Math.floor(element.height * depth), element.width, Math.max(1, Math.floor(element.height * 0.07))).data;
      let hash = 0;
      let alpha = 0;
      let samples = 0;
      for (let index = 0; index < pixels.length; index += 4 * 31) {
        hash = (hash * 31 + pixels[index]! + pixels[index + 1]! + pixels[index + 2]! + pixels[index + 3]!) | 0;
        alpha += pixels[index + 3]!;
        samples += 1;
      }
      return { hash, opaqueShare: pixels.length ? alpha / (samples * 255) : 0 };
    });
  });

  await expect.poll(async () => (await sample())[0]!.opaqueShare).toBeGreaterThan(0.25);
  const initial = await sample();
  await expect.poll(async () => (await sample())[0]!.hash).not.toBe(initial[0]!.hash);
  await expect.poll(async () => (await sample())[1]!.hash).not.toBe(initial[1]!.hash);

  const lowerOcean = await canvas.evaluate((element: HTMLCanvasElement) => {
    const context = element.getContext("2d")!;
    const pixel = context.getImageData(Math.floor(element.width / 2), Math.floor(element.height * 0.93), 1, 1).data;
    return { red: pixel[0], green: pixel[1], blue: pixel[2], alpha: pixel[3] };
  });
  expect(lowerOcean.alpha).toBe(255);
  expect(lowerOcean.blue).toBeGreaterThan(lowerOcean.red);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute("data-paused", "true");
  expect(await page.locator("#home-hero").evaluate((element) => element.getAnimations({ subtree: true })
    .every((animation) => animation.playState !== "running" || animation.effect?.getTiming().iterations !== Infinity))).toBe(true);
  const stopped = await sample();
  await page.waitForTimeout(200);
  expect(await sample()).toEqual(stopped);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect.poll(async () => (await sample())[0]!.hash).not.toBe(stopped[0]!.hash);
  const scene = page.getByTestId("ocean-scene");
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
  await expect.poll(() => hero.evaluate((element) => element.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
  await expect(scene).toHaveAttribute("data-paused", "true");
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(scene).toHaveAttribute("data-paused", "false");
});

test("mobile copy stays readable above the water scene at 320px and 200% text size", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  await waitForHeroImages(page);
  const scene = page.getByTestId("ocean-scene");
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toBeVisible();
  await expect(page.getByTestId("ocean-card")).toHaveCount(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const mobileCopyLayout = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>("#home-hero")!;
    const content = document.querySelector<HTMLElement>(".ocean-hero__content")!;
    const cards = Array.from(hero.querySelectorAll<HTMLElement>("[data-testid='ocean-card']"))
      .filter((card) => getComputedStyle(card).display !== "none");
    const heroRect = hero.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const waterlineMarker = hero.querySelector<HTMLElement>("[data-testid=ocean-waterline-marker]")!;
    const waterline = waterlineMarker.getBoundingClientRect().top - heroRect.top;
    return {
      contentBottom: contentRect.bottom - heroRect.top,
      waterline,
      cards: cards.map((card) => {
        const rect = card.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
      content: { left: contentRect.left, right: contentRect.right, top: contentRect.top, bottom: contentRect.bottom },
    };
  });
  expect(mobileCopyLayout.contentBottom).toBeLessThan(mobileCopyLayout.waterline - 20);
  for (const card of mobileCopyLayout.cards) {
    const overlapsCopy = card.left < mobileCopyLayout.content.right
      && card.right > mobileCopyLayout.content.left
      && card.top < mobileCopyLayout.content.bottom
      && card.bottom > mobileCopyLayout.content.top;
    expect(overlapsCopy).toBe(false);
  }

  await page.screenshot({ path: "test-results/ocean-mobile.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await expect(scene).toHaveAttribute("data-paused", "true");
  await selectTheme(page, "dark");
  await expect(page.getByRole("heading", { name: "Dive into your next story." })).toHaveCSS("color", "rgb(243, 248, 255)");
  await waitForHeroVisualSettled(page);
  await page.screenshot({ path: "test-results/ocean-mobile-night.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const zoomLayout = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>("#home-hero")!;
    const content = document.querySelector<HTMLElement>(".ocean-hero__content")!;
    const heroRect = hero.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    const waterlineMarker = hero.querySelector<HTMLElement>("[data-testid=ocean-waterline-marker]")!;
    const waterline = waterlineMarker.getBoundingClientRect().top - heroRect.top;
    const cards = Array.from(hero.querySelectorAll<HTMLElement>("[data-testid=ocean-card]"))
      .filter((card) => getComputedStyle(card).display !== "none")
      .map((card) => {
        const rect = card.getBoundingClientRect();
        return {
          left: rect.left - heroRect.left,
          right: rect.right - heroRect.left,
          top: rect.top - heroRect.top,
          bottom: rect.bottom - heroRect.top,
        };
      });
    return { contentBottom: contentRect.bottom - heroRect.top, waterline, heroHeight: heroRect.height, cards };
  });
  expect(zoomLayout.contentBottom).toBeLessThan(zoomLayout.waterline - 12);
  for (const card of zoomLayout.cards) {
    expect(card.top).toBeGreaterThan(zoomLayout.contentBottom);
    expect(card.bottom).toBeLessThanOrEqual(zoomLayout.heroHeight);
    expect(card.left).toBeGreaterThanOrEqual(0);
    expect(card.right).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: "test-results/ocean-mobile-zoom.png", fullPage: true });

  await page.mouse.move(160, 600);
  await page.mouse.wheel(0, 350);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.getByRole("link", { name: "Take a look" }).click();
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeInViewport();
});

test("static CSS and SVG fallback keeps an ocean scene when Canvas is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: () => null,
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/");
  const hero = page.locator("#home-hero");
  await expect(hero).toHaveAttribute("data-water-renderer", "fallback");
  await expect(page.getByTestId("ocean-static-waterline")).toBeVisible();
  await expect(page.getByTestId("ocean-water-canvas")).toBeVisible();
  const fallback = await page.locator(".ocean-hero__water").evaluate((element) => ({
    background: getComputedStyle(element).backgroundImage,
    crest: getComputedStyle(element.querySelector("svg")!).visibility,
  }));
  expect(fallback.background).toContain("linear-gradient");
  expect(fallback.crest).toBe("visible");
});
