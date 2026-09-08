import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("viewer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("secret1");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL("/dashboard");
}

async function expectNoAccessibilityViolations(page: Page) {
  await page.locator("main").evaluate(async (element) => {
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("public homepage offers an accessible responsive hero and demo entry", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Your next story starts here." })).toBeVisible();
  await expect(page).toHaveURL("/");
  await expectNoAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/home-desktop.png", fullPage: true });
  await page.getByRole("link", { name: "Take a look" }).click();
  await expect(page).toHaveURL("/#features");
  await expect(page.getByRole("heading", { name: "A home for your watchlist." })).toBeInViewport();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await expectNoAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/home-mobile.png", fullPage: true });
  await page.getByRole("link", { name: "Explore Sabame" }).click();
  await expect(page).toHaveURL("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
});

test("header search accepts typing, exposes focus and supports result navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await logIn(page);
  const search = page.getByRole("combobox", { name: "Search anime" });
  await search.click();
  await expect(search).toHaveCSS("cursor", "text");
  await expect(search.locator("..")).not.toHaveCSS("box-shadow", "none");
  await search.fill("Cyberpunk");
  await expect(search).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.press("ArrowDown");
  await expect(page.getByRole("option")).toHaveAttribute("aria-selected", "true");
  await expectNoAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/header-search.png" });
  await search.press("Enter");
  await expect(page).toHaveURL("/watch/neon-requiem");
  await search.fill("no-such-title");
  await expect(page.getByRole("status").filter({ hasText: "No anime found" })).toBeVisible();
  await page.getByRole("button", { name: "Clear anime search" }).click();
  await expect(search).toHaveValue("");
  await expect(search).toBeFocused();
  await search.fill("Frieren");
  await search.press("Escape");
  await expect(search).toHaveAttribute("aria-expanded", "false");
  await search.press("ArrowDown");
  await page.getByRole("listbox", { name: "Anime results" }).getByRole("option").click();
  await expect(page).toHaveURL("/watch/skyward-bloom");
});

test("demo login reaches an accessible dashboard", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sabame" })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await logIn(page);
  await expect(page.getByRole("heading", { name: "Frieren: Beyond Journey's End" })).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("library progress persists after a reload", async ({ page }) => {
  await logIn(page);
  await page.goto("/library");

  const animeCard = page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" });
  await expect(animeCard.getByText("7 / 10")).toBeVisible();
  await animeCard.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" }).click();
  await expect(animeCard.getByText("8 / 10")).toBeVisible();

  await page.reload();
  await expect(page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" }).getByText("8 / 10")).toBeVisible();
});

test("mobile layout exposes primary navigation without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page);

  await expect(page.getByRole("navigation", { name: "Mobile primary" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeHidden();
  const viewportFits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(viewportFits).toBe(true);
  await expectNoAccessibilityViolations(page);
});

test("top navigation fades route content and buttons use a pointer cursor", async ({ page }) => {
  await logIn(page);

  await page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link", { name: "Library" }).click();
  await expect(page).toHaveURL("/library");

  const mainAnimation = await page.locator("main").evaluate(
    (element) => getComputedStyle(element).animationName,
  );
  expect(mainAnimation).toContain("route-fade");

  const buttonCursor = await page.getByRole("button", { name: "All", exact: true }).evaluate(
    (element) => getComputedStyle(element).cursor,
  );
  expect(buttonCursor).toBe("pointer");
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(await page.locator("main").evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThan(0.01);
});

test("search, filters, and account actions are usable", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.getByLabel("Account", { exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Sign out" })).toBeHidden();
  await page.goto("/library");
  await page.getByRole("searchbox", { name: "Search library" }).fill("Cyberpunk");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" }).click();
  await expect(page.getByRole("status").filter({ hasText: "progress updated" })).toContainText("8 episodes");
  await page.getByRole("button", { name: "Clear search" }).click();
  await page.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(page.getByRole("button", { name: "Completed", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expectNoAccessibilityViolations(page);
  await page.getByLabel("Account", { exact: true }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
});

test("watch page exposes every episode and visible keyboard player controls", async ({ page }) => {
  await logIn(page);
  await page.goto("/watch/skyward-bloom");
  await page.getByRole("button", { name: "Episode 28", exact: false }).click();
  await expect(page.getByRole("button", { name: "Episode 28 Selected" })).toHaveAttribute("aria-current", "true");
  const play = page.getByRole("button", { name: "Play episode", exact: true }).first();
  await play.focus();
  await expect(play).toHaveCSS("opacity", "1");
  await expectNoAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/watch-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/watch-mobile.png", fullPage: true });
  await page.goto("/library");
  await expect(page.getByRole("searchbox", { name: "Search library" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: "test-results/library-mobile.png", fullPage: true });
});
