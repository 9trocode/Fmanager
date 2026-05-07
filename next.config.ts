import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  output: "standalone",
  // Force the full better-sqlite3 + drizzle-orm packages into the standalone
  // output's node_modules. The runtime migrate script (scripts/migrate.mjs)
  // is a separate Node process — Next doesn't bundle it — so it needs the
  // real package wrappers (index.js, lib/) on disk, not just the .node
  // binary. Transitive deps (`bindings`, `file-uri-to-path`) live only in
  // pnpm's `.pnpm/` store and have no top-level symlink, so we COPY them
  // explicitly in the Dockerfile runner stage instead of trying to trace.
  outputFileTracingIncludes: {
    "/**": [
      "./node_modules/better-sqlite3/**/*",
      "./node_modules/drizzle-orm/**/*",
    ],
  },
};

export default nextConfig;
