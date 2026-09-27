import { randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { vi } from "vitest";
import { DatabaseService } from "../src/database/prisma.service.js";
import { MalRepository } from "../src/database/repository.js";

export async function createTestDatabase() {
  const value = process.env.TEST_DATABASE_URL;
  if (!value)
    throw new Error(
      "Set TEST_DATABASE_URL to a dedicated local PostgreSQL database named sabame_test",
    );
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.pathname !== "/sabame_test" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "Tests require a local sabame_test database without URL parameters",
    );
  }
  const schema = `test_${randomBytes(12).toString("hex")}`;
  const admin = new Pool({
    connectionString: value,
    max: 1,
    connectionTimeoutMillis: 3000,
  });
  const database = new DatabaseService();
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const migrations = new URL("../prisma/migrations/", import.meta.url);
    for (const directory of (await readdir(migrations, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory())
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const migration = await readFile(
        new URL(`${directory.name}/migration.sql`, migrations),
        "utf8",
      );
      await admin.query(`SET search_path TO "${schema}"; ${migration}`);
    }
    vi.stubEnv("DATABASE_URL", value);
    vi.stubEnv("DATABASE_SCHEMA", schema);
    const prisma = await database.getClient();
    return {
      database,
      prisma,
      schema,
      repository: new MalRepository(prisma),
      async close() {
        await database.onApplicationShutdown();
        await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
        await admin.end();
      },
    };
  } catch (error) {
    await database.onApplicationShutdown();
    await admin
      .query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
      .catch(() => undefined);
    await admin.end();
    throw error;
  }
}
