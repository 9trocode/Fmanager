import type { MetadataRoute } from "next";

/**
 * PWA manifest. Served at `/manifest.webmanifest` by Next.js. Keep
 * `display` as `standalone` so the installed app drops the browser
 * chrome on phones/desktops; `start_url` of `/dashboard` lands the
 * user on the home grid after launch instead of the marketing root.
 *
 * Reuses the existing icon assets in /public — the 512×512 logo is
 * what most platforms render in their app drawer/dock, and `maskable`
 * lets Android crop it into adaptive shapes without empty bezels.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cairn — net worth + decisions",
    short_name: "Cairn",
    description:
      "Multi-currency net worth + decision co-pilot for professionals. Stack the truths, plan against the floor.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    categories: ["finance", "productivity", "business"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
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
    ],
  };
}
