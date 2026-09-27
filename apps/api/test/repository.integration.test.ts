import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Anime, LibraryEntry } from "@sabame/domain/tracker";
import type {
  MalLibraryItem,
  MalListStatus,
  MalOperation,
  MalUser,
} from "@sabame/domain/mal";
import { DatabaseService } from "../src/database/prisma.service.js";
import {
  ACCOUNT_LEASE_MS,
  createMalRepository,
} from "../src/database/repository.js";
import { hashToken } from "../src/mal/crypto.js";
import { createTestDatabase } from "./postgres.js";

const remoteStatus: MalListStatus = {
  status: "on_hold",
  num_episodes_watched: 2,
  score: 8,
  is_rewatching: false,
  updated_at: "2026-09-15T00:00:00Z",
};

function makeUser(id: number, name = `viewer-${id}`): MalUser {
  return { id, name };
}

function makeItem(
  animeId: string,
  title = animeId,
  watchedEpisodes = 2,
): MalLibraryItem {
  const anime: Anime = {
    id: animeId,
    title,
    subtitle: "",
    synopsis: "",
    genres: ["Drama"],
    totalEpisodes: 12,
    episodeMinutes: 24,
    accent: "violet",
  };
  const entry: LibraryEntry = {
    animeId,
    status: "on_hold",
    watchedEpisodes,
    currentEpisode: watchedEpisodes + 1,
    playbackSeconds: 0,
    personalScore: 8,
    isRewatching: false,
    updatedAt: "2026-09-15T00:00:00Z",
  };
  return { anime, entry, remote: remoteStatus };
}

function makeOperation(id: string, animeId: string): MalOperation {
  return {
    id,
    animeId,
    changes: { watchedEpisodes: 3 },
    base: remoteStatus,
    state: "pending",
  };
}

let testDatabase: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => {
  testDatabase = await createTestDatabase();
});

beforeEach(async () => {
  const { prisma } = testDatabase;
  await prisma.lease.deleteMany();
  await prisma.oAuthTransaction.deleteMany();
  await prisma.operation.deleteMany();
  await prisma.entry.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await testDatabase?.close();
  vi.unstubAllEnvs();
});

