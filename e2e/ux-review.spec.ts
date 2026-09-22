import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", route => route.fulfill({ json: { configured: false, user: null } }));
  await page.route("**/api/anime/search?*", route => route.fulfill({ json: { results: [] } }));
});

test("search distinguishes pending, failed and empty results and recovers with retry", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.goto("/search");
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/anime/search?*", async route => {
    await gate;
    await route.fulfill({ status: 503, json: {} });
  });
  const input = page.locator("main").getByRole("combobox", { name: "Search anime" });
  await input.fill("Cowboy");
  await expect(page.getByRole("status").filter({ hasText: "Searching MyAnimeList catalog" })).toBeVisible();
  await expect(page.getByText("No anime found. Try another title or genre.")).toBeHidden();
  release();
  await expect(page.getByRole("button", { name: "Retry search" })).toBeVisible();
  await page.route("**/api/anime/search?*", route => route.fulfill({ json: { results: [] } }));
  await page.getByRole("button", { name: "Retry search" }).click();
  await expect(page.getByRole("status").filter({ hasText: "No anime found" })).toBeVisible();
  await expect(input).toHaveValue("Cowboy");
});

test("dashboard retains a heading and recovery action when all MAL titles are on hold", async ({ page }) => {
  const user = { id: 42, name: "Viewer" };
  const remote = { status: "on_hold", num_episodes_watched: 2, score: 8, is_rewatching: false, updated_at: "2026-09-22T00:00:00Z" };
  await page.route("**/api/auth/session", route => route.fulfill({ json: { configured: true, user } }));
  await page.route("**/api/mal/list", route => route.fulfill({ json: {
    user, imported: true, operations: [], lastSyncedAt: remote.updated_at,
    items: [{ anime: { id: "mal-1", title: "Cowboy Bebop", subtitle: "", synopsis: "", genres: [], totalEpisodes: 26, episodeMinutes: 24, accent: "violet" }, entry: { animeId: "mal-1", status: "on_hold", watchedEpisodes: 2, currentEpisode: 3, playbackSeconds: 0, updatedAt: remote.updated_at }, remote }],
  } }));
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ready for your next episode?");
  await expect(page.getByText("No titles are marked Watching.", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Open library" }).click();
  await expect(page.locator("article")).toContainText("Cowboy Bebop");
});

test("dashboard and library remain readable in both themes and phone orientations", async ({ page }) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate(value => localStorage.setItem("theme", value), theme);
    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }, { width: 812, height: 375 }]) {
      await page.setViewportSize(viewport);
      for (const route of ["dashboard", "library"]) {
        await page.goto(`/${route}`);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.locator("html")).toHaveClass(new RegExp(theme));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
        if (viewport.height > 375) await page.screenshot({ path: `test-results/ux-${route}-${theme}-${viewport.width}.png`, fullPage: true });
      }
    }
  }
});
