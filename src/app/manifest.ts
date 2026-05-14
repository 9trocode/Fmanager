import type { MetadataRoute } from "next";

/**
 * PWA manifest. Served at `/manifest.webmanifest` by Next.js.
 *
 * `start_url` is `/` (not `/dashboard`) so Chrome's installability
 * audit doesn't fail when an unauthed install resolves to a
 * redirect chain — `/` is in-scope and reachable without auth.
 *
 * Icons reference files in `/public` directly (NOT `/icon.svg`,
 * which 404s through Next.js's icon convention in some deployments).
 * The 512 PNG is declared with both `any` and `maskable` purposes so
 * Android can use it for adaptive launchers; the 1024 PNG covers
 * higher-DPI desktop installs.
 *
 * Screenshots use the existing wordmark/logo PNGs as placeholders so
 * the "richer install UI" warnings are satisfied. Replace with real
 * product screenshots (`docs/pwa-screenshot-wide.png` + `…-narrow.png`
 * convention) when you have them — Chrome rejects screenshots with
 * aspect ratio > 2.3:1, so the wordmark's 3:1 strip can't be used.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cairn — net worth + decisions",
    short_name: "Cairn",
    description:
      "Multi-currency net worth + decision co-pilot for professionals. Stack the truths, plan against the floor.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["finance", "productivity", "business"],
    icons: [
      {
        src: "/cairn-logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/cairn-logo-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/cairn-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        purpose: "any",
      },
    ],
    screenshots: [
      {
        src: "/cairn-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        form_factor: "wide",
        label: "Cairn — desktop home view",
      },
      {
        src: "/cairn-logo.png",
        sizes: "1024x1024",
        type: "image/png",
        form_factor: "narrow",
        label: "Cairn — mobile home view",
      },
    ],
  };
}
