import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`all application headers stay opaque and share the scroll behavior (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 600 });
    await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "light" });
    await page.route("**/api/anime/**", (route) => route.fulfill({ status: 503, json: { error: { code: "fixture_metadata_unavailable" } } }));
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Sabame", exact: true })).toBeVisible();
    await expect(page.locator("header")).toHaveCSS("background-color", "rgb(249, 249, 249)");
    await page.getByRole("button", { name: "Try demo instantly" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);

    for (const route of ["/dashboard", "/library", "/seasonal", "/schedule", "/search", "/watch/skyward-bloom"]) {
      await page.goto(route);
      const header = page.locator("header");
      await expect(header.getByRole("button", { name: "Account", exact: true })).toBeVisible();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await expect(header).toHaveCSS("position", "absolute");
      await expect(header).toHaveCSS("background-color", "rgb(249, 249, 249)");
      await expect(header).toHaveCSS("backdrop-filter", "none");
      const initialTop = await page.locator("main").evaluate((el) => el.getBoundingClientRect().top + scrollY);
      if (await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 120)) {
        await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
        await expect(header).toHaveCSS("position", "fixed");
        expect((await header.boundingBox())!.y).toBe(0);
        expect(await page.locator("main").evaluate((el) => el.getBoundingClientRect().top + scrollY)).toBe(initialTop);
        await header.getByRole("button", { name: "Account", exact: true }).click();
        await expect(page.getByRole("group", { name: "Account actions" })).toBeVisible();
        await page.keyboard.press("Escape");
        await page.evaluate(() => window.scrollTo({ top: 20, behavior: "instant" }));
        await expect(header).toHaveCSS("position", "fixed");
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await expect(header).toHaveCSS("position", "absolute");
      }
      await expect(header).toHaveCSS("background-color", "rgb(249, 249, 249)");
    }

    const theme = page.getByRole("button", { name: /^Theme:/ });
    for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await theme.click();
    await expect(page.locator("header")).toHaveCSS("background-color", "rgb(20, 18, 27)");
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
    await expect(page.locator("header")).toHaveCSS("position", "fixed");
    await expect(page.locator("header")).toHaveCSS("background-color", "rgb(20, 18, 27)");
    expect((await new AxeBuilder({ page }).include("header").analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/solid-top-navigation-${width}.png` });
  });
}
