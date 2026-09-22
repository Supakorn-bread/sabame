import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const anime = { id: "mal-999999", title: "Sabame Fixture Story", subtitle: "Original test animation", synopsis: "A synthetic animation for deterministic player tests.", genres: ["Test"], totalEpisodes: 3, episodeMinutes: 0, accent: "violet" };
async function setup(page: Page) {
  await page.route("**/api/anime/search?*", (route) => route.fulfill({ json: { results: [anime] } }));
  await page.route(`**/api/anime/${anime.id}`, (route) => route.fulfill({ json: anime }));
  await page.route(`**/api/anime/${anime.id}/episodes`, (route) => route.fulfill({ json: { episodes: [1, 2, 3].map((number) => ({ number })) } }));
  const body = await readFile("e2e/fixtures/player.mp4");
  await page.route("**/fixture/player.mp4", (route) => {
    const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range ?? "");
    if (!range) return route.fulfill({ contentType: "video/mp4", headers: { "Accept-Ranges": "bytes" }, body });
    const start = Number(range[1]); const end = range[2] ? Math.min(Number(range[2]), body.length - 1) : body.length - 1;
    return route.fulfill({ status: 206, contentType: "video/mp4", headers: { "Accept-Ranges": "bytes", "Content-Range": `bytes ${start}-${end}/${body.length}` }, body: body.subarray(start, end + 1) });
  });
  await page.route("**/fixture/*.vtt", (route) => route.fulfill({ contentType: "text/vtt", body: "WEBVTT\n\n00:00:00.000 --> 00:00:04.000\nสวัสดี — Sabame test\n" }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await expect(page).toHaveURL("/dashboard");
}
function media(episodeNumber: number) {
  return { provider: "test-fixture", video: { url: "/fixture/player.mp4", type: "mp4" }, metadata: { animeId: anime.id, episodeNumber },
    thaiStatus: "present", selectionReason: "thai_subtitle", subtitles: ["th", "en"].map((language) => ({ language, label: language === "th" ? "Thai" : "English", url: `/fixture/${language}.vtt`, format: "vtt", default: language === "th", availability: "available", displaySupported: true, syncStatus: "unverified" })) };
}
test("remote search → selected episode → real video + Thai controls → persisted resume", async ({ page }) => {
  await setup(page);
  const requested: number[] = [];
  await page.route(`**/api/anime/${anime.id}/media`, (route) => {
    const episode = route.request().postDataJSON().episodeNumber;
    requested.push(episode); return route.fulfill({ json: media(episode) });
  });
  await page.goto("/search");
  await page.locator("main").getByRole("combobox", { name: "Search anime" }).fill("Fixture");
  await page.getByRole("option", { name: /Sabame Fixture Story/ }).click();
  await expect(page.getByRole("heading", { name: anime.title })).toBeVisible();
  expect(requested).toEqual([]);
  await page.getByRole("button", { name: "Episode 2 Duration unknown", exact: true }).click();
  expect(requested).toEqual([]);
  await page.getByRole("button", { name: "Play episode" }).click();
  const video = page.locator("video");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.readyState)).toBeGreaterThan(0);
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  expect(requested).toEqual([2]);
  await expect(page.getByRole("combobox", { name: "Subtitles" })).toHaveValue("0");
  await page.getByRole("combobox", { name: "Subtitles" }).selectOption("1");
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.textTracks[1]?.mode)).toBe("showing");
  await page.getByRole("combobox", { name: "Subtitles" }).selectOption("off");
  await video.evaluate((element: HTMLVideoElement) => { element.currentTime = 1.5; });
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => JSON.stringify({ entry: JSON.parse(localStorage.getItem("sabame:v1")!).state.demoLibrary["mal-999999"], position: element.currentTime, duration: element.duration, seeking: element.seeking, ready: element.readyState }))).toContain('"playbackSeconds":1');
  const stored = await page.evaluate(() => localStorage.getItem("sabame:v1"));
  expect(stored).not.toContain("/fixture/");
  await page.screenshot({ path: "test-results/media-desktop.png", fullPage: true });
  await page.reload();
  await expect(page.getByRole("button", { name: "Play episode" })).toBeVisible();
  expect(requested).toEqual([2]);
  await page.getByRole("button", { name: "Play episode" }).click();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(1);
  await video.evaluate((element: HTMLVideoElement) => element.pause());
  await page.getByRole("button", { name: "Episode 3 Duration unknown", exact: true }).click();
  await expect(video).toHaveCount(0);
  expect(requested).toEqual([2, 2]);
  await page.getByRole("button", { name: "Mark episode complete" }).click();
  await expect(page.getByRole("status").filter({ hasText: "3 episodes watched" })).toBeVisible();
});
test("mobile catalog and media failure remain accessible and can retry", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("link", { name: "Find anime", exact: true }).click();
  await page.locator("main").getByRole("combobox", { name: "Search anime" }).fill("Fixture");
  await page.getByRole("option", { name: /Sabame Fixture Story/ }).click();
  let calls = 0;
  await page.route(`**/api/anime/${anime.id}/media`, (route) => ++calls === 1 ? route.fulfill({ status: 409, json: { error: { code: "mapping_required" } } }) : route.fulfill({ json: media(1) }));
  await page.getByRole("button", { name: "Play episode" }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText("could not be matched safely");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByRole("button", { name: "Request fresh source" }).click();
  await expect(page.locator("video")).toBeVisible();
  await expect.poll(() => page.locator("video").evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThan(0);
  await page.locator("video").evaluate((element: HTMLVideoElement) => element.pause());
  await expect(page.getByRole("combobox", { name: "Status", exact: true })).toHaveValue("watching");
  await page.screenshot({ path: "test-results/media-mobile.png", fullPage: true });
});
