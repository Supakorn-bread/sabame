import { expect, test } from "@playwright/test";

test("frontend forwards API requests to Nest and leaves playback in Next", async ({ request }) => {
  expect((await request.get("/api/health")).status()).toBe(200);
  const session = await request.get("/api/auth/session");
  expect(session.status()).toBe(200);
  expect(await session.json()).toEqual({ configured: Boolean(process.env.TEST_DATABASE_URL), user: null });
  expect(session.headers()["cache-control"]).toContain("no-store");

  // Invalid parameters must be rejected by the migrated controller, before
  // accessing external services or leaking a framework-default error response.
  const seasonal = await request.get("/api/anime/seasonal?year=1900&season=summer");
  expect(seasonal.status()).toBe(400);
  expect(await seasonal.json()).toMatchObject({ error: { code: "invalid_request" } });

  const playback = await request.get("/api/media/resource");
  expect(playback.status()).toBe(403);
  expect(await playback.json()).toMatchObject({ error: { code: "invalid_ticket" } });
});

test("unconfigured OAuth redirects back to the frontend login page", async ({ request }) => {
  test.skip(Boolean(process.env.TEST_DATABASE_URL), "Covered by the configured OAuth flow when PostgreSQL is enabled");
  const response = await request.get("/api/auth/mal/start", { maxRedirects: 0 });
  expect(response.status()).toBe(303);
  const destination = new URL(response.headers().location, response.url());
  expect(destination.origin).toBe(new URL(response.url()).origin);
  expect(destination.pathname).toBe("/login");
  expect(destination.searchParams.get("mal_error")).toBe("not_configured");
});

test("OAuth cookies survive the Next-to-Nest boundary and consent denial consumes state", async ({ context, baseURL }) => {
  const request = context.request;
  test.skip(!process.env.TEST_DATABASE_URL, "Requires the migrated local sabame_test database");
  const start = await request.get("/api/auth/mal/start", { maxRedirects: 0 });
  expect(start.status()).toBe(303);
  const authorize = new URL(start.headers().location);
  expect(authorize.origin).toBe("https://myanimelist.net");
  expect(authorize.searchParams.get("redirect_uri")).toBe(`${baseURL}/api/auth/mal/callback`);
  const oauthCookie = (await context.cookies(`${baseURL}/api/auth/mal/callback`)).find((cookie) => cookie.name === "sabame_mal_oauth");
  expect(oauthCookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/api/auth/mal" });
  expect(oauthCookie?.value).not.toBe(authorize.searchParams.get("code_challenge"));
  const callback = `/api/auth/mal/callback?error=access_denied&state=${encodeURIComponent(authorize.searchParams.get("state")!)}`;
  const denied = await request.get(callback, { maxRedirects: 0 });
  expect(denied.status()).toBe(303);
  expect(denied.headers().location).toBe(`${baseURL}/login?mal_error=access_denied`);
  expect((await context.cookies()).some((cookie) => cookie.name === "sabame_mal_oauth")).toBe(false);
  const replay = await request.get(callback, {
    maxRedirects: 0, headers: { cookie: `sabame_mal_oauth=${oauthCookie!.value}` },
  });
  expect(replay.headers().location).toBe(`${baseURL}/login?mal_error=invalid_callback`);
});
