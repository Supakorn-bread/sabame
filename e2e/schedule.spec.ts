import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.use({ timezoneId: "Asia/Bangkok" });

const viewports = [
  { name: "desktop", width: 1280, height: 900, rows: [7] },
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
              id: "blue-comet:sub",
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
              airType: "Sub",
            },
            {
              id: "night-archive:dub:tbd",
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
              airType: "Dub",
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
    await expect(page.getByRole("heading", { name: "Blue Comet" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Night Archive" })).toBeVisible();
    await expect(page.getByText("New date to be confirmed")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Time to be confirmed this week" })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Broadcast time zone" })).toHaveValue("local");
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("1 title");

    const dayButtons = page.locator('section[aria-label="Days of the week"] button');
    const positions = await dayButtons.evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().y)));
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
    await page.locator('section[aria-label="Days of the week"] button[aria-label$="0 scheduled"]').first().click();
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("0 titles");
    await expect(page.getByRole("heading", { name: "No broadcasts listed for this day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Time to be confirmed this week" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blue Comet" })).toHaveCount(0);
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.locator("#schedule-day [role=status]")).toHaveText("1 title");
    await expect(page.getByRole("heading", { name: "Blue Comet" })).toBeVisible();

    await page.getByRole("button", { name: "Dub", exact: true }).click();
    await expect.poll(() => requests.length).toBeGreaterThanOrEqual(2);
    expect(requests.at(-1)).toContain("airType=dub");

    await page.getByRole("combobox", { name: "Broadcast time zone" }).selectOption("japan");
    await expect.poll(() => requests.at(-1)).toContain("tz=Asia%2FTokyo");
    await page.getByRole("searchbox", { name: "Search this week schedule" }).fill("Night");
    await expect(page.getByRole("heading", { name: "Night Archive" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "No scheduled broadcasts match this day" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Blue Comet" })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);

    const credit = page.getByRole("link", { name: "Schedule data by AnimeSchedule.net" });
    if (viewport.width === 375) {
      await credit.focus();
      const box = await credit.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height - 70);
    }

    await page.getByRole("searchbox", { name: "Search this week schedule" }).fill("");
    await expect(page.getByRole("heading", { name: "Blue Comet" })).toBeVisible();

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
  await expect(page.getByRole("heading", { name: "Blue Comet" })).toHaveCount(0);
});

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
}
