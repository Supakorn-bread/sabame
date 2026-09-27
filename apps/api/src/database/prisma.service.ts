import { Injectable, type OnApplicationShutdown } from "@nestjs/common";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../generated/prisma/client.js";
import {
  DatabaseConfigurationError,
  DatabaseUnavailableError,
} from "./errors.js";

const POOL_MAX = 5;

@Injectable()
export class DatabaseService implements OnApplicationShutdown {
  private clientPromise: Promise<PrismaClient> | undefined;
  private pool: Pool | undefined;

  getClient(): Promise<PrismaClient> {
    if (!this.clientPromise) {
      this.clientPromise = this.createClient().catch((error: unknown) => {
        this.clientPromise = undefined;
        throw error;
      });
    }
    return this.clientPromise;
  }

  async ping(): Promise<void> {
    const client = await this.getClient();
    try {
      await client.$queryRaw`SELECT 1`;
      await client.account.findFirst({ select: { id: true } });
    } catch {
      throw new DatabaseUnavailableError();
    }
  }

  async onApplicationShutdown(): Promise<void> {
    if (!this.clientPromise) return;
    try {
      const client = await this.clientPromise;
      await client.$disconnect();
    } finally {
      this.pool = undefined;
      this.clientPromise = undefined;
    }
  }

  private async createClient(): Promise<PrismaClient> {
    const connectionString = process.env.DATABASE_URL?.trim();
    if (!connectionString) throw new DatabaseConfigurationError();

    let url: URL;
    try {
      url = new URL(connectionString);
    } catch {
      throw new DatabaseConfigurationError();
    }
    if (
      !(url.protocol === "postgres:" || url.protocol === "postgresql:") ||
      !url.hostname ||
      url.pathname.length < 2
    ) {
      throw new DatabaseConfigurationError();
    }

    const schema = process.env.DATABASE_SCHEMA?.trim();
    if (schema && !/^[a-z_][a-z\d_]{0,62}$/i.test(schema))
      throw new DatabaseConfigurationError();

    const pool = new Pool({
      connectionString,
      max: POOL_MAX,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 3_000,
      statement_timeout: 10_000,
      query_timeout: 15_000,
      // Prisma's schema option qualifies ORM queries, but raw SQL uses the
      // connection search path. Keep both on the same validated schema.
      ...(schema ? { options: `-c search_path=${schema}` } : {}),
      allowExitOnIdle: true,
    });
    pool.on("error", () => {
      // The next query reports the database failure through the repository boundary.
    });
    const adapter = new PrismaPg(pool, {
      ...(schema ? { schema } : {}),
      disposeExternalPool: true,
    });
    const client = new PrismaClient({ adapter });

    try {
      await client.$connect();
      this.pool = pool;
      return client;
    } catch {
      await client.$disconnect().catch(() => undefined);
      await pool.end().catch(() => undefined);
      throw new DatabaseUnavailableError();
    }
  }
}
