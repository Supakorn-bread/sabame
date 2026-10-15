import { expect, test, type Locator, type Page } from "@playwright/test";

async function expectThreeReady(page: Page) {
  const hero = page.locator("#home-hero");
  await expect(hero).toHaveAttribute("data-selected-renderer", "three");
  await expect(hero).toHaveAttribute("data-renderer-ready", "true", {
    timeout: 15_000,
  });
  await expect(hero).toHaveAttribute("data-water-renderer", "three");
  const canvas = page.getByTestId("ocean-three-canvas");
  await expect(canvas).toHaveCSS("visibility", "visible");
  expect(
    await canvas.evaluate((element: HTMLCanvasElement) =>
      Boolean(element.getContext("webgl2") ?? element.getContext("webgl")),
    ),
  ).toBe(true);
  await expect(page.getByTestId("ocean-prototype-status")).toHaveText(
    "Three.js water active",
  );
}

async function expectOriginalReady(page: Page) {
  const hero = page.locator("#home-hero");
  await expect(hero).toHaveAttribute("data-selected-renderer", "original");
  await expect(hero).toHaveAttribute("data-renderer-ready", "true");
  await expect(hero).toHaveAttribute("data-water-renderer", "canvas");
  await expect(page.getByTestId("ocean-water-canvas")).toBeVisible();
  await expect(page.getByTestId("ocean-prototype-status")).toHaveText(
    "Original 2D water active",
  );
}

async function expectMascotRemoved(page: Page) {
  await expect(page.getByTestId("ocean-mascot")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /3D mascot/i })).toHaveCount(0);
}

async function expectDepthReady(page: Page) {
  const region = page.getByTestId("ocean-depth-region");
  await expect(region).toHaveAttribute("data-water-status", "ready", {
    timeout: 15_000,
  });
  await expect(region).toHaveAttribute("data-renderer", "three");
  await expect(page.getByTestId("ocean-depth-scene")).toBeVisible();
  await expect(page.getByTestId("ocean-depth-canvas")).toBeVisible();
}

async function waitForHeroImages(page: Page) {
  await expect
    .poll(() =>
      page.locator("#home-hero img").evaluateAll(
        (images) =>
          images.length > 0 &&
          images.every((image) => {
            const element = image as HTMLImageElement;
            return element.complete && element.naturalWidth > 0;
          }),
      ),
    )
    .toBe(true);
}

async function waitForHeroVisualSettled(page: Page) {
  await page.locator("#home-hero").evaluate(async (hero) => {
    const stage = hero.parentElement ?? hero;
    const finiteAnimations = stage
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getTiming().iterations !== Infinity,
      );
    await Promise.all(
      finiteAnimations.map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
  });
  await expect
    .poll(() =>
      page
        .getByTestId("ocean-card")
        .evaluateAll((cards) =>
          cards.every((card) => Number(getComputedStyle(card).opacity) === 1),
        ),
    )
    .toBe(true);
}

async function waitForPageVisualSettled(page: Page) {
  await page.evaluate(async () => {
    const finiteAnimations = document.documentElement
      .getAnimations({ subtree: true })
      .filter(
        (animation) =>
          animation.playState === "running" &&
          animation.effect?.getTiming().iterations !== Infinity,
      );
    await Promise.all(
      finiteAnimations.map((animation) =>
        animation.finished.catch(() => undefined),
      ),
    );
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
}

async function expectSceneScreenshotToChange(sceneCanvas: Locator) {
  const firstScene = await sceneCanvas.screenshot();
  await expect
    .poll(
      async () => Buffer.compare(firstScene, await sceneCanvas.screenshot()),
      { timeout: 5_000 },
    )
    .not.toBe(0);
}

async function screenshotVisibleDepthPatch(page: Page, canvas: Locator) {
  const clip = await canvas.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, window.innerWidth - 96, rect.left);
    const right = Math.min(window.innerWidth, rect.right);
    const top = Math.max(0, rect.top);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    return {
      x: left,
      y: top,
      width: Math.min(96, right - left),
      height: Math.min(120, bottom - top),
    };
  });
  expect(clip.width).toBeGreaterThanOrEqual(32);
  expect(clip.height).toBeGreaterThanOrEqual(32);
  return page.screenshot({ clip });
}

