import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { createTestDatabase } from "./postgres.js";
import { MalRepository } from "../src/database/repository.js";
import { AuthModule } from "../src/modules/auth/auth.module.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { MalService } from "../src/modules/mal/mal.service.js";
import { MalModule } from "../src/modules/mal/mal.module.js";
import { decrypt } from "../src/mal/crypto.js";
import { libraryItem } from "../src/mal/normalization.js";
import { mutateList } from "../src/mal/sync.js";
import type { MalListStatus, MalMutationRequest } from "@sabame/domain/mal";

const origin = "http://localhost:3000";
const base: MalListStatus = {
  status: "on_hold",
  num_episodes_watched: 2,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-09-15T00:00:00Z",
};
const node = { id: 100, title: "Example", num_episodes: 12 };
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let moduleRef: TestingModule;
let auth: AuthService;
let mal: MalService;
beforeEach(async () => {
  db = await createTestDatabase();
  vi.stubEnv("APP_ORIGIN", origin);
  vi.stubEnv("MAL_CLIENT_ID", "test-client");
  vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MAL_REDIRECT_URI", `${origin}/api/auth/mal/callback`);
  vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
  moduleRef = await Test.createTestingModule({
    imports: [AuthModule, MalModule],
  })
    .overrideProvider(MalRepository)
    .useValue(db.repository)
    .compile();
  auth = moduleRef.get(AuthService);
  mal = moduleRef.get(MalService);
});
afterEach(async () => {
  await moduleRef?.close();
  await db?.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
function cookie(response: Response, name: string) {
  return response.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${name}=`))!
    .split(";")[0];
}
async function begin() {
  const response = await auth.startOAuth(
    new Request(`${origin}/api/auth/mal/start`),
  );
  expect(response.status).toBe(303);
  return {
    url: new URL(response.headers.get("location")!),
    cookie: cookie(response, "sabame_mal_oauth"),
  };
}

describe("MAL account flows with PostgreSQL", () => {
  it("completes OAuth once, rotates sessions, encrypts credentials and revokes logout", async () => {
    await db.repository.saveAccount(
      { id: 42, name: "Viewer" },
      "old",
      Date.now(),
    );
    const oldSession = await db.repository.createSession(42);
    const start = await begin();
    expect(start.url.searchParams.get("code_challenge_method")).toBe("plain");
    expect(start.cookie).not.toContain(
      start.url.searchParams.get("code_challenge")!,
    );
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          token_type: "Bearer",
          access_token: "PRIVATE_ACCESS",
          refresh_token: "PRIVATE_REFRESH",
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 42, name: "Viewer" }));
    vi.stubGlobal("fetch", fetcher);
    const callback = new Request(
      `${origin}/api/auth/mal/callback?code=test-code&state=${start.url.searchParams.get("state")}`,
      {
        headers: {
          cookie: `${start.cookie}; sabame_mal_session=${oldSession}`,
        },
      },
    );
    const response = await auth.finishOAuth(callback);
    expect(response.headers.get("location")).toBe(`${origin}/dashboard`);
    expect(response.headers.get("set-cookie")).not.toContain("PRIVATE");
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const credentials = (await db.repository.account(42)).tokens;
    expect(credentials).not.toContain("PRIVATE");
    expect(decrypt(credentials, Buffer.alloc(32, 1))).toMatchObject({
      accessToken: "PRIVATE_ACCESS",
    });
    expect(await db.repository.session(oldSession)).toBeNull();
    const sessionCookie = cookie(response, "sabame_mal_session");
    expect(
      await (
        await auth.session(
          new Request(`${origin}/api/auth/session`, {
            headers: { cookie: sessionCookie },
          }),
        )
      ).json(),
    ).toEqual({ configured: true, user: { id: 42, name: "Viewer" } });
    expect(
      (await auth.finishOAuth(callback)).headers.get("location"),
    ).toContain("invalid_callback");
    expect(fetcher).toHaveBeenCalledTimes(2);
    const loggedOut = await auth.logout(
      new Request(`${origin}/api/auth/logout`, {
        method: "POST",
        headers: {
          cookie: sessionCookie,
          origin,
          "content-type": "application/json",
        },
        body: "{}",
      }),
    );
    expect(await loggedOut.json()).toEqual({ success: true });
    expect(loggedOut.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(await db.repository.session(sessionCookie.split("=")[1])).toBeNull();
  });

  it("rejects mismatched state and consumes consent denial without contacting MAL", async () => {
    const start = await begin();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const invalid = await auth.finishOAuth(
      new Request(`${origin}/api/auth/mal/callback?state=wrong&code=code`, {
        headers: { cookie: start.cookie },
      }),
    );
    expect(invalid.headers.get("location")).toContain("invalid_callback");
    const callback = new Request(
      `${origin}/api/auth/mal/callback?error=access_denied&state=${start.url.searchParams.get("state")}`,
      { headers: { cookie: start.cookie } },
    );
    expect(
      (await auth.finishOAuth(callback)).headers.get("location"),
    ).toContain("access_denied");
    expect(
      (await auth.finishOAuth(callback)).headers.get("location"),
    ).toContain("invalid_callback");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("isolates library reads and rejects account-switch and cross-origin writes", async () => {
    for (const id of [1, 2])
      await db.repository.saveAccount(
        { id, name: `viewer${id}` },
        "encrypted",
        Date.now(),
      );
    await db.repository.saveEntry(1, libraryItem(node, base));
    const token = await db.repository.createSession(2);
    const headers = {
      cookie: `sabame_mal_session=${token}`,
      origin,
      "content-type": "application/json",
    };
    const response = await mal.list(
      new Request(`${origin}/api/mal/list`, { headers }),
    );
    expect(await response.json()).toMatchObject({ user: { id: 2 }, items: [] });
    const request = (extra: Record<string, string>) =>
      new Request(`${origin}/api/mal/anime/mal-100`, {
        method: "PATCH",
        headers: { ...headers, ...extra },
        body: JSON.stringify({ expectedUserId: 1 }),
      });
    expect((await mal.patch(request({}), "mal-100")).status).toBe(409);
    expect(
      (await mal.patch(request({ origin: "https://evil.test" }), "mal-100"))
        .status,
    ).toBe(403);
  });

  it("keeps retries idempotent after JSONB reorders keys and detects changed operations", async () => {
    await db.repository.saveAccount(
      { id: 1, name: "viewer" },
      "encrypted",
      Date.now(),
    );
    const request: MalMutationRequest = {
      expectedUserId: 1,
      operationId: "operation-00000001",
      base,
      changes: { watchedEpisodes: 3, status: "watching" },
    };
    const client = {
      details: vi.fn().mockResolvedValue({ node, status: base }),
      update: vi.fn().mockResolvedValue({
        ...base,
        status: "watching",
        num_episodes_watched: 3,
      }),
    };
    expect(
      (await mutateList(db.repository, 1, "mal-100", request, client)).operation
        .state,
    ).toBe("synced");
    expect(
      (await mutateList(db.repository, 1, "mal-100", request, client)).operation
        .state,
    ).toBe("synced");
    expect(client.update).toHaveBeenCalledTimes(1);
    await expect(
      mutateList(
        db.repository,
        1,
        "mal-100",
        { ...request, changes: { watchedEpisodes: 4 } },
        client,
      ),
    ).rejects.toThrow("operation_mismatch");
  });

  it("preserves conflicts and recovers an acknowledged remote edit without repeating PATCH", async () => {
    await db.repository.saveAccount(
      { id: 1, name: "viewer" },
      "encrypted",
      Date.now(),
    );
    const request: MalMutationRequest = {
      expectedUserId: 1,
      operationId: "operation-00000002",
      base,
      changes: { watchedEpisodes: 3 },
    };
    const client = {
      details: vi.fn().mockResolvedValue({
        node,
        status: { ...base, num_episodes_watched: 4 },
      }),
      update: vi.fn(),
    };
    expect(
      (await mutateList(db.repository, 1, "mal-100", request, client)).operation
        .state,
    ).toBe("conflict");
    expect(client.update).not.toHaveBeenCalled();
    client.details.mockResolvedValue({
      node,
      status: { ...base, num_episodes_watched: 3 },
    });
    expect(
      (await mutateList(db.repository, 1, "mal-100", request, client)).operation
        .state,
    ).toBe("synced");
    expect(client.update).not.toHaveBeenCalled();
  });
});
