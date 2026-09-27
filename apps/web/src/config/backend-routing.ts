/** Only these routes belong to Nest. Playback stays in Next.js. */
export const backendPaths = [
  "/api/auth/:path*",
  "/api/mal/:path*",
  "/api/schedule",
  "/api/anime/search",
  "/api/anime/seasonal",
  "/api/anime/:animeId/episodes",
  "/api/anime/:animeId",
  "/api/health",
  "/api/ready",
] as const;

export function backendRewrites(value: string | undefined, deployed = false) {
  if (!value && deployed) throw new Error("BACKEND_URL is required for this Vercel environment");
  const url = new URL(value || "http://127.0.0.1:4000");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
    || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new Error("BACKEND_URL must be an HTTPS origin (HTTP is allowed on localhost)");
  }
  return backendPaths.map((source) => ({ source, destination: `${url.origin}${source}` }));
}
