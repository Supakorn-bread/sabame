import { defineConfig, devices } from "@playwright/test";

const port = process.env.PLAYWRIGHT_PORT ?? "3100";
const apiPort = process.env.PLAYWRIGHT_API_PORT ?? "4100";
const testDatabase = process.env.TEST_DATABASE_URL || "";
if (testDatabase) {
  const url = new URL(testDatabase);
  if (!["postgres:", "postgresql:"].includes(url.protocol)
    || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    || url.pathname !== "/sabame_test" || url.search || url.hash) {
    throw new Error("Browser integration tests require the dedicated local sabame_test database");
  }
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${port}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "npm run build:api && npm run start -w @sabame/api",
      url: `http://127.0.0.1:${apiPort}/api/health`,
      env: {
        PORT: apiPort,
        APP_ORIGIN: `http://localhost:${port}`,
        MAL_REDIRECT_URI: `http://localhost:${port}/api/auth/mal/callback`,
        MAL_CLIENT_ID: testDatabase ? "test-client" : "",
        MAL_CLIENT_SECRET: testDatabase ? "test-secret" : "",
        MAL_TOKEN_ENCRYPTION_KEY: testDatabase ? "01".repeat(32) : "",
        DATABASE_URL: testDatabase,
        DATABASE_SCHEMA: "",
        DIRECT_URL: "",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run build -- --webpack && npm run start -- --port ${port}`,
      url: `http://localhost:${port}`,
      env: { BACKEND_URL: `http://127.0.0.1:${apiPort}` },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
