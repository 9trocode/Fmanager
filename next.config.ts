import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  output: "standalone",
  outputFileTracingIncludes: {
    "/api/chat": ["./node_modules/better-sqlite3/build/Release/*.node"],
    "/api/auth/**": ["./node_modules/better-sqlite3/build/Release/*.node"],
    "/**": ["./node_modules/better-sqlite3/build/Release/*.node"],
  },
};

export default nextConfig;
