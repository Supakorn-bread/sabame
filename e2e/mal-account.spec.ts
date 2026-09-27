import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";
import { readFile } from "node:fs/promises";

import type { MalLibraryItem, MalListStatus, MalOperation, MalUser } from "@sabame/domain/mal";

const user: MalUser = { id: 42, name: "saba_viewer", picture: "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg" };
const updatedAt = "2026-09-15T10:00:00.000Z";

function remote(status: MalListStatus["status"], episodes: number, score: number): MalListStatus {
  return { status, num_episodes_watched: episodes, score, is_rewatching: false, updated_at: updatedAt };
}

function item(id: string, title: string, coverUrl: string, status: MalLibraryItem["entry"]["status"], episodes: number, score: number, totalEpisodes = 12): MalLibraryItem {
  const malStatus = remote(status === "planned" ? "plan_to_watch" : status, episodes, score);
  return {
    anime: { id, title, subtitle: title, synopsis: `${title} imported from MyAnimeList.`, genres: ["Drama"], totalEpisodes, episodeMinutes: 24, accent: "violet", score: "8.40", coverUrl },
    entry: { animeId: id, status, watchedEpisodes: episodes, currentEpisode: Math.min(episodes + 1, totalEpisodes), playbackSeconds: 0, personalScore: score, updatedAt },
    remote: malStatus,
  };
}

const importedItems = [
  item("mal-52991", "Frieren: Beyond Journey's End", "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg", "watching", 18, 9, 28),
  item("mal-42310", "Cyberpunk: Edgerunners", "https://cdn.myanimelist.net/images/anime/1818/126435l.jpg", "completed", 10, 8, 10),
  item("mal-51179", "Mushoku Tensei: Jobless Reincarnation Season 2", "https://cdn.myanimelist.net/images/anime/1898/138005l.jpg", "on_hold", 5, 7, 12),
  item("mal-51009", "Jujutsu Kaisen Season 2", "https://cdn.myanimelist.net/images/anime/1792/138022l.jpg", "planned", 0, 0, 23),
  item("mal-55701", "Demon Slayer: Hashira Training Arc", "https://cdn.myanimelist.net/images/anime/1565/142711l.jpg", "dropped", 2, 4, 8),
];

async function mockCatalog(page: Page) {
  await page.route("**/api/anime/search?*", (route) => route.fulfill({ json: { results: [] } }));
  await page.route("**/api/anime/*", (route) => route.fulfill({ status: 503, json: { error: { code: "fixture_metadata_unavailable" } } }));
}

async function mockMalSession(page: Page, options: { signedIn?: boolean; configured?: boolean } = {}) {
  let signedIn = options.signedIn ?? false;
  const configured = options.configured ?? true;
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured, user: signedIn ? user : null } }));
  await page.route("**/api/auth/mal/start", (route) => {
    if (!configured) return route.fulfill({ status: 302, headers: { location: "/login?mal_error=not_configured" } });
    signedIn = true;
    return route.fulfill({ status: 302, headers: { location: "/dashboard" } });
  });
  return { signIn: () => { signedIn = true; }, signOut: () => { signedIn = false; } };
}

async function mockMalLibrary(page: Page, operations: MalOperation[] = []) {
  const response = { user, items: importedItems, operations, imported: true, lastSyncedAt: updatedAt };
  await page.route("**/api/mal/list", (route) => route.fulfill({ json: response }));
  await page.route("**/api/mal/import", (route) => route.fulfill({ json: response }));
}

async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
}

test("MAL login explains configured and unconfigured servers", async ({ page }) => {
  await mockCatalog(page);
  await mockMalSession(page, { configured: false });
  await page.goto("/login");

  await expect(page.getByRole("status")).toContainText("not configured");
  await expect(page.getByRole("link", { name: /continue with myanimelist/i })).toHaveAttribute("href", "/api/auth/mal/start");
  await page.getByRole("link", { name: /continue with myanimelist/i }).click();
  await expect(page).toHaveURL(/\/login\?mal_error=not_configured$/);
  const configAlert = page.getByRole("alert").filter({ hasText: "MyAnimeList sign-in" });
  await expect(configAlert).toContainText("has not been configured");
  await expect(configAlert).toContainText("MAL_TOKEN_ENCRYPTION_KEY");
  await page.screenshot({ path: "test-results/login-mal.png", fullPage: true });

  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/login?mal_error=access_denied");
  await expect(page.getByRole("alert").filter({ hasText: "sign-in was cancelled" })).toBeVisible();
  await page.evaluate(() => localStorage.clear());

  await page.goto("/login?mal_error=upstream_failed%3Faccess_token%3Dsuper-secret-token");
  await expect(page.getByRole("alert").filter({ hasText: "MyAnimeList" })).toContainText("Please start a new sign-in");
  await expect(page.getByText(/super-secret-token/)).toHaveCount(0);

  await page.unrouteAll({ behavior: "wait" });
  await mockCatalog(page);
  await mockMalLibrary(page);
  await mockMalSession(page);
  await page.goto("/login");
  await expect(page.getByText("Imports your list after you authorize Sabame on MyAnimeList.")).toBeVisible();
  await page.getByRole("link", { name: /continue with myanimelist/i }).click();
  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByLabel("MyAnimeList sync")).toBeVisible();
});

