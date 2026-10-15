import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { MalLibraryItem, MalListStatus, MalMutationRequest, MalOperation } from "@sabame/domain/mal";

test("unlisted playback stays local through refresh until an explicit MAL add", async ({ page }) => {
  const user = { id: 42, name: "membership_viewer" };
  const updatedAt = "2026-09-15T10:00:00.000Z";
  const anime: MalLibraryItem["anime"] = {
    id: "mal-101", title: "Unlisted playback fixture", subtitle: "", synopsis: "A local playback workspace.",
    genres: [], totalEpisodes: 12, episodeMinutes: 24, accent: "violet",
  };
  const remote: MalListStatus = { status: "plan_to_watch", num_episodes_watched: 0, score: 0, is_rewatching: false, updated_at: updatedAt };
  const item: MalLibraryItem = {
    anime, remote,
    entry: { animeId: anime.id, status: "planned", watchedEpisodes: 0, currentEpisode: 1, playbackSeconds: 0, updatedAt },
  };
  let items: MalLibraryItem[] = [];
  const writes: MalMutationRequest[] = [];
  const snapshot = () => ({ user, items, operations: [], imported: true, lastSyncedAt: updatedAt });
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user } }));
  await page.route("**/api/mal/list", (route) => route.fulfill({ json: snapshot() }));
  await page.route("**/api/mal/import", (route) => route.fulfill({ json: snapshot() }));
  await page.route(`**/api/anime/${anime.id}`, (route) => route.fulfill({ json: anime }));
  await page.route(`**/api/anime/${anime.id}/episodes`, (route) => route.fulfill({ json: { episodes: [{ number: 1 }, { number: 2 }, { number: 3 }] } }));
  const video = await readFile("e2e/fixtures/player.mp4");
  await page.route("**/fixture/membership-player.mp4", (route) => {
    const range = route.request().headers().range?.match(/^bytes=(\d+)-(\d*)$/);
    const start = range ? Number(range[1]) : 0;
    const end = range?.[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
    return route.fulfill({
      status: range ? 206 : 200, contentType: "video/mp4", body: video.subarray(start, end + 1),
      headers: { "accept-ranges": "bytes", ...(range ? { "content-range": `bytes ${start}-${end}/${video.length}` } : {}) },
    });
  });
  await page.route(`**/api/anime/${anime.id}/media`, (route) => route.fulfill({ json: {
    provider: "fixture", metadata: { animeId: anime.id, episodeNumber: 2 },
    video: { url: "/fixture/membership-player.mp4", type: "mp4" }, subtitles: [], thaiStatus: "unknown", selectionReason: "video_only",
  } }));
  await page.route(`**/api/mal/anime/${anime.id}`, (route) => {
    const request = route.request().postDataJSON() as MalMutationRequest;
    writes.push(request);
    items = [item];
    const operation: MalOperation = { id: request.operationId, animeId: anime.id, base: request.base, changes: request.changes, state: "synced", remote };
    return route.fulfill({ json: { operation, item } });
  });

  await page.goto(`/watch/${anime.id}`);
  await expect(page.getByText("Not on your MyAnimeList", { exact: true })).toBeVisible();
  await expect(page.getByText(/Progress matches the latest MyAnimeList sync/)).toHaveCount(0);
  await page.getByRole("button", { name: /Episode 2.*24 min/ }).click();
  await page.getByRole("button", { name: "Play episode", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await page.locator("video").evaluate((element: HTMLVideoElement) => { element.pause(); element.currentTime = 2; });
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("sabame:v1")!).state.malAccounts["42"].library["mal-101"].playbackSeconds)).toBe(2);
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
  await expect(page.locator("article")).toHaveCount(0);
  expect(writes).toEqual([]);

  await page.goto(`/watch/${anime.id}`);
  await expect(page.getByRole("button", { name: /Episode 2.*Selected/ })).toHaveAttribute("aria-current", "true");
  await page.getByRole("button", { name: "Play episode", exact: true }).click();
  await expect.poll(() => page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(2);
  await page.locator("video").evaluate((element: HTMLVideoElement) => element.pause());
  expect(writes).toEqual([]);
  await page.getByRole("button", { name: "Add to MyAnimeList" }).click();
  await expect(page.getByText(/Progress matches the latest MyAnimeList sync/)).toBeVisible();
  expect(writes.map(({ expectedUserId, base, changes }) => ({ expectedUserId, base, changes }))).toEqual([{ expectedUserId: 42, base: null, changes: { status: "planned" } }]);
  await page.goto("/library");
  await expect(page.locator("article")).toHaveCount(1);
  await expect(page.locator("article")).toContainText(anime.title);

  items = [];
  await page.getByRole("button", { name: "Sync now", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Your library is empty" })).toBeVisible();
  await page.goto(`/watch/${anime.id}`);
  await expect(page.getByText("Not on your MyAnimeList", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Episode 2.*Selected/ })).toHaveAttribute("aria-current", "true");
  expect(writes).toHaveLength(1);
});
