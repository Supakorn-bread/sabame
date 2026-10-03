import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function selectTheme(page: Page, theme: "light" | "dark") {
  const button = page.getByRole("button", { name: /^Theme:/ });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const current = (await page.locator("html").getAttribute("class")) ?? "";
    if (current.includes(theme)) return;
    await button.click();
  }
  await expect(page.locator("html")).toHaveClass(new RegExp(theme));
}

async function expectDepthColors(page: Page, start: string) {
  await expect.poll(() => page.locator("#features").evaluate((element) =>
    getComputedStyle(element).backgroundColor,
  )).toBe(start);

  const colors = await page.evaluate(() => ({
    seam: getComputedStyle(document.querySelector("#home-hero")!, "::after").backgroundColor,
    features: getComputedStyle(document.querySelector("#features")!).backgroundColor,
    footer: getComputedStyle(document.querySelector("footer")!).backgroundColor,
  }));
  expect(colors.seam).toBe(start);
  expect(colors.features).toBe(start);
  expect(colors.footer).toBe("rgb(6, 22, 37)");
  const layers = await page.evaluate(() => ({
    seam: Number.parseInt(getComputedStyle(document.querySelector("#home-hero")!, "::after").zIndex, 10),
    scene: Number.parseInt(getComputedStyle(document.querySelector(".ocean-hero__scene")!).zIndex, 10),
    copy: Number.parseInt(getComputedStyle(document.querySelector(".ocean-hero__layout")!).zIndex, 10),
  }));
  expect(layers.seam).toBeGreaterThan(layers.scene);
  expect(layers.seam).toBeLessThan(layers.copy);
}

test("deep ocean descent joins the hero, feature stories, and ocean-floor footer in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  const features = page.locator("#features");
  const footer = page.getByRole("contentinfo");
  const footerLink = footer.getByRole("link", { name: "Enter the demo" });
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeVisible();
  await expect(features.getByRole("article")).toHaveCount(3);
  await expect(features.getByText("Your demo watchlist is saved in this browser. Connect MyAnimeList to bring your own list along.")).toBeVisible();
  await expect(footerLink).toHaveAttribute("href", "/login");
  await expect(footerLink).toHaveCSS("cursor", "pointer");
  await expectDepthColors(page, "rgb(11, 61, 104)");
  await expect(page.getByTestId("ocean-scene")).toHaveAttribute("data-paused", "true");
  await expect(features).toHaveCSS("transition-property", "none");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.screenshot({ path: "test-results/ocean-depth-day.png", fullPage: true });

  await selectTheme(page, "dark");
  await expectDepthColors(page, "rgb(8, 30, 56)");
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/ocean-depth-night.png", fullPage: true });

  await selectTheme(page, "light");
  await expectDepthColors(page, "rgb(11, 61, 104)");

  await page.getByRole("link", { name: "Take a look" }).click();
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeInViewport();
  await footerLink.click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Sabame", exact: true })).toBeVisible();
});

test("deep ocean cards and notes stay stacked, readable, and overflow-free on mobile and zoom", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await page.goto("/");

  const cards = page.locator("#features article");
  await expect(cards).toHaveCount(3);
  await expect(page.getByText("Your demo watchlist is saved in this browser. Connect MyAnimeList to bring your own list along.")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const layout = await page.evaluate(() => {
    const features = document.querySelector<HTMLElement>("#features")!;
    const footerLink = document.querySelector<HTMLElement>("footer a")!;
    const cards = Array.from(features.querySelectorAll<HTMLElement>("article")).map((card) => {
      const rect = card.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
    });
    const featureRect = features.getBoundingClientRect();
    const footerRect = document.querySelector("footer")!.getBoundingClientRect();
    const linkRect = footerLink.getBoundingClientRect();
    return {
      features: { left: featureRect.left, right: featureRect.right },
      footer: { left: footerRect.left, right: footerRect.right },
      footerTarget: { width: linkRect.width, height: linkRect.height },
      cards,
    };
  });
  expect(layout.footerTarget.width).toBeGreaterThanOrEqual(44);
  expect(layout.footerTarget.height).toBeGreaterThanOrEqual(44);
  for (let index = 0; index < layout.cards.length; index += 1) {
    const card = layout.cards[index]!;
    expect(card.left).toBeGreaterThanOrEqual(layout.features.left);
    expect(card.right).toBeLessThanOrEqual(layout.features.right);
    if (index > 0) expect(card.top).toBeGreaterThanOrEqual(layout.cards[index - 1]!.bottom);
  }

  await page.screenshot({ path: "test-results/ocean-depth-mobile.png", fullPage: true });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 320, height: 740 });
  await page.locator("html").evaluate((element) => { element.style.fontSize = "200%"; });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeVisible();
  const overflowingText = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll<HTMLElement>(
      "#features h2, #features h3, #features p, footer span, footer a",
    ));
    return elements.flatMap((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return Array.from(range.getClientRects()).map((rect) => ({
        text: element.textContent?.trim() ?? "",
        left: rect.left,
        right: rect.right,
      }));
    }).filter((rect) => rect.left < -1 || rect.right > window.innerWidth + 1);
  });
  expect(overflowingText).toEqual([]);

  const zoomFooterTarget = await page.getByRole("link", { name: "Enter the demo" }).boundingBox();
  expect(zoomFooterTarget?.width).toBeGreaterThan(0);
  expect(zoomFooterTarget?.height).toBeGreaterThan(0);
  await page.screenshot({ path: "test-results/ocean-depth-mobile-zoom.png", fullPage: true });
});
