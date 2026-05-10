import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  output: "standalone",
  experimental: {
    /**
     * Tree-shake big "barrel-export" packages so a `import { X } from "lucide-react"`
     * pulls in just X, not the full thousand-icon catalog.
     *
     * lucide-react is the worst offender — 69 importers across the app
     * pulling individual icons from a single barrel. Without this,
     * every client bundle ships the icons the route uses + most of the
     * rest of the catalog as dead code. Same story for radix-ui.
     */
    optimizePackageImports: ["lucide-react", "radix-ui", "@radix-ui/react-icons"],
  },
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
