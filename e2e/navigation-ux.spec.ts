import { expect, test, type Page } from "@playwright/test";

async function useDemoSession(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
  await page.route("**/api/anime/search?*", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("**/api/anime/*", (route) => route.fulfill({ status: 503, json: { error: { code: "fixture_metadata_unavailable" } } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}

async function useMalSessionWithBrokenAvatar(page: Page) {
  const user = { id: 42, name: "Saba Viewer", picture: "https://cdn.myanimelist.net/images/missing-avatar.jpg" };
  const library = { user, items: [], operations: [], imported: true, lastSyncedAt: null };

  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user } }));
  await page.route("**/api/mal/list", (route) => route.fulfill({ json: library }));
  await page.route("**/_next/image?*", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url");
    return source === user.picture ? route.fulfill({ status: 404 }) : route.continue();
  });
  await page.goto("/dashboard");
}

test("keyboard users can skip the fixed navigation without focus being moved on render", async ({ page }) => {
  await useDemoSession(page);

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  const main = page.locator("#main-content");

  await expect(skipLink).not.toBeFocused();
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(main).toBeFocused();
  await expect(main).toBeInViewport();
});

test("account disclosure reports its state and dismisses with Escape, blur, and an outside press", async ({ page }) => {
  await useDemoSession(page);

  const account = page.getByRole("button", { name: "Account" });
  const actions = page.getByRole("group", { name: "Account actions" });

  await expect(account).toHaveAttribute("aria-expanded", "false");
  await account.click();
  await expect(account).toHaveAttribute("aria-expanded", "true");
  await expect(actions).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(actions).toBeHidden();
  await expect(account).toHaveAttribute("aria-expanded", "false");
  await expect(account).toBeFocused();

  await account.click();
  await page.getByRole("link", { name: "Connect MyAnimeList" }).focus();
  await page.locator("#main-content").focus();
  await expect(actions).toBeHidden();

  await account.click();
  await page.locator("#main-content").click({ position: { x: 2, y: 2 } });
  await expect(actions).toBeHidden();
});

test("a failed remote account image falls back to the account initials", async ({ page }) => {
  await useMalSessionWithBrokenAvatar(page);

  const account = page.getByRole("button", { name: "Account" });
  await expect(account).toBeVisible();
  await expect(account.locator("img")).toHaveCount(0);
  await expect(account.locator("span")).toHaveText("SV");
});

test("desktop navigation targets are comfortable and mobile navigation respects fixed-bar spacing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await useDemoSession(page);

  const desktopLinks = page.getByRole("navigation", { name: "Primary", exact: true }).getByRole("link");
  const desktopHeights = await desktopLinks.evaluateAll((links) => links.map((link) => link.getBoundingClientRect().height));
  expect(desktopHeights.every((height) => height >= 44)).toBe(true);

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileNav = page.getByRole("navigation", { name: "Mobile primary" });
  await expect(mobileNav).toBeVisible();
  const [navBox, viewportHeight, shellPaddingBottom] = await Promise.all([
    mobileNav.boundingBox(),
    page.evaluate(() => window.innerHeight),
    page.locator(".app-shell").evaluate((shell) => parseFloat(getComputedStyle(shell).paddingBottom)),
  ]);

  expect(navBox).not.toBeNull();
  expect((navBox?.y ?? viewportHeight) + (navBox?.height ?? 0)).toBeLessThan(viewportHeight);
  expect(shellPaddingBottom).toBeGreaterThan(navBox?.height ?? 0);
});
