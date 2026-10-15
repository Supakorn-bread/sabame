import { expect, test, type Page } from "@playwright/test";

async function useDemoSession(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
  await page.route("**/api/anime/search?*", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("**/api/anime/*", (route) => route.fulfill({ status: 503, json: { error: { code: "fixture_metadata_unavailable" } } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}

async function useMalSessionWithBrokenAvatar(page: Page, name = "Saba Viewer") {
  const user = { id: 42, name, picture: "https://cdn.myanimelist.net/images/missing-avatar.jpg" };
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
  await account.click();
  await expect(page.getByTestId("account-summary-avatar").locator("span")).toHaveText("SV");
});

test("account summary stays contained and scrollable across compact viewports", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await useMalSessionWithBrokenAvatar(
    page,
    "AccountNameWithUnbrokenIdentifierFor320PixelsAndShortLandscapeMenuScrollingWithoutClipping",
  );

  const account = page.getByRole("button", { name: "Account" });
  await account.click();
  const actions = page.getByRole("group", { name: "Account actions" });
  const stats = actions.getByRole("group", { name: "Account library statistics" });
  await expect(stats.getByText("0", { exact: true })).toBeVisible();
  await expect(stats.getByText("Unrated", { exact: true })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Sync now" })).toBeVisible();

  const expectLayout = async (width: number, height: number, screenshotPath: string) => {
    await page.setViewportSize({ width, height });
    const geometry = await actions.evaluate((menu) => {
      const avatar = menu.querySelector<HTMLElement>('[data-testid="account-summary-avatar"]');
      const details = menu.querySelector<HTMLElement>('[data-testid="account-summary-details"]');
      const signOut = menu.querySelector<HTMLButtonElement>(":scope > button:last-child");
      if (!avatar || !details || !signOut) throw new Error("Account summary geometry is incomplete.");
      const menuRect = menu.getBoundingClientRect();
      const avatarRect = avatar.getBoundingClientRect();
      const detailsRect = details.getBoundingClientRect();
      const signOutRect = signOut.getBoundingClientRect();
      const style = getComputedStyle(menu);
      return {
        menu: { x: menuRect.x, y: menuRect.y, width: menuRect.width, height: menuRect.height },
        avatar: { x: avatarRect.x, y: avatarRect.y, width: avatarRect.width, height: avatarRect.height },
        details: { x: detailsRect.x, y: detailsRect.y, width: detailsRect.width, height: detailsRect.height },
        signOut: { x: signOutRect.x, width: signOutRect.width },
        clientWidth: menu.clientWidth,
        paddingX: parseFloat(style.paddingLeft) + parseFloat(style.paddingRight),
        scrollHeight: menu.scrollHeight,
        clientHeight: menu.clientHeight,
      };
    });

    expect(geometry.avatar.x).toBeLessThan(geometry.details.x);
    expect(geometry.avatar.y).toBeCloseTo(geometry.details.y, 0);
    expect(geometry.avatar.height).toBeCloseTo(geometry.details.height, 0);
    expect(geometry.avatar.width).toBe(width < 640 ? 96 : 128);
    expect(geometry.signOut.width).toBeCloseTo(geometry.clientWidth - geometry.paddingX, 0);
    expect(geometry.menu.x).toBeGreaterThanOrEqual(0);
    expect(geometry.menu.x + geometry.menu.width).toBeLessThanOrEqual(width);
    expect(geometry.menu.y).toBeGreaterThanOrEqual(0);
    expect(geometry.menu.y + geometry.menu.height).toBeLessThanOrEqual(height);
    await page.screenshot({ path: screenshotPath });
    return geometry;
  };

  await expectLayout(1280, 900, "test-results/account-summary-desktop.png");
  await expectLayout(390, 844, "test-results/account-summary-mobile-390.png");
  await expectLayout(320, 844, "test-results/account-summary-mobile-320.png");
  const landscape = await expectLayout(390, 320, "test-results/account-summary-landscape.png");
  expect(landscape.scrollHeight).toBeGreaterThan(landscape.clientHeight);

  await actions.evaluate((menu) => { menu.scrollTop = menu.scrollHeight; });
  const signOut = actions.getByRole("button", { name: "Sign out" });
  await expect(signOut).toBeInViewport();
  await signOut.click({ trial: true });
  await page.screenshot({ path: "test-results/account-summary-landscape-scrolled.png" });
});

test("demo account summary explains local saving and offers MyAnimeList connection", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await useDemoSession(page);
  const themeButton = page.getByRole("button", { name: /^Theme:/ });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await themeButton.getAttribute("aria-label"))?.startsWith("Theme: light.")) break;
    await themeButton.click();
  }
  await expect(themeButton).toHaveAttribute("aria-label", /^Theme: light\./);

  const account = page.getByRole("button", { name: "Account" });
  await account.click();
  const actions = page.getByRole("group", { name: "Account actions" });
  await expect(actions).toContainText("Demo workspace · Saved on this device");
  await expect(actions.getByRole("link", { name: "Connect MyAnimeList" })).toBeVisible();
  await expect(actions.getByRole("button", { name: "Sync now" })).toHaveCount(0);
  await page.screenshot({ path: "test-results/account-summary-demo-mobile-320-light.png" });

  await account.click();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    if ((await themeButton.getAttribute("aria-label"))?.startsWith("Theme: dark.")) break;
    await themeButton.click();
  }
  await expect(themeButton).toHaveAttribute("aria-label", /^Theme: dark\./);
  await account.click();
  await expect(actions).toBeVisible();
  await page.screenshot({ path: "test-results/account-summary-demo-mobile-320-dark.png" });
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