test("an imported MAL library preserves statuses and personal scores", async ({ page }) => {
  await mockCatalog(page);
  await mockMalLibrary(page);
  await mockMalSession(page, { signedIn: true });
  await page.goto("/library");

  await expect(page.getByRole("heading", { name: "My Library" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(5);
  await expect(page.getByRole("heading", { name: "Mushoku Tensei: Jobless Reincarnation Season 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Demon Slayer: Hashira Training Arc" })).toBeVisible();
  const titleHeights = await page.locator("article .library-cover-caption h2").evaluateAll((titles) => titles.map((title) => Math.round(title.getBoundingClientRect().height)));
  expect(new Set(titleHeights).size).toBe(1);
  await expect(page.locator("article").filter({ hasText: "Frieren: Beyond Journey's End" })).toContainText("9/10 yours");
  await expect(page.locator("article").filter({ hasText: "Cyberpunk: Edgerunners" })).toContainText("Completed");
  await expect(page.locator("article").filter({ hasText: "Jujutsu Kaisen Season 2" })).toContainText("Plan to Watch");
  await page.getByRole("button", { name: "On Hold" }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText("Mushoku Tensei: Jobless Reincarnation Season 2");
  await page.getByRole("button", { name: "Dropped" }).click();
  await expect(page.locator("article")).toContainText("Demon Slayer: Hashira Training Arc");
  await page.getByRole("button", { name: "All", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(5);
  await expectNoAccessibilityViolations(page);
  await page.screenshot({ path: "test-results/library-mal-imported.png", fullPage: true });
});

test("an imported MAL title keeps its identity and selected episode through playback retry", async ({ page }) => {
  await mockCatalog(page);
  await mockMalLibrary(page);
  await mockMalSession(page, { signedIn: true });
  const anime = importedItems[2].anime;
  await page.route(`**/api/anime/${anime.id}`, (route) => route.fulfill({ json: anime }));
  await page.route(`**/api/anime/${anime.id}/episodes`, (route) => route.fulfill({ json: { episodes: Array.from({ length: 12 }, (_, i) => ({ number: i + 1 })) } }));
  const video = await readFile("e2e/fixtures/player.mp4");
  await page.route("**/fixture/mal-player.mp4", (route) => route.fulfill({ contentType: "video/mp4", body: video }));
  const requests: number[] = [];
  await page.route(`**/api/anime/${anime.id}/media`, (route) => {
    const episodeNumber = route.request().postDataJSON().episodeNumber;
    requests.push(episodeNumber);
    if (requests.length === 1) return route.fulfill({ status: 502, json: { error: { code: "metadata_unavailable" } } });
    return route.fulfill({ json: { provider: "fixture", metadata: { animeId: anime.id, episodeNumber }, video: { url: "/fixture/mal-player.mp4", type: "mp4" }, subtitles: [], thaiStatus: "unknown", selectionReason: "video_only" } });
  });
  await page.goto("/library");
  await page.getByRole("button", { name: `Show details for ${anime.title}` }).click();
  await page.getByRole("heading", { name: anime.title }).getByRole("link").click();
  await expect(page).toHaveURL(`/watch/${anime.id}`);
  await expect(page.getByRole("heading", { name: anime.title })).toBeVisible();
  expect(requests).toEqual([]);
  await page.getByRole("button", { name: "Play episode" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("Anime details are temporarily unavailable");
  await page.getByRole("button", { name: "Request fresh source" }).click();
  await expect.poll(() => page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await page.locator("video").evaluate((element: HTMLVideoElement) => element.pause());
  expect(requests).toEqual([6, 6]);
  await expect(page).toHaveURL(`/watch/${anime.id}`);
});

test("MAL progress confirms, conflicts resolve, failures retry, and logout returns to demo data", async ({ page }) => {
  await mockCatalog(page);
  await mockMalLibrary(page);
  const accountSession = await mockMalSession(page, { signedIn: true });
  let mode: "success" | "conflict" | "fail-once" = "success";
  let failed = false;
  let logoutCalls = 0;
  let failLogout = true;

  await page.route("**/api/mal/anime/mal-52991", async (route: Route) => {
    const body = route.request().postDataJSON() as { operationId: string; changes: { watchedEpisodes?: number }; base: MalListStatus; resolution?: "local" | "remote" };
    const localEpisodes = body.changes.watchedEpisodes ?? 18;
    if (mode === "fail-once" && !failed) {
      failed = true;
      return route.fulfill({ status: 503, json: { error: { code: "sync_failed", message: "MyAnimeList is temporarily unavailable." } } });
    }
    if (mode === "conflict" && !body.resolution) {
      const operation: MalOperation = { id: body.operationId, animeId: "mal-52991", changes: body.changes, base: body.base, state: "conflict", remote: remote("watching", 21, 9) };
      return route.fulfill({ status: 409, json: { operation } });
    }
    const episodes = body.resolution === "remote" ? 21 : localEpisodes;
    const syncedItem = item("mal-52991", "Frieren: Beyond Journey's End", "https://cdn.myanimelist.net/images/anime/1015/138006l.jpg", "watching", episodes, 9, 28);
    const operation: MalOperation = { id: body.operationId, animeId: "mal-52991", changes: body.changes, base: body.base, state: "synced", remote: syncedItem.remote };
    return route.fulfill({ json: { operation, item: syncedItem } });
  });
  await page.route("**/api/auth/logout", (route) => {
    logoutCalls += 1;
    if (failLogout) {
      failLogout = false;
      return route.fulfill({ status: 503, json: { error: { code: "logout_failed", message: "Sensitive upstream detail" } } });
    }
    accountSession.signOut();
    return route.fulfill({ json: { success: true } });
  });

  await page.goto("/library");
  const card = page.locator("article").filter({ hasText: "Frieren: Beyond Journey's End" });
  await card.getByRole("button", { name: "Show details for Frieren: Beyond Journey's End" }).click();
  await card.getByRole("button", { name: "Increase Frieren: Beyond Journey's End watched episodes" }).click();
  await expect(card).toContainText("19 / 28");
  await expect(page.getByLabel("MyAnimeList sync")).toContainText("Synced with MyAnimeList");

  mode = "conflict";
  await card.getByRole("button", { name: "Increase Frieren: Beyond Journey's End watched episodes" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Sync conflict" })).toBeVisible();
  await page.getByRole("button", { name: "Use MAL" }).click();
  await expect(card).toContainText("21 / 28");
  await expect(page.getByRole("alert").filter({ hasText: "Sync conflict" })).toHaveCount(0);

  mode = "fail-once";
  await card.getByRole("button", { name: "Show details for Frieren: Beyond Journey's End" }).click();
  await card.getByRole("button", { name: "Increase Frieren: Beyond Journey's End watched episodes" }).click();
  await expect(page.getByRole("button", { name: "Retry changes" })).toBeVisible();
  await page.getByRole("button", { name: "Retry changes" }).click();
  await expect(page.getByLabel("MyAnimeList sync")).toContainText("Synced with MyAnimeList");

  await page.getByLabel("Account", { exact: true }).click();
  await expect(page.getByText("saba_viewer", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "saba_viewer profile picture" })).toBeVisible();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByRole("alert").filter({ hasText: "could not sign you out" })).toBeVisible();
  await expect(page.getByText("Sensitive upstream detail")).toHaveCount(0);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  expect(logoutCalls).toBe(2);
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
  await page.goto("/library");
  await expect(page.getByText("Mushoku Tensei: Jobless Reincarnation Season 2", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Mushoku Tensei S2", exact: true })).toBeVisible();
});

test("a MAL account cannot silently add a Sabame demo catalog ID", async ({ page }) => {
  await mockCatalog(page);
  await mockMalLibrary(page);
  await mockMalSession(page, { signedIn: true });
  const malWrites: string[] = [];
  await page.route("**/api/mal/anime/*", (route) => {
    malWrites.push(route.request().url());
    return route.fulfill({ status: 500, json: { error: { code: "unexpected_write" } } });
  });

  await page.goto("/watch/skyward-bloom");
  await expect(page.getByRole("heading", { name: /Find the MyAnimeList version of Frieren/i })).toBeVisible();
  await expect(page.getByRole("link", { name: "Find the MyAnimeList title" })).toHaveAttribute("href", "/search");
  await expect(page.getByRole("button", { name: "Play episode" })).toHaveCount(0);
  expect(malWrites).toEqual([]);
});
