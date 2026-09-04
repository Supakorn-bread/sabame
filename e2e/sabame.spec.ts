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
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

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
