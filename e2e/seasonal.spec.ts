import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { SeasonalAnime } from "../src/features/seasonal/model";

const titles: SeasonalAnime[] = [
  { id: "mal-52991", title: "Frieren: Beyond Journey's End", subtitle: "Sousou no Frieren", synopsis: "The journey continues long after the adventure ends. An elven mage sets out to understand the people she once traveled with, finding new friendships along the way.", genres: ["Adventure", "Drama", "Fantasy"], totalEpisodes: 28, episodeMinutes: 24, accent: "violet", coverUrl: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg", score: "9.30", format: "tv", studios: ["Madhouse"], startDate: "2023-09-29", members: 2000000, continuing: false },
  { id: "mal-51009", title: "Jujutsu Kaisen Season 2", subtitle: "Jujutsu Kaisen", synopsis: "The past catches up with the present as sorcerers face a new threat. A story of friendship, ambition, and the price of extraordinary power.", genres: ["Action", "Supernatural"], totalEpisodes: 23, episodeMinutes: 24, accent: "violet", coverUrl: "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg", score: "8.80", format: "tv", studios: ["MAPPA"], startDate: "2023-07-06", members: 2400000, continuing: true },
  { id: "mal-38000", title: "A Summer Story", subtitle: "", synopsis: "Two friends spend one unforgettable summer in a quiet seaside town, where an unexpected discovery turns their world upside down.", genres: ["Drama", "Slice of Life"], totalEpisodes: 1, episodeMinutes: 110, accent: "cyan", score: "8.10", format: "movie", studios: ["Studio Summer"], startDate: "2023-08-01", members: 12000, continuing: false },
];
async function login(page: Page) {
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: false, user: null } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}
test("season tabs, year, filters and browser history select the correct anime", async ({ page }) => {
  const requested: string[] = [];
  await page.route("**/api/anime/seasonal?*", (route) => {
    const url = new URL(route.request().url()); const season = url.searchParams.get("season")!;
    requested.push(`${url.searchParams.get("year")}/${season}`);
    return route.fulfill({ json: { items: season === "winter" ? [] : titles, nextPage: null } });
  });
  await login(page);
  await page.goto("/seasonal?year=2023&season=summer");
  await expect(page.getByRole("heading", { name: "Summer 2023" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Summer/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.locator("article").filter({ hasText: "A Summer Story" }).getByText("1 episode", { exact: true })).toBeVisible();
  expect(requested).toContain("2023/summer");
  await expect(page.locator("article").first()).toContainText("Jujutsu Kaisen");
  await page.getByRole("combobox", { name: "Sort by" }).selectOption("score");
  await expect(page.locator("article").first()).toContainText("Frieren");
  await page.getByRole("button", { name: "Movies", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "All anime", exact: true }).click();
  await page.getByRole("searchbox", { name: "Search this season" }).fill("no-match");
  await expect(page.getByRole("heading", { name: "No matching anime" })).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page.getByRole("tab", { name: /Summer/ }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Fall/ })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/year=2023&season=fall/);
  await expect(page.getByRole("heading", { name: "Fall 2023" })).toBeVisible();
  await page.getByRole("combobox", { name: "Season year" }).selectOption("2024");
  await expect(page.getByRole("heading", { name: "Fall 2024" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Fall 2024" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Fall 2023" })).toBeVisible();
  await page.getByRole("tab", { name: /Winter/ }).click();
  await expect(page.getByRole("heading", { name: "No anime announced yet" })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Winter/ })).toHaveCSS("cursor", "pointer");
});

test("mobile and dark seasonal cards remain accessible, and catalog failures can retry", async ({ page }) => {
  let calls = 0;
  await page.route("**/api/anime/seasonal?*", (route) => ++calls === 1 ? route.fulfill({ status: 503, json: { error: { code: "seasonal_unavailable" } } }) : route.fulfill({ json: { items: titles, nextPage: null } }));
  await login(page);
  await page.goto("/seasonal?year=2023&season=fall");
  await expect(page.locator("main").getByRole("alert")).toContainText("couldn’t load Fall 2023");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/seasonal-desktop.png", fullPage: true });
  const themeButton = page.getByRole("button", { name: /^Theme:/ });
  for (let i = 0; i < 3 && !(await page.locator("html").getAttribute("class"))?.includes("dark"); i++) await themeButton.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/seasonal-dark.png", fullPage: true });
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/seasonal-mobile.png", fullPage: true });
  await page.route("**/api/anime/mal-52991", (route) => route.fulfill({ json: titles[0] }));
  await page.route("**/api/anime/mal-52991/episodes", (route) => route.fulfill({ json: { episodes: [] } }));
  await page.getByRole("heading", { name: "Frieren: Beyond Journey's End" }).getByRole("link").click();
  await expect(page).toHaveURL("/watch/mal-52991");
  await expect(page.getByRole("heading", { name: "Frieren: Beyond Journey's End" })).toBeVisible();
});

