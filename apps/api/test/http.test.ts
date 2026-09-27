import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { INestApplication } from "@nestjs/common";
import { createApp } from "../src/app.js";

let app: INestApplication;
let origin: string;
beforeAll(async () => {
  for (const name of [
    "DATABASE_URL",
    "MAL_CLIENT_ID",
    "MAL_CLIENT_SECRET",
    "MAL_TOKEN_ENCRYPTION_KEY",
  ])
    vi.stubEnv(name, "");
  vi.stubEnv("APP_ORIGIN", "https://sabame.test");
  app = await createApp();
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  vi.unstubAllEnvs();
});

describe("Nest HTTP compatibility without account configuration", () => {
  it("starts without connecting to a database and reports readiness separately", async () => {
    expect((await fetch(`${origin}/api/health`)).status).toBe(200);
    const ready = await fetch(`${origin}/api/ready`);
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "unavailable" });
  });
  it("preserves the private unconfigured session response", async () => {
    const response = await fetch(`${origin}/api/auth/session`);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(await response.json()).toEqual({ configured: false, user: null });
  });
  it("uses the configured frontend for redirects despite spoofed host headers", async () => {
    const response = await fetch(`${origin}/api/auth/mal/start`, {
      redirect: "manual",
      headers: {
        "x-forwarded-host": "evil.test",
        "x-forwarded-proto": "http",
        host: "evil.test",
      },
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://sabame.test/login?mal_error=not_configured",
    );
  });
  it.each([
    "year=1900&season=summer",
    "year=2026&season=invalid",
    "year=2026&season=summer&page=-1",
    "year=2026&season=summer&page=1.5",
  ])(
    "rejects invalid seasonal parameters without upstream calls: %s",
    async (query) => {
      const response = await fetch(`${origin}/api/anime/seasonal?${query}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({
        error: { code: "invalid_request" },
      });
    },
  );
  it("rejects invalid timetable parameters and oversized mutation bodies", async () => {
    expect(
      (await fetch(`${origin}/api/schedule?year=2026&week=0`)).status,
    ).toBe(400);
    const response = await fetch(`${origin}/api/mal/import`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://sabame.test",
      },
      body: JSON.stringify({ padding: "a".repeat(17_000) }),
    });
    expect(response.status).toBe(413);
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_request" },
    });
  });
  it("does not claim playback routes", async () => {
    const missingRoute = await fetch(`${origin}/api/media/resource`);
    expect(missingRoute.status).toBe(404);
    expect(await missingRoute.json()).toMatchObject({ statusCode: 404 });
    expect(
      (await fetch(`${origin}/api/anime/mal-1/media`, { method: "POST" }))
        .status,
    ).toBe(404);
  });
  it("reports a database outage instead of pretending configured accounts are disabled", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://sabame@127.0.0.1:1/sabame_test");
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
    vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
    vi.stubEnv("MAL_REDIRECT_URI", "https://sabame.test/api/auth/mal/callback");
    const response = await fetch(`${origin}/api/auth/session`, {
      headers: { cookie: `sabame_mal_session=${"a".repeat(43)}` },
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "database_unavailable" },
    });
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
});
