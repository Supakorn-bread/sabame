import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
});

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}

test("library cards keep readable content and stable mobile controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page);
  await page.goto("/library");

  const card = page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" });
  const title = card.getByRole("link", { name: "Open Cyberpunk: Edgerunners" }).last();
  await expect(title).toHaveAttribute("title", "Cyberpunk: Edgerunners");
  await expect(card.getByText("8.6 community", { exact: true })).toBeVisible();
  await expect(card.getByText("Not scored", { exact: true })).toBeVisible();
  await expect(card.getByRole("progressbar", { name: "Cyberpunk: Edgerunners watch progress" })).toHaveAttribute("aria-valuenow", "7");
  await expect(card.getByRole("button", { name: "Increase Cyberpunk: Edgerunners watched episodes" })).toBeVisible();
  await expect(card.getByRole("combobox", { name: "Status for Cyberpunk: Edgerunners" })).toBeVisible();

  const surfaceColor = await card.getByTestId("library-card-content").evaluate((element) => getComputedStyle(element).backgroundColor);
  expect(surfaceColor).not.toMatch(/rgba\([^)]*,\s*0(?:\.\d+)?\)$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
