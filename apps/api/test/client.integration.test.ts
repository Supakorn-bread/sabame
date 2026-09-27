// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MalClient, exchangeTokens } from "../src/mal/client.js";
import { encrypt } from "../src/mal/crypto.js";
import { MalRepository } from "../src/database/repository.js";

import { createTestDatabase } from "./postgres.js";
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let repository: MalRepository;
const status = {
  status: "on_hold",
  num_episodes_watched: 2,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-09-15T00:00:00Z",
};
beforeEach(async () => {
  db = await createTestDatabase();
  vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("MAL_CLIENT_ID", "test-client");
  vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MAL_REDIRECT_URI", "http://localhost:3000/api/auth/mal/callback");
  vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
  vi.stubEnv("VERCEL", "");
  repository = db.repository;
  await repository.saveAccount(
    { id: 1, name: "viewer" },
    encrypt(
      {
        accessToken: "test-access",
        refreshToken: "test-refresh",
        expiresAt: Date.now() + 3600_000,
      },
      Buffer.alloc(32, 1),
    ),
    Date.now() + 3600_000,
  );
});
afterEach(async () => {
  await db?.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("official MAL client contract", () => {
  it("follows every page, uses response watched field and preserves status", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              node: { id: 1, title: "One", num_episodes: 12 },
              list_status: status,
            },
          ],
          paging: {
            next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=100",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              node: { id: 2, title: "Two", num_episodes: 0 },
              list_status: { ...status, status: "dropped" },
            },
          ],
          paging: {},
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const items = await new MalClient(repository, 1).list();
    expect(items.map((item) => item.entry.status)).toEqual([
      "on_hold",
      "dropped",
    ]);
    expect(items[0].entry.watchedEpisodes).toBe(2);
    expect(items[1].anime.totalEpisodes).toBeNull();
    expect(fetcher.mock.calls[1][0]).toContain("offset=100");
  });
  it("does not follow an untrusted next URL with the bearer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        data: [
          {
            node: { id: 1, title: "One", num_episodes: 12 },
            list_status: status,
          },
        ],
        paging: { next: "https://attacker.test/?offset=100" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(new MalClient(repository, 1).list()).rejects.toThrow(
      "invalid_mal_response",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("uses form-encoded num_watched_episodes for PATCH without resetting score", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(status));
    vi.stubGlobal("fetch", fetcher);
    await new MalClient(repository, 1).update("mal-1", { watchedEpisodes: 2 });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe("https://api.myanimelist.net/v2/anime/1/my_list_status");
    expect(options.method).toBe("PATCH");
    expect(options.body.toString()).toBe("num_watched_episodes=2");
  });
  it("refreshes once on 401 and stores the rotated credentials", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(Response.json({}, { status: 401 }))
      .mockResolvedValueOnce(
        Response.json({
          token_type: "Bearer",
          access_token: "replacement",
          refresh_token: "replacement-refresh",
          expires_in: 60,
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 1,
          title: "One",
          num_episodes: 12,
          my_list_status: status,
        }),
      );
    vi.stubGlobal("fetch", fetcher);
    const result = await new MalClient(repository, 1).details("mal-1");
    expect(result.status?.score).toBe(8);
    expect(fetcher.mock.calls[1][1].body.get("grant_type")).toBe(
      "refresh_token",
    );
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe(
      "Bearer replacement",
    );
    expect((await repository.account(1)).tokens).not.toContain("replacement");
  });
  it("uses expiry from token response and PKCE verifier in exchange", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({
        token_type: "Bearer",
        access_token: "a",
        refresh_token: "r",
        expires_in: 120,
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    const before = Date.now();
    const tokens = await exchangeTokens({
      grant_type: "authorization_code",
      code: "code",
      code_verifier: "verifier",
    });
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 120_000);
    expect(fetcher.mock.calls[0][1].body.get("code_verifier")).toBe("verifier");
  });
  it("rejects partial imports without replacing saved list", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              node: { id: 1, title: "One", num_episodes: 12 },
              list_status: status,
            },
          ],
          paging: {
            next: "https://api.myanimelist.net/v2/users/@me/animelist?offset=100",
          },
        }),
      )
      .mockResolvedValueOnce(Response.json({}, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(new MalClient(repository, 1).list()).rejects.toThrow(
      "mal_unavailable",
    );
    expect((await repository.account(1)).imported).toBe(false);
    expect(await repository.entries(1)).toEqual([]);
  });
});
