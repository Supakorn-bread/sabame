import { Injectable } from "@nestjs/common";
import type { MalLibraryItem, MalOperation, MalUser } from "@sabame/domain/mal";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { MalError } from "../mal/config.js";
import { hashToken, randomToken } from "../mal/crypto.js";
import { DatabaseService } from "./prisma.service.js";
import { databaseFailure } from "./errors.js";

export interface Account {
  user: MalUser;
  tokens: string;
  expiresAt: number;
  imported: boolean;
  lastSyncedAt: string | null;
  revision: number;
}

export type RepositoryClient = PrismaClient | Prisma.TransactionClient;
export type RepositorySource =
  RepositoryClient | (() => Promise<RepositoryClient>);
export type TransactionRepositoryCallback<T> = (
  txRepository: MalRepository,
) => Promise<T>;
export type ExclusiveRepositoryCallback<T> = (
  signal: AbortSignal,
) => Promise<T>;

export const ACCOUNT_LEASE_MS = 180_000;
export const MAX_SYNC_WORK_MS = 110_000;
const SESSION_MS = 30 * 86_400_000;
const OAUTH_MS = 10 * 60_000;

function dbUserId(userId: number): bigint {
  if (!Number.isSafeInteger(userId) || userId <= 0)
    throw new RangeError("invalid_mal_user_id");
  return BigInt(userId);
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function safeNumber(value: bigint, code: string): number {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(code);
  return number;
}

@Injectable()
export class MalRepository {
  constructor(
    private readonly source: RepositorySource,
    private readonly transactional = false,
  ) {}

  async transaction<T>(callback: TransactionRepositoryCallback<T>): Promise<T> {
    if (this.transactional) throw new Error("nested_repository_transaction");
    return this.run((client) =>
      (client as PrismaClient).$transaction(
        (tx) => callback(new MalRepository(tx, true)),
        { timeout: 10_000, maxWait: 3_000 },
      ),
    );
  }

  async saveAccount(
    user: MalUser,
    tokens: string,
    expiresAt: number,
  ): Promise<void> {
    const id = dbUserId(user.id);
    await this.run(async (client) => {
      await client.account.upsert({
        where: { id },
        create: {
          id,
          profile: jsonValue(user),
          tokens,
          expires: BigInt(expiresAt),
        },
        update: {
          profile: jsonValue(user),
          tokens,
          expires: BigInt(expiresAt),
          imported: false,
          synced: null,
          revision: { increment: 1 },
        },
      });
    });
  }

  async updateTokens(
    userId: number,
    tokens: string,
    expiresAt: number,
  ): Promise<void> {
    await this.run(async (client) => {
      await client.account.updateMany({
        where: { id: dbUserId(userId) },
        data: { tokens, expires: BigInt(expiresAt) },
      });
    });
  }

  async account(id: number): Promise<Account> {
    return this.run(async (client) => {
      const row = await client.account.findUnique({
        where: { id: dbUserId(id) },
      });
      if (!row) throw new MalError("unauthorized", 401);
      return {
        user: row.profile as unknown as MalUser,
        tokens: row.tokens,
        expiresAt: safeNumber(row.expires, "invalid_account_expiry"),
        imported: row.imported,
        lastSyncedAt: row.synced?.toISOString() ?? null,
        revision: row.revision,
      };
    });
  }

  async createSession(userId: number): Promise<string> {
    const token = randomToken();
    const now = Date.now();
    await this.run(async (client) => {
      await client.session.deleteMany({
        where: { expires: { lte: BigInt(now) } },
      });
      await client.session.create({
        data: {
          hash: hashToken(token),
          userId: dbUserId(userId),
          expires: BigInt(now + SESSION_MS),
        },
      });
    });
    return token;
  }

  async session(token: string | undefined): Promise<MalUser | null> {
    if (!token || token.length > 100) return null;
    return this.run(async (client) => {
      const row = await client.session.findFirst({
        where: { hash: hashToken(token), expires: { gt: BigInt(Date.now()) } },
        select: { account: { select: { profile: true } } },
      });
      return row ? (row.account.profile as unknown as MalUser) : null;
    });
  }

  async logout(token: string | undefined): Promise<void> {
    if (!token) return;
    await this.run(async (client) => {
      await client.session.deleteMany({ where: { hash: hashToken(token) } });
    });
  }

  async createOAuth(state: string, encryptedVerifier: string): Promise<string> {
    const token = randomToken();
    const now = Date.now();
    await this.run(async (client) => {
      await client.oAuthTransaction.deleteMany({
        where: { expires: { lte: BigInt(now) } },
      });
      await client.oAuthTransaction.create({
        data: {
          hash: hashToken(token),
          stateHash: hashToken(state),
          verifier: encryptedVerifier,
          expires: BigInt(now + OAUTH_MS),
        },
      });
    });
    return token;
  }

  async consumeOAuth(token: string, state: string): Promise<string> {
    return this.run(async (client) => {
      const rows = await client.$queryRaw<
        Array<{ verifier: string }>
      >(Prisma.sql`
        DELETE FROM "oauth"
        WHERE "hash" = ${hashToken(token)}
          AND "state_hash" = ${hashToken(state)}
          AND "expires" > ${BigInt(Date.now())}
        RETURNING "verifier"
      `);
      if (!rows[0]) throw new MalError("invalid_callback", 400);
      return rows[0].verifier;
    });
  }

  async entries(userId: number): Promise<MalLibraryItem[]> {
    return this.run(async (client) => {
      const rows = await client.entry.findMany({
        where: { userId: dbUserId(userId) },
        orderBy: { animeId: "asc" },
        select: { payload: true },
      });
      return rows.map((row) => row.payload as unknown as MalLibraryItem);
    });
  }

  async entryPage(userId: number, after?: string): Promise<MalLibraryItem[]> {
    return this.run(async (client) => {
      const rows = await client.entry.findMany({
        where: {
          userId: dbUserId(userId),
          ...(after ? { animeId: { gt: after } } : {}),
        },
        orderBy: { animeId: "asc" },
        take: 51,
        select: { payload: true },
      });
      return rows.map((row) => row.payload as unknown as MalLibraryItem);
    });
  }

  async operationPage(userId: number, after?: string): Promise<MalOperation[]> {
    return this.run(async (client) => {
      const rows = await client.operation.findMany({
        where: {
          userId: dbUserId(userId),
          payload: { path: ["state"], not: "synced" },
          ...(after ? { id: { gt: after } } : {}),
        },
        orderBy: { id: "asc" },
        take: 51,
        select: { payload: true },
      });
      return rows.map((row) => row.payload as unknown as MalOperation);
    });
  }

  async entry(
    userId: number,
    animeId: string,
  ): Promise<MalLibraryItem | undefined> {
    return this.run(async (client) => {
      const row = await client.entry.findUnique({
        where: { userId_animeId: { userId: dbUserId(userId), animeId } },
        select: { payload: true },
      });
      return row ? (row.payload as unknown as MalLibraryItem) : undefined;
    });
  }

  async saveEntry(userId: number, item: MalLibraryItem): Promise<void> {
    if (!this.transactional)
      return this.transaction((tx) => tx.saveEntry(userId, item));
    await this.run(async (client) => {
      await client.entry.upsert({
        where: {
          userId_animeId: { userId: dbUserId(userId), animeId: item.anime.id },
        },
        create: {
          userId: dbUserId(userId),
          animeId: item.anime.id,
          payload: jsonValue(item),
        },
        update: { payload: jsonValue(item) },
      });
      await this.bumpRevision(client, userId);
    });
  }

  async removeEntry(userId: number, animeId: string): Promise<void> {
    if (!this.transactional)
      return this.transaction((tx) => tx.removeEntry(userId, animeId));
    await this.run(async (client) => {
      await client.entry.deleteMany({
        where: { userId: dbUserId(userId), animeId },
      });
      await this.bumpRevision(client, userId);
    });
  }

  async markSynced(userId: number): Promise<void> {
    await this.run(async (client) => {
      await client.account.updateMany({
        where: { id: dbUserId(userId) },
        data: { synced: new Date(), revision: { increment: 1 } },
      });
    });
  }

  async replaceEntries(
    userId: number,
    items: MalLibraryItem[],
    signal?: AbortSignal,
  ): Promise<void> {
    await this.transaction(async (tx) => {
      signal?.throwIfAborted();
      const [pending, current] = await Promise.all([
        tx.operations(userId),
        tx.entries(userId),
      ]);
      const incomingIds = new Set(items.map((item) => item.anime.id));
      const pendingIds = new Set(pending.map((operation) => operation.animeId));
      const retained = current.filter(
        (item) =>
          pendingIds.has(item.anime.id) && !incomingIds.has(item.anime.id),
      );
      const client = await tx.getClient();
      await client.entry.deleteMany({ where: { userId: dbUserId(userId) } });
      const next = [...items, ...retained];
      if (next.length) {
        await client.entry.createMany({
          data: next.map((item) => ({
            userId: dbUserId(userId),
            animeId: item.anime.id,
            payload: jsonValue(item),
          })),
        });
      }
      await client.account.updateMany({
        where: { id: dbUserId(userId) },
        data: {
          imported: true,
          synced: new Date(),
          revision: { increment: 1 },
        },
      });
      signal?.throwIfAborted();
    });
  }

  async operation(
    userId: number,
    id: string,
  ): Promise<MalOperation | undefined> {
    return this.run(async (client) => {
      const row = await client.operation.findUnique({
        where: { userId_id: { userId: dbUserId(userId), id } },
        select: { payload: true },
      });
      return row ? (row.payload as unknown as MalOperation) : undefined;
    });
  }

  async operations(userId: number): Promise<MalOperation[]> {
    return this.run(async (client) => {
      const rows = await client.operation.findMany({
        where: { userId: dbUserId(userId) },
        orderBy: { id: "asc" },
        select: { payload: true },
      });
      return rows
        .map((row) => row.payload as unknown as MalOperation)
        .filter((operation) => operation.state !== "synced");
    });
  }

  async saveOperation(userId: number, operation: MalOperation): Promise<void> {
    if (!this.transactional)
      return this.transaction((tx) => tx.saveOperation(userId, operation));
    await this.run(async (client) => {
      await client.operation.upsert({
        where: { userId_id: { userId: dbUserId(userId), id: operation.id } },
        create: {
          userId: dbUserId(userId),
          id: operation.id,
          animeId: operation.animeId,
          payload: jsonValue(operation),
        },
        update: { animeId: operation.animeId, payload: jsonValue(operation) },
      });
      await this.bumpRevision(client, userId);
    });
  }

  async exclusive<T>(
    userId: number,
    callback: ExclusiveRepositoryCallback<T>,
  ): Promise<T> {
    const owner = randomToken();
    const now = Date.now();
    const id = dbUserId(userId);
    const acquired = await this.run((client) =>
      client.$queryRaw<Array<{ user_id: bigint }>>(Prisma.sql`
      INSERT INTO "leases" ("user_id", "owner", "expires")
      VALUES (${id}, ${owner}, ${BigInt(now + ACCOUNT_LEASE_MS)})
      ON CONFLICT ("user_id") DO UPDATE
        SET "owner" = EXCLUDED."owner", "expires" = EXCLUDED."expires"
        WHERE "leases"."expires" <= ${BigInt(now)}
      RETURNING "user_id"
    `),
    );
    if (!acquired.length) throw new MalError("sync_busy", 409);

    let result: T;
    let callbackError: unknown;
    const signal = AbortSignal.timeout(MAX_SYNC_WORK_MS);
    try {
      result = await callback(signal);
    } catch (error) {
      callbackError = error;
    }

    try {
      await this.run((client) =>
        client.$executeRaw(Prisma.sql`
        DELETE FROM "leases" WHERE "user_id" = ${id} AND "owner" = ${owner}
      `),
      );
    } catch (error) {
      if (callbackError === undefined) throw error;
    }
    if (callbackError !== undefined) throw callbackError;
    return result!;
  }

  private async getClient(): Promise<RepositoryClient> {
    return typeof this.source === "function" ? this.source() : this.source;
  }

  private async run<T>(
    operation: (client: RepositoryClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await this.getClient());
    } catch (error) {
      throw databaseFailure(error);
    }
  }

  private async bumpRevision(client: RepositoryClient, userId: number) {
    await client.account.updateMany({
      where: { id: dbUserId(userId) },
      data: { revision: { increment: 1 } },
    });
  }
}

export function createMalRepository(database: DatabaseService): MalRepository {
  return new MalRepository(() => database.getClient());
}
