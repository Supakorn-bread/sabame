import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
  test(`home header sticks after its original position until returning to the top (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.emulateMedia({ colorScheme: "light", reducedMotion: width === 390 ? "reduce" : "no-preference" });
    await page.goto("/");
    const header = page.locator(".ocean-home-header");
    await expect(page.getByRole("button", { name: /^Theme:/ })).toBeVisible();
    await expect(header).toHaveCSS("position", "absolute");
    await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const heroTop = await page.locator("#home-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY);

    await page.evaluate(() => window.scrollTo({ top: 30, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "absolute");
    await page.getByRole("button", { name: /^Theme:/ }).focus();
    await page.evaluate(() => window.scrollTo({ top: 120, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "fixed");
    await expect(page.getByRole("button", { name: /^Theme:/ })).toBeFocused();
    if (width === 390) {
      expect(await header.evaluate((el) => el.getAnimations().every((animation) => Number(animation.effect?.getTiming().duration ?? 0) <= 1))).toBe(true);
    }
    await header.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
    expect((await header.boundingBox())!.y).toBe(0);
    await expect(header).not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    await expect(header).toHaveCSS("background-color", "rgb(249, 249, 249)");
    await expect(header).toHaveCSS("backdrop-filter", "none");
    expect(await page.locator("#home-hero").evaluate((el) => el.getBoundingClientRect().top + scrollY)).toBe(heroTop);
    await expect(page.getByRole("navigation", { name: "Homepage", exact: true })).toHaveCount(1);
    await page.screenshot({ path: `test-results/home-header-sticky-${width}.png` });
    expect((await new AxeBuilder({ page }).include(".ocean-home-header").analyze()).violations).toEqual([]);

    const theme = page.getByRole("button", { name: /^Theme:/ });
    for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await theme.click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await expect(header).toHaveCSS("background-color", "rgb(20, 18, 27)");
    await page.evaluate(() => window.scrollTo({ top: 20, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "fixed");
    await header.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
    expect((await new AxeBuilder({ page }).include(".ocean-home-header").analyze()).violations).toEqual([]);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "absolute");
    await expect(header).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "fixed");
    await page.reload();
    await expect(page.getByRole("button", { name: /^Theme:/ })).toBeVisible();
    // Browsers can restore the previous offset or reset to the top on reload.
    const restoredY = await page.evaluate(() => window.scrollY);
    await expect(header).toHaveCSS("position", restoredY >= 80 ? "fixed" : "absolute");
    await page.evaluate(() => window.scrollTo({ top: 200, behavior: "instant" }));
    await expect(header).toHaveCSS("position", "fixed");
    await page.getByRole("link", { name: width === 390 ? "Enter" : "Open Sabame", exact: true }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sabame", exact: true })).toBeVisible();
    await expect(header).toHaveCSS("background-color", "rgb(20, 18, 27)");
  });
}