async function selectTheme(page: Page, theme: "light" | "dark") {
  const themeClassIsActive = () =>
    page
      .locator("html")
      .evaluate(
        (element, expectedTheme) => element.classList.contains(expectedTheme),
        theme,
      );
  const button = page.getByRole("button", { name: /^Theme:/ });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (await themeClassIsActive()) break;
    await button.click();
  }

  await expect.poll(themeClassIsActive).toBe(true);
  await expect(page.locator(".ocean-hero__night-tint")).toHaveCSS(
    "opacity",
    theme === "dark" ? "1" : "0",
  );
}

test("Three.js prototype renders the shared hero in day, night, mobile, and ultrawide views", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const generatedSeabedRequests: string[] = [];
  page.on("request", (request) => {
    if (
      new URL(request.url()).pathname ===
      "/images/prototype/anime-seabed-v1.png"
    ) {
      generatedSeabedRequests.push(request.url());
    }
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await expectDepthReady(page);
  await waitForHeroImages(page);
  expect(generatedSeabedRequests).toEqual([]);
  await waitForHeroVisualSettled(page);
  await expect(
    page.getByRole("link", { name: "Sabame home", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Dive into your next story." }),
  ).toBeVisible();
  await expect(page.getByText("Your next watch starts here")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore Sabame" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Take a look" })).toHaveAttribute(
    "href",
    "#features",
  );
  await expect(page.getByRole("button", { name: "Three.js" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Original 2D" }),
  ).toHaveAttribute("aria-pressed", "false");
  await expectSceneScreenshotToChange(page.getByTestId("ocean-three-canvas"));
  await page
    .locator("#home-hero")
    .screenshot({ path: "test-results/ocean-prototype-three-desktop-day.png" });

  await selectTheme(page, "dark");
  await waitForHeroVisualSettled(page);
  await page.locator("#home-hero").screenshot({
    path: "test-results/ocean-prototype-three-desktop-dark.png",
  });

  await selectTheme(page, "light");
  await page.setViewportSize({ width: 390, height: 844 });
  await waitForHeroVisualSettled(page);
  await expect(page.getByLabel("Ocean prototype controls")).toBeVisible();
  await page
    .locator("#home-hero")
    .screenshot({ path: "test-results/ocean-prototype-three-mobile.png" });

  await page.setViewportSize({ width: 320, height: 844 });
  const compactLayout = await page.evaluate(() => {
    const controls = document.querySelector<HTMLElement>(
      "[aria-label='Ocean prototype controls']",
    )!;
    const hero = document.querySelector<HTMLElement>("#home-hero")!;
    const content = document.querySelector<HTMLElement>(
      ".ocean-hero__content",
    )!;
    const controlRect = controls.getBoundingClientRect();
    const heroRect = hero.getBoundingClientRect();
    const contentRect = content.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      controlsLeft: controlRect.left,
      controlsRight: controlRect.right,
      controlsTop: controlRect.top,
      heroBottom: heroRect.bottom,
      contentBottom: contentRect.bottom,
      actionTargets: Array.from(controls.querySelectorAll("button, a")).map(
        (target) => {
          const rect = target.getBoundingClientRect();
          return { width: rect.width, height: rect.height };
        },
      ),
    };
  });
  expect(compactLayout.documentWidth).toBeLessThanOrEqual(320);
  expect(compactLayout.controlsLeft).toBeGreaterThanOrEqual(0);
  expect(compactLayout.controlsRight).toBeLessThanOrEqual(320);
  expect(compactLayout.controlsTop).toBeGreaterThanOrEqual(
    compactLayout.heroBottom,
  );
  expect(compactLayout.controlsTop).toBeGreaterThan(
    compactLayout.contentBottom,
  );
  for (const target of compactLayout.actionTargets) {
    expect(target.width).toBeGreaterThanOrEqual(44);
    expect(target.height).toBeGreaterThanOrEqual(44);
  }
  await waitForHeroVisualSettled(page);
  await page
    .locator("#home-hero")
    .screenshot({ path: "test-results/ocean-prototype-three-mobile-320.png" });

  await page.setViewportSize({ width: 2560, height: 900 });
  await waitForHeroVisualSettled(page);
  await page
    .locator("#home-hero")
    .screenshot({ path: "test-results/ocean-prototype-three-ultrawide.png" });
});

test("floating gallery preference persists when switching renderers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await waitForHeroImages(page);

  const hero = page.locator("#home-hero");
  const galleryToggle = page.getByRole("button", { name: "Floating gallery" });
  await expectMascotRemoved(page);
  await expect(galleryToggle).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveAttribute("data-gallery-enabled", "true");
  await waitForHeroVisualSettled(page);
  await hero.screenshot({
    path: "test-results/ocean-prototype-gallery-enabled.png",
  });

  await galleryToggle.click();
  await expect(galleryToggle).toHaveAttribute("aria-pressed", "false");
  await expect(hero).toHaveAttribute("data-gallery-enabled", "false");
  await waitForHeroVisualSettled(page);
  await hero.screenshot({
    path: "test-results/ocean-prototype-gallery-still.png",
  });

  await page.getByRole("button", { name: "Original 2D" }).click();
  await expectOriginalReady(page);
  await expectMascotRemoved(page);
  await expect(galleryToggle).toBeDisabled();
  await expect(galleryToggle).toHaveAttribute("aria-pressed", "false");
  await expect(hero).toHaveAttribute("data-gallery-enabled", "false");

  await page.getByRole("button", { name: "Three.js" }).click();
  await expectThreeReady(page);
  await expectMascotRemoved(page);
  await expect(galleryToggle).toBeEnabled();
  await expect(galleryToggle).toHaveAttribute("aria-pressed", "false");
  await expect(hero).toHaveAttribute("data-gallery-enabled", "false");
});

test("Three.js prototype carries the deep ocean through features and footer across themes and screens", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await expectDepthReady(page);
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);

  const hero = page.locator("#home-hero");
  const footer = page.getByRole("contentinfo");
  const seabed = page.getByTestId("ocean-seabed");
  const footerLink = footer.getByRole("link", { name: "Enter the demo" });
  await expect(seabed).toBeVisible();
  await expect
    .poll(() =>
      seabed.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeCloseTo(160, 1);
  await expect(page.getByTestId("ocean-depth-fallback-fish")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "A home for your watchlist." }),
  ).toBeVisible();
  await expect(page.locator("#features").getByRole("article")).toHaveCount(3);
  await expect(footerLink).toHaveAttribute("href", "/login");
  const waterCoverage = await page.evaluate(() => {
    const regionRect = document
      .querySelector<HTMLElement>("[data-testid='ocean-depth-region']")!
      .getBoundingClientRect();
    const featureRect = document
      .querySelector<HTMLElement>("#features")!
      .getBoundingClientRect();
    const footerRect = document
      .querySelector<HTMLElement>("footer")!
      .getBoundingClientRect();
    const seabedRect = document
      .querySelector<HTMLElement>("[data-testid='ocean-seabed']")!
      .getBoundingClientRect();
    return {
      regionLeft: regionRect.left,
      regionRight: regionRect.right,
      regionTop: regionRect.top,
      regionBottom: regionRect.bottom,
      featuresLeft: featureRect.left,
      featuresRight: featureRect.right,
      featuresTop: featureRect.top,
      footerLeft: footerRect.left,
      footerRight: footerRect.right,
      footerBottom: footerRect.bottom,
      seabedLeft: seabedRect.left,
      seabedRight: seabedRect.right,
      seabedTop: seabedRect.top,
      seabedBottom: seabedRect.bottom,
    };
  });
  expect(waterCoverage.regionLeft).toBeLessThanOrEqual(
    waterCoverage.featuresLeft,
  );
  expect(waterCoverage.regionRight).toBeGreaterThanOrEqual(
    waterCoverage.featuresRight,
  );
  expect(waterCoverage.regionTop).toBeLessThanOrEqual(
    waterCoverage.featuresTop,
  );
  expect(waterCoverage.regionLeft).toBeLessThanOrEqual(
    waterCoverage.footerLeft,
  );
  expect(waterCoverage.regionRight).toBeGreaterThanOrEqual(
    waterCoverage.footerRight,
  );
  expect(waterCoverage.regionBottom).toBeGreaterThanOrEqual(
    waterCoverage.footerBottom,
  );
  expect(waterCoverage.seabedTop).toBeGreaterThanOrEqual(
    waterCoverage.footerBottom,
  );
  expect(waterCoverage.regionLeft).toBeLessThanOrEqual(
    waterCoverage.seabedLeft,
  );
  expect(waterCoverage.regionRight).toBeGreaterThanOrEqual(
    waterCoverage.seabedRight,
  );
  expect(waterCoverage.regionBottom).toBeGreaterThanOrEqual(
    waterCoverage.seabedBottom,
  );
  await waitForPageVisualSettled(page);
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-desktop-day.png",
    fullPage: true,
  });
  await seabed.screenshot({
    path: "test-results/ocean-prototype-seabed-closeup.png",
  });

  await page.setViewportSize({ width: 2560, height: 900 });
  await expect
    .poll(() =>
      seabed.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeCloseTo(284.44, 1);
  await waitForPageVisualSettled(page);
  await seabed.screenshot({
    path: "test-results/ocean-prototype-seabed-ultrawide.png",
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await selectTheme(page, "dark");
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForHeroVisualSettled(page);
  await waitForPageVisualSettled(page);
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-desktop-dark.png",
    fullPage: true,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      seabed.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeCloseTo(106.67, 1);
  await page.evaluate(() => window.scrollTo(0, 0));
  await waitForPageVisualSettled(page);
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-mobile-dark.png",
    fullPage: true,
  });
  await seabed.screenshot({
    path: "test-results/ocean-prototype-seabed-mobile-dark.png",
  });

  await page.setViewportSize({ width: 1440, height: 600 });
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(hero).not.toBeInViewport();
  await expect(page.getByTestId("ocean-depth-scene")).toHaveAttribute(
    "data-paused",
    "false",
  );
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-bottom.png",
  });

  await selectTheme(page, "light");
  await waitForPageVisualSettled(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expectDepthReady(page);
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-mobile.png",
    fullPage: true,
  });
});

