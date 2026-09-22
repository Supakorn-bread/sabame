// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => cookieJar.has(name) ? { value: cookieJar.get(name) } : undefined, delete: (name: string) => cookieJar.delete(name) }) }));
import { startOAuth, finishOAuth } from "./oauth";
import { OAUTH_COOKIE, SESSION_COOKIE, readBody } from "./http";
import { malRepository } from "./repository";
import { GET as session } from "@/app/api/auth/session/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { PATCH as updateProgress } from "@/app/api/mal/anime/[animeId]/route";
import { GET as getLibrary } from "@/app/api/mal/list/route";
import { encrypt } from "./crypto";

let directory: string;
const origin = "http://localhost:3000";
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "sabame-mal-test-"));
  vi.stubEnv("MAL_CLIENT_ID", "test-client"); vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MAL_REDIRECT_URI", `${origin}/api/auth/mal/callback`); vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
  vi.stubEnv("MAL_DATABASE_PATH", join(directory, "account.sqlite")); vi.stubEnv("VERCEL", "");
  cookieJar.clear();
});
afterEach(() => { malRepository().db.close(); rmSync(directory, { recursive: true, force: true }); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function start() {
  const response = await startOAuth(new Request(`${origin}/api/auth/mal/start`));
  cookieJar.set(OAUTH_COOKIE, response.cookies.get(OAUTH_COOKIE)!.value);
  return new URL(response.headers.get("location")!);
}

describe("MAL OAuth route integration", () => {
  it("uses unique plain PKCE and keeps verifier out of cookie", async () => {
    const url = await start();
    expect(url.origin).toBe("https://myanimelist.net");
    expect(url.searchParams.get("code_challenge_method")).toBe("plain");
    expect(url.searchParams.get("code_challenge")).toHaveLength(43);
    expect(cookieJar.get(OAUTH_COOKIE)).not.toBe(url.searchParams.get("code_challenge"));
    const second = await start();
    expect(second.searchParams.get("state")).not.toBe(url.searchParams.get("state"));
  });
  it("exchanges once, creates server session and returns no tokens to browser", async () => {
    const url = await start();
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ token_type: "Bearer", access_token: "PRIVATE_ACCESS", refresh_token: "PRIVATE_REFRESH", expires_in: 3600 })).mockResolvedValueOnce(Response.json({ id: 42, name: "Viewer" }));
    vi.stubGlobal("fetch", fetcher);
    const callback = new Request(`${origin}/api/auth/mal/callback?code=private-code&state=${url.searchParams.get("state")}`);
    const response = await finishOAuth(callback);
    expect(response.headers.get("location")).toBe(`${origin}/dashboard`);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).not.toContain("PRIVATE");
    expect(fetcher.mock.calls[0][1].body.get("code_verifier")).toBe(url.searchParams.get("code_challenge"));
    cookieJar.set(SESSION_COOKIE, response.cookies.get(SESSION_COOKIE)!.value);
    const current = await session();
    expect(await current.json()).toEqual({ configured: true, user: { id: 42, name: "Viewer" } });
    expect(malRepository().account(42).tokens).not.toContain("PRIVATE");
    expect((await finishOAuth(callback)).headers.get("location")).toContain("mal_error=invalid_callback");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched callback and handles consent denial without token exchange", async () => {
    const url = await start();
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const invalid = await finishOAuth(new Request(`${origin}/api/auth/mal/callback?code=code&state=wrong`));
    expect(invalid.headers.get("location")).toContain("invalid_callback");
    const denied = await finishOAuth(new Request(`${origin}/api/auth/mal/callback?error=access_denied&state=${url.searchParams.get("state")}`));
    expect(denied.headers.get("location")).toContain("access_denied");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("invalidates server session on logout and never authenticates from local state", async () => {
    const repository = malRepository();
    repository.saveAccount({ id: 42, name: "Viewer" }, "encrypted", Date.now() + 3600_000);
    const token = repository.createSession(42); cookieJar.set(SESSION_COOKIE, token);
    const response = await logout(new Request(`${origin}/api/auth/logout`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: "{}" }));
    expect(response.status).toBe(200);
    expect(repository.session(token)).toBeNull();
    expect(await (await session()).json()).toEqual({ configured: true, user: null });
  });
  it("rejects cross-origin, malformed and oversized mutations", async () => {
    await expect(readBody(new Request(`${origin}/api/mal/import`, { method: "POST", headers: { origin: "https://attacker.test", "Content-Type": "application/json" }, body: "{}" }))).rejects.toThrow("invalid_origin");
    await expect(readBody(new Request(`${origin}/api/mal/import`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: "{" }))).rejects.toThrow("invalid_request");
    await expect(readBody(new Request(`${origin}/api/mal/import`, { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: "x".repeat(17000) }))).rejects.toThrow("invalid_request");
  });
  it("authenticates the progress route and rejects account substitution before calling MAL", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    const request = () => new Request(`${origin}/api/mal/anime/mal-100`, { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ expectedUserId: 99, operationId: "operation-00000001", base: null, changes: { watchedEpisodes: 3 } }) });
    expect((await updateProgress(request(), { params: Promise.resolve({ animeId: "mal-100" }) })).status).toBe(401);
    malRepository().saveAccount({ id: 42, name: "Viewer" }, "encrypted", Date.now() + 3600_000);
    cookieJar.set(SESSION_COOKIE, malRepository().createSession(42));
    expect((await updateProgress(request(), { params: Promise.resolve({ animeId: "mal-100" }) })).status).toBe(409);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("takes an authenticated progress request through MAL acknowledgement and stored library response", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const repository = malRepository();
    const expiresAt = Date.now() + 3600_000;
    repository.saveAccount({ id: 42, name: "Viewer" }, encrypt({ accessToken: "test-access", refreshToken: "test-refresh", expiresAt }, Buffer.alloc(32, 1)), expiresAt);
    cookieJar.set(SESSION_COOKIE, repository.createSession(42));
    const base = { status: "on_hold", num_episodes_watched: 2, score: 8, is_rewatching: true, updated_at: "2026-09-22T00:00:00Z" };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ id: 100, title: "Test", num_episodes: 12, my_list_status: base })).mockResolvedValueOnce(Response.json({ ...base, num_episodes_watched: 3 }));
    vi.stubGlobal("fetch", fetcher);
    const response = await updateProgress(new Request(`${origin}/api/mal/anime/mal-100`, { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify({ expectedUserId: 42, operationId: "operation-00000001", base, changes: { watchedEpisodes: 3 } }) }), { params: Promise.resolve({ animeId: "mal-100" }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operation: { state: "synced" }, item: { entry: { watchedEpisodes: 3, personalScore: 8, isRewatching: true, status: "on_hold" } } });
    const list = await getLibrary();
    expect(list.headers.get("cache-control")).toContain("no-store");
    expect(await list.json()).toMatchObject({ user: { id: 42 }, items: [{ anime: { id: "mal-100" }, entry: { watchedEpisodes: 3 } }], operations: [] });
  });
});
