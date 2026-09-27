import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { defineConfig } from "prisma/config";

if (existsSync(".env")) loadEnvFile(".env");
if (process.argv.includes("migrate") && !process.env.DIRECT_URL) {
  throw new Error("DIRECT_URL is required for explicit database migrations");
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: {
    // Prisma 7.10 reads this value for migrate commands. Runtime code uses
    // DATABASE_URL through the pg pool and never connects during app startup.
    url: process.env.DIRECT_URL || "",
  },
});
