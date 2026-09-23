import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test("library covers reveal glass details on hover and support keyboard dismissal", async ({ page }) => {
  await logIn(page);
  await page.goto("/library");
  const card = page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" });
  const panel = card.getByTestId("library-card-content");
  await expect(panel).toBeHidden();
  await page.screenshot({ path: "test-results/library-covers.png", fullPage: true });
  await card.hover();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS("opacity", "1");
  const box = await card.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(panelBox!.height / box!.height).toBeCloseTo(0.5, 1);
  await expect(card.getByRole("button", { name: /Close details/ })).toHaveCount(0);
  expect(await panel.evaluate((el) => [el, ...el.querySelectorAll("*")].every((node) => !["auto", "scroll"].includes(getComputedStyle(node).overflowY)))).toBe(true);
  expect(await panel.evaluate((el) => getComputedStyle(el).backdropFilter)).toContain("blur");
  await page.screenshot({ path: "test-results/library-glass-hover.png", fullPage: true });
  const beforeScroll = await page.evaluate(() => window.scrollY);
  await panel.hover();
  await page.mouse.wheel(0, 180);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(beforeScroll);
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden();
  const trigger = card.getByRole("button", { name: "Show details for Cyberpunk: Edgerunners" });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await card.boundingBox())?.height).toBe(box?.height);
});

test("half panels fit narrow grid breakpoints and return focus on mouseleave", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await logIn(page);
  await page.goto("/library");
  const card = page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" });
  const panel = card.getByTestId("library-card-content");
  for (const width of [500, 768, 1024, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await card.hover();
    await expect(panel).toHaveCSS("opacity", "1");
    expect(await panel.evaluate((el) => {
      const bounds = el.getBoundingClientRect();
      return [...el.children].every((child) => {
        const rect = child.getBoundingClientRect();
        return rect.top >= bounds.top && rect.bottom <= bounds.bottom && rect.left >= bounds.left && rect.right <= bounds.right;
      });
    })).toBe(true);
  }
  await card.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" }).click();
  await page.mouse.move(0, 0);
  await expect(panel).toBeHidden();
  await expect(card.getByRole("button", { name: "Show details for Cyberpunk: Edgerunners" })).toBeFocused();
});

test.describe("touch library", () => {
test.use({ hasTouch: true });
test("library glass details keep usable mobile controls and reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page);
  await page.goto("/library");

  const card = page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" });
  await card.getByRole("button", { name: "Show details for Cyberpunk: Edgerunners" }).click();
  const title = card.getByRole("link", { name: "Open Cyberpunk: Edgerunners" }).last();
  await expect(title).toHaveAttribute("title", "Cyberpunk: Edgerunners");
  await expect(card.getByText("8.6 community", { exact: true })).toBeVisible();
  await expect(card.getByText("Not scored", { exact: true })).toBeVisible();
  await expect(card.getByRole("progressbar", { name: "Cyberpunk: Edgerunners watch progress" })).toHaveAttribute("aria-valuenow", "7");
  await expect(card.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" })).toBeVisible();
  await expect(card.getByRole("combobox", { name: "Status for Cyberpunk: Edgerunners" })).toBeVisible();

  const panel = card.getByTestId("library-card-content");
  await expect(panel).toHaveCSS("transition-duration", "0s");
  const increase = card.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" });
  await increase.click();
  await expect(card.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "8");
  await expect(increase).toHaveCSS("cursor", "pointer");
  await card.getByRole("combobox", { name: "Status for Cyberpunk: Edgerunners" }).selectOption("on_hold");
  await expect(card.getByRole("combobox")).toHaveValue("on_hold");
  await expect(card.getByRole("button", { name: /Close details/ })).toHaveCount(0);
  const details = card.getByRole("button", { name: "Show details for Cyberpunk: Edgerunners" });
  await details.click();
  await expect(panel).toBeHidden();
  await details.click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/library-glass-mobile.png", fullPage: true });
  const themeButton = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await card.getByRole("button", { name: "Show details for Cyberpunk: Edgerunners" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/library-glass-dark.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
});

test("library distinguishes filtered results from an empty collection", async ({ page }) => {
  await logIn(page);
  await page.goto("/library");

  await page.getByRole("searchbox", { name: "Search library" }).fill("not in this library");
  await expect(page.getByRole("heading", { name: "No matching titles" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.locator("article")).toHaveCount(6);
});

test("an empty MAL collection offers a find anime action", async ({ page }) => {
  const user = { id: 42, name: "saba_viewer" };
  await page.unroute("**/api/auth/session");
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user } }));
  await page.route("**/api/mal/list", (route) => route.fulfill({ json: {
    user,
    imported: true,
    operations: [],
    items: [],
    lastSyncedAt: "2026-09-22T00:00:00.000Z",
  } }));

  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find anime" })).toHaveAttribute("href", "/search");
});
