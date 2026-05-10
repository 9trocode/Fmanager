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
  /**
   * Long-cache static brand assets in /public.
   *
   * `.next/static/` already gets immutable, year-long cache headers
   * because filenames are content-hashed. Files under `/public` don't
   * — and Next defaults them to `public, max-age=0, must-revalidate`,
   * which means every fresh visitor re-downloads the logo PNGs and
   * SVGs on first paint, slowing first-load TTI on cold caches.
   *
   * The Cairn brand assets (cairn-logo.png, cairn-wordmark.png, etc.)
   * never change without a filename swap, so a 30-day cache + SWR is
   * safe. CDNs in front (Cloudflare, etc.) honor it too.
   */
  async headers() {
    const cairnAsset = {
      key: "Cache-Control",
      value: "public, max-age=2592000, stale-while-revalidate=86400",
    };
    // Match every brand asset variant. Next's source uses path-to-regexp
    // which doesn't accept `*` after a named param, so list extensions
    // separately rather than trying to glob.
    // Cairn brand assets are all flat at /public root with no slashes
    // — :slug matches a single segment which is exactly what we need.
    return [
      { source: "/cairn-:slug.png", headers: [cairnAsset] },
      { source: "/cairn-:slug.svg", headers: [cairnAsset] },
      { source: "/cairn-:slug.jpg", headers: [cairnAsset] },
      { source: "/cairn-:slug.webp", headers: [cairnAsset] },
    ];
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