test("pagination appends and deduplicates, and old seasons cannot overwrite a new selection", async ({ page }) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/anime/seasonal?*", async (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("season") === "winter") {
      await held;
      return route.fulfill({ json: { items: [titles[2]], nextPage: null } }).catch(() => {});
    }
    return route.fulfill({ json: url.searchParams.get("page") === "1" ? { items: [titles[0]], nextPage: 2 } : { items: titles, nextPage: null } });
  });
  await login(page);
  await page.goto("/seasonal?year=2023&season=fall");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("button", { name: "Load more anime" }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await page.getByRole("tab", { name: /Winter/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "Loading Winter" })).toBeVisible();
  await page.getByRole("tab", { name: /Spring/ }).click();
  await expect(page.getByRole("heading", { name: "Spring 2023" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(1);
  release();
  await expect(page.locator("article").first()).toContainText("Frieren");
});

test("seasonal cards show imported personal scores separately from MAL scores", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const user = { id: 42, name: "seasonal_viewer" };
  const updatedAt = "2026-09-15T10:00:00.000Z";
  const items = titles.slice(0, 2).map((anime, index) => ({
    anime,
    entry: { animeId: anime.id, status: "watching", watchedEpisodes: 1, currentEpisode: 2, playbackSeconds: 0, personalScore: index === 0 ? 9 : 0, updatedAt },
    remote: { status: "watching", num_episodes_watched: 1, score: index === 0 ? 9 : 0, is_rewatching: false, updated_at: updatedAt },
  }));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user } }));
  const library = { user, items, operations: [], imported: true, lastSyncedAt: updatedAt };
  await page.route("**/api/mal/list", (route) => route.fulfill({ json: library }));
  await page.route("**/api/mal/import", (route) => route.fulfill({ json: library }));
  await page.route("**/api/anime/seasonal?*", (route) => route.fulfill({ json: { items: titles, nextPage: null } }));
  await page.goto("/seasonal?year=2023&season=fall");
  const frieren = page.locator("article").filter({ hasText: "Frieren" });
  const jujutsu = page.locator("article").filter({ hasText: "Jujutsu" });
  const movie = page.locator("article").filter({ hasText: "A Summer Story" });
  await expect(frieren).toContainText(/Your score\s*:?\s*9\/10/);
  await expect(frieren.getByLabel("MAL score 9.30 out of 10")).toBeVisible();
  await expect(jujutsu).toContainText(/Your score\s*:?\s*Not scored/);
  await expect(movie).not.toContainText("Your score");
  await page.reload();
  await expect(frieren).toContainText(/Your score\s*:?\s*9\/10/);
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: "test-results/seasonal-user-score-mobile.png", fullPage: true });
});

test("search can find a match on a later catalog page", async ({ page }) => {
  await page.route("**/api/anime/seasonal?*", (route) => route.fulfill({ json: new URL(route.request().url()).searchParams.get("page") === "1"
    ? { items: [titles[0]], nextPage: 2 } : { items: [titles[1]], nextPage: null } }));
  await login(page);
  await page.goto("/seasonal?year=2023&season=fall");
  await expect(page.locator("article")).toHaveCount(1);
  await page.getByRole("searchbox", { name: "Search this season" }).fill("Jujutsu");
  await expect(page.getByRole("heading", { name: "No matches in loaded titles" })).toBeVisible();
  await page.getByRole("button", { name: "Load more anime" }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("Jujutsu Kaisen");
});

test("failed pagination preserves cards and retries without duplicates", async ({ page }) => {
  let pageTwoCalls = 0;
  const requestedPages: string[] = [];
  await page.route("**/api/anime/seasonal?*", (route) => {
    const pageNumber = new URL(route.request().url()).searchParams.get("page") ?? "1";
    requestedPages.push(pageNumber);
    if (pageNumber === "1") return route.fulfill({ json: { items: [titles[0]], nextPage: 2 } });
    pageTwoCalls += 1;
    if (pageTwoCalls === 1) return route.fulfill({ status: 503, json: { error: { code: "seasonal_unavailable" } } });
    return route.fulfill({ json: { items: [titles[0], titles[1], titles[2]], nextPage: null } });
  });
  await login(page);
  await page.goto("/seasonal?year=2023&season=fall");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article").filter({ hasText: "Frieren" })).toBeVisible();
  await page.getByRole("button", { name: "Load more anime" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("couldn’t load Fall 2023");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Load more anime" })).toBeHidden();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("article")).toHaveCount(3);
  await expect(page.locator("article").filter({ hasText: "Frieren" })).toHaveCount(1);
  expect(requestedPages).toEqual(["1", "2", "2"]);
});
