import type { NextConfig } from "next";
import path from "node:path";
import { backendRewrites } from "./src/config/backend-routing";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.resolve(import.meta.dirname, "../.."),
  turbopack: { root: path.resolve(import.meta.dirname, "../..") },
  // Imports have a 110s client deadline; Next's default proxy timeout is 30s.
  experimental: { proxyTimeout: 120_000 },
  async rewrites() {
    return { beforeFiles: backendRewrites(process.env.BACKEND_URL, Boolean(process.env.VERCEL)) };
  },
  logging: {
    incomingRequests: { ignore: [/\/api\/media\/resource(?:\?|$)/, /\/api\/auth\/mal\/callback(?:\?|$)/] },
    browserToTerminal: false,
  },
  images: {
    qualities: [75, 85],
    remotePatterns: [
      { protocol: "https", hostname: "cdn.myanimelist.net", pathname: "/**" },
      { protocol: "https", hostname: "img.animeschedule.net", pathname: "/production/assets/public/img/**" },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
        pathname: "/aida-public/**",
      },
    ],
  },
};

export default nextConfig;
