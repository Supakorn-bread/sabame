import { describe, expect, it } from "vitest";
import { backendPaths, backendRewrites } from "./backend-routing";

describe("Nest API routing", () => {
  it("keeps URLs stable while forwarding only migrated endpoints", () => {
    const routes = backendRewrites("https://api.sabame.test");
    expect(routes).toContainEqual({ source: "/api/auth/:path*", destination: "https://api.sabame.test/api/auth/:path*" });
    expect(routes).toContainEqual({ source: "/api/anime/:animeId/episodes", destination: "https://api.sabame.test/api/anime/:animeId/episodes" });
    expect(backendPaths).not.toContain("/api/:path*");
    expect(backendPaths.some((path) => path.includes("media"))).toBe(false);
  });
  it("allows local development but never defaults a deployed environment to localhost", () => {
    expect(backendRewrites(undefined)[0].destination).toContain("http://127.0.0.1:4000/");
    expect(() => backendRewrites(undefined, true)).toThrow("BACKEND_URL");
  });
  it.each(["http://remote.test", "https://user:secret@remote.test", "https://remote.test/api", "https://remote.test?token=secret", "https://remote.test#fragment"])("rejects invalid backend origins: %s", (url) => {
    expect(() => backendRewrites(url)).toThrow();
  });
});
