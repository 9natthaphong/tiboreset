import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  turbopack: { root: process.cwd() },
  images: { remotePatterns: [{ protocol: "https", hostname: "pbs.twimg.com", pathname: "/**" }] },
};

export default nextConfig;
