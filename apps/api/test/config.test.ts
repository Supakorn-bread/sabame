import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, malConfig, malConfigured } from "../src/mal/config.js";

afterEach(() => vi.unstubAllEnvs());
describe("MAL configuration on Vercel", () => {
  function configured() {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_ORIGIN", "https://sabame.test");
    vi.stubEnv("MAL_REDIRECT_URI", "https://sabame.test/api/auth/mal/callback");
    vi.stubEnv("MAL_CLIENT_ID", "client");
    vi.stubEnv("MAL_CLIENT_SECRET", "secret");
    vi.stubEnv("MAL_TOKEN_ENCRYPTION_KEY", "ab".repeat(32));
    vi.stubEnv("DATABASE_URL", "postgresql://localhost/sabame_test");
  }
  it("accepts configured Vercel deployments without requiring persistent disk", () => {
    configured();
    expect(malConfigured()).toBe(true);
    expect(malConfig().secure).toBe(true);
  });
  it("rejects callbacks on a different origin", () => {
    configured();
    vi.stubEnv(
      "MAL_REDIRECT_URI",
      "https://backend.test/api/auth/mal/callback",
    );
    expect(malConfigured()).toBe(false);
  });
  it("never falls back to localhost for an unconfigured Vercel deployment", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("APP_ORIGIN", "");
    expect(() => appOrigin()).toThrow("not_configured");
  });
});