test("renderer switching and pause freeze the active scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);

  const hero = page.locator("#home-hero");
  const threeCanvas = page.getByTestId("ocean-three-canvas");
  await expectMascotRemoved(page);
  await expectSceneScreenshotToChange(threeCanvas);
  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(
    page.getByRole("button", { name: "Resume motion" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(hero).toHaveAttribute("data-motion", "paused");
  await waitForHeroVisualSettled(page);
  const pausedThreeScene = await threeCanvas.screenshot();
  await page.waitForTimeout(180);
  expect(await threeCanvas.screenshot()).toEqual(pausedThreeScene);

  await page.getByRole("button", { name: "Original 2D" }).click();
  await expectOriginalReady(page);
  await expectMascotRemoved(page);
  await expect(hero).toHaveAttribute("data-motion", "paused");
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);
  const originalCanvas = page.getByTestId("ocean-water-canvas");
  const pausedOriginalScene = await originalCanvas.screenshot();
  await page.waitForTimeout(180);
  expect(await originalCanvas.screenshot()).toEqual(pausedOriginalScene);

  await page.getByRole("button", { name: "Resume motion" }).click();
  await expect(hero).toHaveAttribute("data-motion", "active");
  await expectSceneScreenshotToChange(originalCanvas);

  await page.getByRole("button", { name: "Three.js" }).click();
  await expectThreeReady(page);
  await expectSceneScreenshotToChange(page.getByTestId("ocean-three-canvas"));
});

test("floating gallery moves with the water and freezes with pause", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);

  const hero = page.locator("#home-hero");
  const galleryFloat = page.getByTestId("ocean-card").first().locator("..");
  await expectMascotRemoved(page);
  await expect(hero).toHaveAttribute("data-gallery-enabled", "true");
  const readGalleryTransform = () =>
    galleryFloat.evaluate((element) => getComputedStyle(element).transform);
  const movingGallery = await readGalleryTransform();
  await expect
    .poll(readGalleryTransform, { timeout: 5_000 })
    .not.toBe(movingGallery);

  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(hero).toHaveAttribute("data-motion", "paused");
  await waitForHeroVisualSettled(page);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );

  const frozenGallery = await readGalleryTransform();
  await page.waitForTimeout(180);
  expect(await readGalleryTransform()).toBe(frozenGallery);
});

