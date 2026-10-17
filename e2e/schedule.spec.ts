import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Bangkok", launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

const viewports = [
  { name: "desktop", width: 1280, height: 900, rows: [] },
  { name: "mobile", width: 375, height: 812, rows: [4, 3] },
  { name: "landscape", width: 844, height: 390, rows: [4, 3] },
] as const;

const poster = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iPKsAAAAASUVORK5CYII=", "base64");

for (const viewport of viewports) {
  test(`broadcast schedule works in ${viewport.name} (${viewport.width}px)`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.clock.setFixedTime(new Date("2026-09-23T05:00:00.000Z"));
    await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
    const requests: string[] = [];
    const broadcastAt = "2026-09-23T05:00:00.000Z";

    await page.route("**/api/schedule?*", async (route) => {
      requests.push(route.request().url());
      await route.fulfill({
        json: {
          state: "ready",
          season: { year: 2026, season: "summer" },
          matchedAnimeCount: 2,
          items: [
            {
              id: "blue-comet:raw",
              title: "Blue Comet",
              route: "blue-comet",
              imageVersionRoute: "covers/blue-comet-v1.jpg",
              episodeDate: broadcastAt,
              delayedUntil: null,
              delayedText: null,
              episodeNumber: 4,
              subtractedEpisodeNumber: null,
              status: "Upcoming",
              airingStatus: "upcoming",
              airType: "Raw",
            },
            {
              id: "night-archive:raw:tbd",
              title: "Night Archive",
              route: "night-archive",
              imageVersionRoute: "covers/night-archive-v1.jpg",
              episodeDate: null,
              delayedUntil: null,
              delayedText: "New date to be confirmed",
              episodeNumber: null,
              subtractedEpisodeNumber: null,
              status: "Delayed",
              airingStatus: null,
              airType: "Raw",
            },
          ],
        },
      });
    });
    await page.route("**/_next/image**", (route) => route.fulfill({ status: 200, contentType: "image/png", body: poster }));

    await page.goto("/login");
    await page.getByRole("button", { name: "Try demo instantly" }).click();
    await page.goto("/schedule");
    await expect(page.getByRole("heading", { name: "Broadcast schedule" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Night Archive" })).toBeVisible();
    await expect(page.getByText("New date to be confirmed")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Time to be confirmed this week" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Broadcast time zone" })).toHaveValue("local");
    expect(requests[0]).toContain("airType=raw");
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("1 title");

    if (viewport.width >= 1024) {
      await expect(page.getByRole("table", { name: "Weekly broadcast calendar" })).toBeVisible();
      await expect(page.getByRole("columnheader")).toHaveCount(8);
      await expect(page.getByRole("button", { name: "Week", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("button", { name: "Show details for Blue Comet", exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole("heading", { name: "Blue Comet", exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Daytime", exact: true })).toBeVisible();
      await expect(page.getByRole("table", { name: "Daily broadcast calendar" })).toHaveCount(0);
      await expect(page.getByRole("group", { name: "Calendar view" })).toBeHidden();
    }
    const dayButtons = page.locator('section[aria-label="Days of the week"] button');
    const positions = await dayButtons.filter({ visible: true }).evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().y)));
    const rowCounts = positions.reduce<number[]>((rows, position) => {
      if (rows.length === 0 || rows[rows.length - 1] !== position) rows.push(position);
      return rows;
    }, []).map((position) => positions.filter((candidate) => candidate === position).length);
    expect(rowCounts).toEqual(viewport.rows);

    const previousWeek = await page.getByRole("button", { name: "Previous week" }).boundingBox();
    expect(previousWeek?.width).toBeGreaterThanOrEqual(44);
    expect(previousWeek?.height).toBeGreaterThanOrEqual(44);
    await expectNoHorizontalOverflow(page);

    if (viewport.width === 375) {
      await expect(page.getByRole("searchbox", { name: "Search this week schedule" })).toHaveCSS("font-size", "16px");
    }

    await page.screenshot({ path: `test-results/schedule-${viewport.name}-light.png`, fullPage: true });
    const lightViolations = await new AxeBuilder({ page }).include("#main-content").analyze();
    expect(lightViolations.violations).toEqual([]);
    if (viewport.width >= 1024) {
      await page.getByRole("button", { name: "Show details for Blue Comet", exact: true }).click();
      await expect(page.getByRole("dialog", { name: "Blue Comet broadcast details" })).toBeVisible();
      const overlayViolations = await new AxeBuilder({ page }).include("#main-content").include("[data-schedule-overlay]").analyze();
      expect(overlayViolations.violations).toEqual([]);
      await page.bringToFront();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Show details for Blue Comet", exact: true })).toBeFocused();
      await page.getByRole("button", { name: "Day", exact: true }).click();
    }
    await page.locator('section[aria-label="Days of the week"] button[aria-label$="0 scheduled"]').first().click();
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("0 titles");
    await expect(page.getByRole("heading", { name: "No broadcasts listed for this day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Time to be confirmed this week" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blue Comet", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("1 title");
    await expect(page.getByRole("heading", { name: "Blue Comet", exact: true })).toBeVisible();

    await page.getByRole("combobox", { name: "Broadcast time zone" }).selectOption("japan");
    await expect.poll(() => requests.at(-1)).toContain("tz=Asia%2FTokyo");
    expect(requests.at(-1)).toContain("airType=raw");
    await page.getByRole("searchbox", { name: "Search this week schedule" }).fill("Night");
    await expect(page.getByRole("heading", { name: "Night Archive" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No scheduled broadcasts match this day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blue Comet", exact: true })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const credit = page.getByRole("link", { name: "Schedule data by AnimeSchedule.net" });
    if (viewport.width === 375) {
      await credit.focus();
      const box = await credit.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 70);
    }

    await page.getByRole("searchbox", { name: "Search this week schedule" }).fill("");
    await expect(page.getByRole("heading", { name: "Blue Comet", exact: true })).toBeVisible();

    if (viewport.width === 1280) {
      const theme = page.getByRole("button", { name: /^Theme:/ });
      for (let attempt = 0; attempt < 3; attempt++) {
        const label = await theme.getAttribute("aria-label");
        if (label?.startsWith("Theme: dark.")) break;
        await theme.click();
      }
      await expect(page.locator("html")).toHaveClass(/dark/);
      await expectNoHorizontalOverflow(page);
      const darkViolations = await new AxeBuilder({ page }).include("#main-content").analyze();
      expect(darkViolations.violations).toEqual([]);
      await page.screenshot({ path: "test-results/schedule-desktop-dark.png", fullPage: true });
    }
  });
}

test("demo mode does not fall back to a global broadcast schedule", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-23T05:00:00.000Z"));
  await page.route("**/api/auth/session", (route) => route.fulfill({ json: { configured: true, user: null } }));
  await page.route("**/api/schedule?*", (route) => route.fulfill({
    status: 401,
    json: { error: { code: "unauthorized" } },
  }));

  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.goto("/schedule");

  await expect(page.getByRole("heading", { name: "Connect MyAnimeList to personalize your schedule" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Connect MyAnimeList/ })).toHaveAttribute("href", "/api/auth/mal/start");
  await expect(page.getByRole("group", { name: "Broadcast language" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show details for Blue Comet", exact: true })).toHaveCount(0);
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}

test("calendar groups exact minutes and keeps portal details within the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-23T05:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  const base = { route: "comet", imageVersionRoute: null, delayedUntil: null as string | null, delayedText: null as string | null, episodeNumber: 4, subtractedEpisodeNumber: null, status: "Upcoming", airingStatus: "upcoming", airType: "Raw" };
  const items = [1, 2, 3, 4].flatMap((count, day) => Array.from({ length: count }, (_, index) => ({ ...base, id: `${count}-${index}`, title: `Group ${count} Anime ${index}`, episodeDate: `2026-09-${23 + day}T05:00:00Z` })));
  items.push({ ...base, id: "last", title: "Sunday Edge", episodeDate: "2026-09-27T05:01:00Z", status: "Delayed", delayedUntil: "2026-09-27T05:01:00Z", delayedText: "A replacement broadcast time is being confirmed. ".repeat(20) });
  await page.route("**/api/schedule?*", (route) => route.fulfill({ json: { state: "ready", season: { year: 2026, season: "summer" }, matchedAnimeCount: 11, items } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.goto("/schedule");
  const table = page.getByRole("table", { name: "Weekly broadcast calendar" });
  await expect(table.getByRole("rowheader")).toHaveText(["12:00", "12:01"]);
  for (const count of [2, 3, 4]) {
    await page.getByRole("button", { name: `${count} broadcasts at 12:00`, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: /Show details for|Select Group/ })).toHaveCount(Math.min(3, count));
    await expect(dialog.getByRole("button", { name: "Previous broadcast" })).toBeDisabled();
    if (count <= 3) await expect(dialog.getByRole("button", { name: "Next broadcast" })).toBeDisabled();
    else {
      await dialog.getByRole("button", { name: "Next broadcast" }).click();
      await expect(dialog.getByRole("button", { name: "Next broadcast" })).toBeDisabled();
      await expect(dialog.getByRole("button", { name: "Show details for Group 4 Anime 3" })).toBeVisible();
      await dialog.getByRole("button", { name: "Previous broadcast" }).click();
    }
    await dialog.getByRole("button", { name: `Show details for Group ${count} Anime 0` }).hover();
    await expect(dialog.getByRole("heading", { name: `Group ${count} Anime 0` })).toBeVisible();
    await page.mouse.move(1, 1);
    await expect(dialog).toBeVisible();
    await page.mouse.click(1, 1);
    await expect(dialog).toHaveCount(0);
  }
  const edge = page.getByRole("button", { name: "Show details for Sunday Edge", exact: true });
  await edge.scrollIntoViewIfNeeded();
  const before = await table.boundingBox();
  const focusedBeforeHover = await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.getAttribute("aria-label"));
  await edge.hover();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Sunday Edge" })).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.tagName + ":" + document.activeElement?.getAttribute("aria-label"))).toEqual(focusedBeforeHover);
  const bounds = await dialog.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(1280);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
  const after = await table.boundingBox();
  expect([after!.x, after!.width, after!.height]).toEqual([before!.x, before!.width, before!.height]);
  const cover = await dialog.getByRole("button", { name: "Sunday Edge cover" }).boundingBox();
  const heading = await dialog.getByRole("heading").boundingBox();
  await expect(dialog).toHaveAttribute("data-direction", "left");
  const information = dialog.getByRole("region", { name: "Sunday Edge broadcast information" });
  const informationBounds = await information.boundingBox();
  expect(informationBounds!.x + informationBounds!.width).toBeLessThanOrEqual(cover!.x + 1);
  expect(bounds!.height).toBeCloseTo(cover!.height, 0);
  expect(await information.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await page.mouse.move(cover!.x + cover!.width / 2, cover!.y + cover!.height / 2);
  await page.mouse.move(heading!.x + heading!.width / 2, heading!.y + heading!.height / 2, { steps: 8 });
  await expect(dialog).toBeVisible();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => information.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
  expect((await dialog.boundingBox())!.height).toBeCloseTo(cover!.height, 0);
  expect((await new AxeBuilder({ page }).include("#main-content").include("[data-schedule-overlay]").analyze()).violations).toEqual([]);
  await page.mouse.move(1, 1);
  await expect(dialog).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("loading placeholders match Week and Day layouts and dropdown arrows have spacing", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-23T05:00:00Z"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  let releaseSchedule = () => {};
  const scheduleReady = new Promise<void>((resolve) => { releaseSchedule = resolve; });
  await page.route("**/api/schedule?*", async (route) => {
    await scheduleReady;
    await route.fulfill({ json: { state: "ready", season: { year: 2026, season: "summer" }, matchedAnimeCount: 1, items: [] } });
  });
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.goto("/schedule");

  const panel = page.locator("#schedule-day");
  const week = page.locator('[data-schedule-skeleton="week"]');
  const day = page.locator('[data-schedule-skeleton="day"]');
  await expect(panel).toHaveAttribute("aria-busy", "true");
  await expect(week).toBeVisible();
  await expect(week.locator("thead th")).toHaveCount(8);
  await expect(week.locator("tbody td")).toHaveCount(21);
  expect((await week.boundingBox())!.height).toBeGreaterThan(600);
  const zone = page.getByRole("combobox", { name: "Broadcast time zone" });
  await expect(zone).toHaveCSS("padding-right", "40px");
  await expect(zone).toHaveCSS("background-position", "calc(100% - 14px) 50%");

  await page.getByRole("button", { name: "Day", exact: true }).click();
  await expect(day).toBeVisible();
  await expect(week).toHaveCount(0);
  await page.getByRole("button", { name: "Week", exact: true }).click();
  await expect(week).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(day).toBeVisible();
  await expect(week).toHaveCount(0);
  await expectNoHorizontalOverflow(page);

  releaseSchedule();
  await expect(panel).toHaveAttribute("aria-busy", "false");
  await expect(day).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No broadcasts listed for this day" })).toBeVisible();
});

test("right-edge cover stays anchored through rapid hover reversals", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date("2026-09-23T05:00:00Z"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const item = { id: "edge", title: "Edge broadcast", route: "edge", imageVersionRoute: null, episodeDate: "2026-09-27T05:00:00Z", delayedUntil: null, delayedText: null, episodeNumber: 4, subtractedEpisodeNumber: null, status: "Upcoming", airingStatus: "upcoming", airType: "Raw" };
  await page.route("**/api/schedule?*", (route) => route.fulfill({ json: { state: "ready", season: { year: 2026, season: "summer" }, matchedAnimeCount: 1, items: [item] } }));
  await page.goto("/login");
  await page.getByRole("button", { name: "Try demo instantly" }).click();
  await page.goto("/schedule");
  const trigger = page.getByRole("button", { name: "Show details for Edge broadcast" });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    window.scrollBy({ top: bounds.bottom - (window.innerHeight - 4), behavior: "instant" });
  });
  const anchor = (await trigger.boundingBox())!;
  const measurements = page.evaluate(async () => {
    const samples: { x: number; y: number; right: number }[] = [];
    const trigger = document.querySelector<HTMLElement>('[aria-label="Show details for Edge broadcast"]')!;
    let blankFrames = 0;
    const end = performance.now() + 2000;
    while (performance.now() < end) {
      const root = document.querySelector("[data-schedule-overlay=detail]");
      const cover = root?.querySelector("button");
      if (getComputedStyle(trigger).visibility === "hidden" && !cover) blankFrames += 1;
      if (root && cover) samples.push({ x: cover.getBoundingClientRect().x, y: cover.getBoundingClientRect().y, right: root.getBoundingClientRect().right });
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    }
    return { samples, blankFrames };
  });
  for (const delay of [20, 35, 60, 90, 40, 15, 120, 50]) {
    await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
    await page.waitForTimeout(delay);
    await page.mouse.move(anchor.x + anchor.width + 20, anchor.y + anchor.height / 2);
    await page.waitForTimeout(delay);
  }
  await page.mouse.move(anchor.x + anchor.width / 2, anchor.y + anchor.height / 2);
  await expect(page.getByRole("dialog")).toHaveAttribute("data-phase", "open");
  const { samples, blankFrames } = await measurements;
  expect(blankFrames).toBe(0);
  expect(samples.length).toBeGreaterThan(10);
  expect(Math.max(...samples.map((sample) => Math.abs(sample.x - anchor.x)))).toBeLessThan(1);
  expect(Math.max(...samples.map((sample) => Math.abs(sample.y - anchor.y)))).toBeLessThan(1);
  expect(Math.max(...samples.map((sample) => sample.right))).toBeLessThanOrEqual(1280);
  await page.mouse.move(1, 1);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
