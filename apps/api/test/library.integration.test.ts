import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { createTestDatabase } from "./postgres.js";
import { libraryPage } from "../src/mal/library.js";
import { libraryItem } from "../src/mal/normalization.js";
import { MalRepository } from "../src/database/repository.js";
import { MalModule } from "../src/modules/mal/mal.module.js";
import { MalService } from "../src/modules/mal/mal.service.js";
import { encrypt } from "../src/mal/crypto.js";
import type { MalListStatus } from "@sabame/domain/mal";

const user = { id: 7, name: "viewer" };
const status: MalListStatus = {
  status: "watching",
  num_episodes_watched: 1,
  score: 7,
  is_rewatching: false,
  updated_at: "2026-09-27T00:00:00Z",
};
const item = (id: number) =>
  libraryItem(
    {
      id,
      title: `Anime ${id}`,
      num_episodes: 12,
      synopsis: "x".repeat(10_000),
    },
    status,
  );
let db: Awaited<ReturnType<typeof createTestDatabase>>;
let moduleRef: TestingModule;
let mal: MalService;
beforeEach(async () => {
  db = await createTestDatabase();
  const expiresAt = Date.now() + 3600_000;
  await db.repository.saveAccount(
    user,
    encrypt(
      { accessToken: "test", refreshToken: "test", expiresAt },
      Buffer.alloc(32, 1),
    ),
    expiresAt,
  );
  moduleRef = await Test.createTestingModule({ imports: [MalModule] })
    .overrideProvider(MalRepository)
    .useValue(db.repository)
    .compile();
  mal = moduleRef.get(MalService);
});
afterEach(async () => {
  await moduleRef?.close();
  await db?.close();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("bounded PostgreSQL library snapshots", () => {
  it("pages a library larger than Vercel's response ceiling without losing entries or pending operations", async () => {
    const items = Array.from({ length: 501 }, (_, i) => item(i + 1));
    expect(Buffer.byteLength(JSON.stringify(items))).toBeGreaterThan(
      4.5 * 1024 * 1024,
    );
    await db.repository.replaceEntries(user.id, items);
    for (let i = 0; i < 61; i++)
      await db.repository.saveOperation(user.id, {
        id: `operation-${String(i).padStart(8, "0")}`,
        animeId: items[i].anime.id,
        state: "pending",
        base: status,
        changes: { watchedEpisodes: 2 },
      });
    const ids: string[] = [];
    const operations: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await db.repository.exclusive(user.id, () =>
        libraryPage(db.repository, user, cursor),
      );
      expect(Buffer.byteLength(JSON.stringify(page))).toBeLessThan(
        3 * 1024 * 1024,
      );
      ids.push(...page.items.map((entry) => entry.anime.id));
      operations.push(...page.operations.map((operation) => operation.id));
      cursor = page.nextCursor ?? null;
    } while (cursor);
    expect(ids).toHaveLength(501);
    expect(new Set(ids).size).toBe(501);
    expect(operations).toHaveLength(61);
    expect(new Set(operations).size).toBe(61);
  });
  it("rejects stale snapshots after a pending edit and cursors from another account", async () => {
    await db.repository.replaceEntries(
      user.id,
      Array.from({ length: 51 }, (_, i) => item(i + 1)),
    );
    const first = await libraryPage(db.repository, user);
    const synced = first.lastSyncedAt;
    await db.repository.saveOperation(user.id, {
      id: "operation-00000001",
      animeId: "mal-1",
      state: "pending",
      base: status,
      changes: { watchedEpisodes: 2 },
    });
    expect((await db.repository.account(user.id)).lastSyncedAt).toBe(synced);
    await expect(
      libraryPage(db.repository, user, first.nextCursor),
    ).rejects.toThrow("library_changed");
    await expect(
      libraryPage(db.repository, { id: 8, name: "other" }, first.nextCursor),
    ).rejects.toThrow("invalid_request");
  });
  it("retains the previous list when an import request is cancelled", async () => {
    await db.repository.replaceEntries(user.id, [item(1)]);
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv(
      "MAL_REDIRECT_URI",
      "http://localhost:3000/api/auth/mal/callback",
    );
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
    vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
    const token = await db.repository.createSession(user.id);
    const cancellation = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        cancellation.abort();
        return Response.json({
          data: [
            {
              node: { id: 2, title: "New list", num_episodes: 12 },
              list_status: status,
            },
          ],
          paging: {},
        });
      }),
    );
    const result = await mal.importList(
      new Request("http://localhost:3000/api/mal/import", {
        method: "POST",
        signal: cancellation.signal,
        headers: {
          origin: "http://localhost:3000",
          "content-type": "application/json",
          cookie: `sabame_mal_session=${token}`,
        },
        body: JSON.stringify({ expectedUserId: user.id }),
      }),
    );
    expect(result.ok).toBe(false);
    expect(
      (await db.repository.entries(user.id)).map((entry) => entry.anime.id),
    ).toEqual(["mal-1"]);
  });
});
