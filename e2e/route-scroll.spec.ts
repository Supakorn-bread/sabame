import { expect, test } from "@playwright/test";

test("route changes return to the top while hash links keep their anchor", async ({ page }) => {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("link", { name: "My library" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);

  await page.goto("/watch/skyward-bloom#anime-title");
  await expect(page).toHaveURL(/#anime-title$/);
  await expect.poll(() => page.evaluate(() => ({ y: window.scrollY, hash: window.location.hash }))).toMatchObject({ hash: "#anime-title" });
});
