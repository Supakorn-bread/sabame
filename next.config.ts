import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