test("deep water keeps moving below the hero and follows pause, reduced motion, and renderer changes", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.emulateMedia({
    reducedMotion: "no-preference",
    colorScheme: "light",
  });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await expectDepthReady(page);
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);

  const hero = page.locator("#home-hero");
  const region = page.getByTestId("ocean-depth-region");
  const scene = page.getByTestId("ocean-depth-scene");
  const canvas = page.getByTestId("ocean-depth-canvas");
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(hero).not.toBeInViewport();
  await expect(region).toBeInViewport();
  await expect(scene).toHaveAttribute("data-paused", "false");
  await waitForPageVisualSettled(page);
  const movingView = await screenshotVisibleDepthPatch(page, canvas);
  await expect
    .poll(
      async () =>
        Buffer.compare(
          movingView,
          await screenshotVisibleDepthPatch(page, canvas),
        ),
      { timeout: 5_000 },
    )
    .not.toBe(0);

  await page.getByRole("button", { name: "Pause motion" }).click();
  await expect(
    page.getByRole("button", { name: "Resume motion" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(scene).toHaveAttribute("data-paused", "true");
  await waitForPageVisualSettled(page);
  const pausedView = await screenshotVisibleDepthPatch(page, canvas);
  await page.waitForTimeout(180);
  expect(await screenshotVisibleDepthPatch(page, canvas)).toEqual(pausedView);

  await page.getByRole("button", { name: "Resume motion" }).click();
  await page.evaluate(() =>
    window.scrollTo(0, document.documentElement.scrollHeight),
  );
  await expect(scene).toHaveAttribute("data-paused", "false");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-paused", "true");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(scene).toHaveAttribute("data-paused", "false");

  await page.getByRole("button", { name: "Original 2D" }).click();
  await expectOriginalReady(page);
  await expect(region).toHaveAttribute("data-renderer", "original");
  await expect(page.getByTestId("ocean-depth-canvas")).toHaveCount(0);
});

test("reduced motion pauses and resumes the Three.js scene", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/prototype/ocean");
  await expectThreeReady(page);
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);

  const hero = page.locator("#home-hero");
  const canvas = page.getByTestId("ocean-three-canvas");
  await expect(hero).toHaveAttribute("data-motion", "paused");
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute(
    "data-paused",
    "true",
  );
  const reducedScene = await canvas.screenshot();
  await page.waitForTimeout(180);
  expect(await canvas.screenshot()).toEqual(reducedScene);

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(hero).toHaveAttribute("data-motion", "active");
  await expectSceneScreenshotToChange(canvas);
});

