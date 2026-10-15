import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Test, type TestingModule } from "@nestjs/testing";
import { createTestDatabase } from "./postgres.js";
import { libraryPage } from "../src/mal/library.js";
import { libraryItem } from "../src/mal/normalization.js";
import {
  MalRepository,
  type RepositoryClient,
} from "../src/database/repository.js";
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
  it("keeps metadata, entries and operations in one snapshot across a concurrent commit", async () => {
    await db.repository.replaceEntries(user.id, [item(1)]);
    const pending = {
      id: "operation-00000001",
      animeId: "mal-1",
      state: "pending" as const,
      base: status,
      changes: { watchedEpisodes: 2 },
    };
    await db.repository.saveOperation(user.id, pending);
    const before = await libraryPage(db.repository, user);
    const accountQueries: unknown[] = [];
    const observedRepository = new MalRepository(
      db.prisma.$extends({
        query: {
          account: {
            async findUnique({ args, query }) {
              const row = await query(args);
              accountQueries.push(args);
              await db.repository.transaction(async (writer) => {
                await writer.removeEntry(user.id, "mal-1");
                await writer.saveEntry(user.id, item(2));
                await writer.saveOperation(user.id, {
                  ...pending,
                  state: "synced",
                });
                await writer.markSynced(user.id);
              });
              return row;
            },
          },
        },
      }) as unknown as RepositoryClient,
    );

    const during = await libraryPage(observedRepository, user);
    expect(during).toEqual(before);
    expect(accountQueries).toEqual([
      {
        where: { id: 7n },
        select: { imported: true, synced: true, revision: true },
      },
    ]);
    expect(await libraryPage(db.repository, user)).toMatchObject({
      items: [item(2)],
      operations: [],
    });
  });

  it("serves the committed list during a pending import and rejects its cursor after commit", async () => {
    await db.repository.replaceEntries(
      user.id,
      Array.from({ length: 51 }, (_, index) => item(index + 1)),
    );
    await db.repository.saveOperation(user.id, {
      id: "operation-00000001",
      animeId: "mal-1",
      state: "pending",
      base: status,
      changes: { watchedEpisodes: 2 },
    });
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    vi.stubEnv(
      "MAL_REDIRECT_URI",
      "http://localhost:3000/api/auth/mal/callback",
    );
    vi.stubEnv("MAL_CLIENT_ID", "test-client");
    vi.stubEnv("MAL_CLIENT_SECRET", "test-secret");
    vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "01".repeat(32));
    const token = await db.repository.createSession(user.id);
    const headers = { cookie: `sabame_mal_session=${token}` };
    const list = (cursor?: string) =>
      mal.list(
        new Request(
          `http://localhost:3000/api/mal/list${cursor ? `?cursor=${cursor}` : ""}`,
          { headers },
        ),
      );
    const beforeResponse = await list();
    expect(beforeResponse.status).toBe(200);
    const before = await beforeResponse.json();
    let providerEntered!: () => void;
    let releaseProvider!: () => void;
    const entered = new Promise<void>((resolve) => {
      providerEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        providerEntered();
        await blocked;
        return Response.json({
          data: [
            {
              node: { id: 1000, title: "Imported title", num_episodes: 12 },
              list_status: status,
            },
          ],
          paging: {},
        });
      }),
    );
    const importing = mal.importList(
      new Request("http://localhost:3000/api/mal/import", {
        method: "POST",
        headers: {
          ...headers,
          origin: "http://localhost:3000",
          "content-type": "application/json",
        },
        body: JSON.stringify({ expectedUserId: user.id }),
      }),
    );
    await entered;
    let during!: Response;
    let imported!: Response;
    try {
      during = await list();
    } finally {
      releaseProvider();
      imported = await importing;
    }

    expect(during.status).toBe(200);
    expect(await during.json()).toEqual(before);
    expect(imported.status).toBe(200);
    const stale = await list(before.nextCursor);
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({
      error: { code: "library_changed" },
    });
    const after = await list();
    expect(after.status).toBe(200);
    expect(
      (await after.json()).items.map(
        (entry: { anime: { id: string } }) => entry.anime.id,
      ),
    ).toEqual(["mal-1", "mal-1000"]);
  });

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
      const page = await libraryPage(db.repository, user, cursor);
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