describe("PostgreSQL MAL repository", () => {
  it("stores safe MAL IDs as BIGINT and isolates sessions and account data", async () => {
    const { repository, prisma } = testDatabase;
    const largeId = Number.MAX_SAFE_INTEGER;
    await repository.saveAccount(
      makeUser(largeId),
      "encrypted-token-a",
      Date.now() + 60_000,
    );
    await repository.saveAccount(
      makeUser(42),
      "encrypted-token-b",
      Date.now() + 60_000,
    );
    await repository.saveEntry(largeId, makeItem("mal-100", "Private A"));
    await repository.saveEntry(42, makeItem("mal-200", "Private B"));

    const largeSession = await repository.createSession(largeId);
    const otherSession = await repository.createSession(42);

    expect(await repository.session(largeSession)).toEqual(makeUser(largeId));
    expect(await repository.session(otherSession)).toEqual(makeUser(42));
    expect(await repository.entries(largeId)).toMatchObject([
      { anime: { title: "Private A" } },
    ]);
    expect(await repository.entries(42)).toMatchObject([
      { anime: { title: "Private B" } },
    ]);
    expect((await repository.account(largeId)).user.id).toBe(largeId);
    expect(
      await prisma.account.findUnique({ where: { id: BigInt(largeId) } }),
    ).not.toBeNull();

    const storedHashes = (
      await prisma.session.findMany({ select: { hash: true } })
    ).map(({ hash }) => hash);
    expect(storedHashes).not.toContain(largeSession);
    expect(storedHashes).not.toContain(otherSession);

    await prisma.session.updateMany({
      where: { hash: hashToken(largeSession) },
      data: { expires: BigInt(Date.now() - 1) },
    });
    expect(await repository.session(largeSession)).toBeNull();
    expect(await repository.session(otherSession)).toEqual(makeUser(42));

    await repository.logout(otherSession);
    expect(await repository.session(otherSession)).toBeNull();
  });

  it("atomically consumes a matching OAuth transaction once under concurrent replay", async () => {
    const { repository } = testDatabase;
    const state = "one-time-state";
    const cookieToken = await repository.createOAuth(
      state,
      "encrypted-verifier",
    );

    await expect(
      repository.consumeOAuth(cookieToken, "wrong-state"),
    ).rejects.toMatchObject({ code: "invalid_callback", status: 400 });

    const attempts = await Promise.allSettled([
      repository.consumeOAuth(cookieToken, state),
      repository.consumeOAuth(cookieToken, state),
    ]);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      attempts.filter((attempt) => attempt.status === "fulfilled")[0],
    ).toMatchObject({
      status: "fulfilled",
      value: "encrypted-verifier",
    });
    expect(
      attempts.filter((attempt) => attempt.status === "rejected"),
    ).toHaveLength(1);
    await expect(
      repository.consumeOAuth(cookieToken, state),
    ).rejects.toMatchObject({ code: "invalid_callback" });
  });

  it("rolls back all transaction-scoped repository writes after a failure", async () => {
    const { repository } = testDatabase;
    await repository.saveAccount(makeUser(7), "encrypted", Date.now() + 60_000);
    const original = makeItem("mal-100", "Before rollback", 2);
    await repository.saveEntry(7, original);
    const failure = new Error("force rollback");

    await expect(
      repository.transaction(async (txRepository) => {
        await txRepository.saveEntry(7, makeItem("mal-100", "Uncommitted", 9));
        await txRepository.removeEntry(7, "mal-100");
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await repository.entry(7, "mal-100")).toEqual(original);
  });

  it("preserves entries with pending edits while replacing the imported list", async () => {
    const { repository } = testDatabase;
    await repository.saveAccount(makeUser(8), "encrypted", Date.now() + 60_000);
    const pendingItem = makeItem("mal-100", "Pending local edit", 4);
    await repository.saveEntry(8, pendingItem);
    await repository.saveEntry(8, makeItem("mal-200", "Updated from MAL", 1));
    await repository.saveOperation(
      8,
      makeOperation("operation-pending-0001", "mal-100"),
    );

    await repository.replaceEntries(8, [
      makeItem("mal-200", "Current MAL title", 5),
      makeItem("mal-300", "New from MAL", 0),
    ]);

    expect(await repository.entries(8)).toEqual([
      makeItem("mal-100", "Pending local edit", 4),
      makeItem("mal-200", "Current MAL title", 5),
      makeItem("mal-300", "New from MAL", 0),
    ]);
    expect((await repository.account(8)).imported).toBe(true);
    expect(await repository.operations(8)).toEqual([
      makeOperation("operation-pending-0001", "mal-100"),
    ]);

    await repository.saveOperation(8, {
      ...makeOperation("operation-pending-0001", "mal-100"),
      state: "synced",
    });
    await repository.replaceEntries(8, []);
    expect(await repository.entries(8)).toEqual([]);
  });

  it("acquires leases atomically per account and releases after success or failure", async () => {
    const { repository } = testDatabase;
    let signalEntered!: () => void;
    let releaseFirst!: () => void;
    const entered = new Promise<void>((resolve) => {
      signalEntered = resolve;
    });
    const blocked = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = repository.exclusive(21, async () => {
      signalEntered();
      await blocked;
      return "first finished";
    });
    await entered;

    await expect(
      repository.exclusive(21, async () => "must not run"),
    ).rejects.toMatchObject({ code: "sync_busy", status: 409 });
    await expect(
      repository.exclusive(22, async () => "other account"),
    ).resolves.toBe("other account");
    releaseFirst();
    await expect(first).resolves.toBe("first finished");

    await expect(
      repository.exclusive(21, async () => {
        throw new Error("upstream failed");
      }),
    ).rejects.toThrow("upstream failed");
    await expect(
      repository.exclusive(21, async () => "released after failure"),
    ).resolves.toBe("released after failure");
  });

  it("reclaims an expired lease only after its expiry time", async () => {
    const { repository, prisma } = testDatabase;
    const userId = 23;
    await prisma.lease.create({
      data: {
        userId: BigInt(userId),
        owner: "old-owner",
        expires: BigInt(Date.now() - 1),
      },
    });

    await expect(
      repository.exclusive(userId, async () => "reclaimed"),
    ).resolves.toBe("reclaimed");
    expect(
      await prisma.lease.findUnique({ where: { userId: BigInt(userId) } }),
    ).toBeNull();

    await prisma.lease.create({
      data: {
        userId: BigInt(userId),
        owner: "active-owner",
        expires: BigInt(Date.now() + ACCOUNT_LEASE_MS),
      },
    });
    await expect(
      repository.exclusive(userId, async () => "must not run"),
    ).rejects.toMatchObject({ code: "sync_busy", status: 409 });
  });

  it("reads persisted accounts and entries through a fresh database service", async () => {
    const { repository } = testDatabase;
    const user = makeUser(31, "persistent-viewer");
    const item = makeItem("mal-310", "Persisted title");
    await repository.saveAccount(user, "encrypted-token", Date.now() + 60_000);
    await repository.saveEntry(user.id, item);

    const restartedDatabase = new DatabaseService();
    try {
      await restartedDatabase.ping();
      const restartedRepository = createMalRepository(restartedDatabase);
      expect(await restartedRepository.account(user.id)).toMatchObject({
        user,
        tokens: "encrypted-token",
      });
      expect(await restartedRepository.entry(user.id, item.anime.id)).toEqual(
        item,
      );
    } finally {
      await restartedDatabase.onApplicationShutdown();
    }
  });
});