test("WebGL failure leaves the static fallback, homepage copy, and calls to action intact", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const nativeGetContext = HTMLCanvasElement.prototype.getContext;
    const webglContexts = new Set(["webgl", "webgl2", "experimental-webgl"]);
    Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
      configurable: true,
      value: function (
        this: HTMLCanvasElement,
        contextType: string,
        ...args: unknown[]
      ) {
        if (webglContexts.has(contextType)) return null;
        return Reflect.apply(nativeGetContext, this, [
          contextType,
          ...args,
        ]) as unknown;
      },
    });
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/prototype/ocean");

  const hero = page.locator("#home-hero");
  await expect(hero).toHaveAttribute("data-selected-renderer", "three");
  await expect(hero).toHaveAttribute("data-water-status", "fallback", {
    timeout: 15_000,
  });
  await expect(hero).toHaveAttribute("data-water-renderer", "fallback");
  const depthRegion = page.getByTestId("ocean-depth-region");
  await expect(depthRegion).toHaveAttribute("data-water-status", "fallback", {
    timeout: 15_000,
  });
  await expect(page.getByTestId("ocean-prototype-status")).toHaveText(
    "Static water fallback",
  );
  await expectMascotRemoved(page);
  await expect(page.getByTestId("ocean-three-canvas")).toHaveCSS(
    "visibility",
    "hidden",
  );
  await expect(page.getByTestId("ocean-static-waterline")).toBeVisible();
  const seabed = page.getByTestId("ocean-seabed");
  await expect(seabed).toBeVisible();
  await expect(seabed).toHaveCSS("background-image", /linear-gradient/);
  const fallbackFish = page.getByTestId("ocean-depth-fallback-fish");
  await expect(fallbackFish).toBeVisible();
  await expect(fallbackFish).toHaveAttribute("aria-hidden", "true");
  await expect(fallbackFish.locator("span")).toHaveCount(4);
  await expect(page.locator(".ocean-hero__water")).toHaveCSS(
    "background-image",
    /linear-gradient/,
  );
  await expect(
    page.getByRole("heading", { name: "Dive into your next story." }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Discover anime you’ll love. Keep your watchlist, episode progress, and next story together.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Explore Sabame" }),
  ).toHaveAttribute("href", "/login");
  await expect(page.getByRole("link", { name: "Take a look" })).toHaveAttribute(
    "href",
    "#features",
  );
  await expect(
    page.getByRole("contentinfo").getByRole("link", { name: "Enter the demo" }),
  ).toHaveAttribute("href", "/login");
  await waitForHeroImages(page);
  await waitForHeroVisualSettled(page);
  await hero.screenshot({
    path: "test-results/ocean-prototype-webgl-fallback.png",
  });
  await page.screenshot({
    path: "test-results/ocean-prototype-depth-webgl-fallback-full.png",
    fullPage: true,
  });
  await seabed.screenshot({
    path: "test-results/ocean-prototype-seabed-fallback.png",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      seabed.evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeCloseTo(106.67, 1);
});

test("Sabame mark load failure keeps the depth fallback and footer usable", async ({
  page,
}) => {
  let failedMarkRequests = 0;
  await page.route("**/sabame-mark.webp", async (route) => {
    failedMarkRequests += 1;
    await route.abort();
  });
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
  await page.goto("/prototype/ocean");

  const prototype = page.locator("[data-depth-status]");
  const depthRegion = page.getByTestId("ocean-depth-region");
  const seabed = page.getByTestId("ocean-seabed");
  const features = page.locator("#features");
  const footer = page.getByRole("contentinfo");
  await expect(prototype).toHaveAttribute("data-depth-status", "fallback", {
    timeout: 15_000,
  });
  expect(failedMarkRequests).toBeGreaterThan(0);
  await expect(depthRegion).toHaveAttribute("data-water-status", "fallback");
  await expect(depthRegion).toHaveCSS("background-image", /linear-gradient/);
  await expect(seabed).toBeVisible();
  await expect(page.getByTestId("ocean-depth-fallback-fish")).toBeVisible();
  await expect(features).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect
    .poll(() =>
      features.evaluate(
        (element) => getComputedStyle(element, "::before").backgroundImage,
      ),
    )
    .toBe("none");
  await expect(footer).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(
    footer.getByRole("link", { name: "Enter the demo" }),
  ).toBeVisible();
  await expect(
    footer.getByRole("link", { name: "Enter the demo" }),
  ).toHaveAttribute("href", "/login");
});
