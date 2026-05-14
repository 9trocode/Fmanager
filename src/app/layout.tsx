import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/app/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { PwaRegister } from "@/components/app/pwa-register";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Cairn",
  description:
    "Multi-currency net worth + decision co-pilot for professionals. Stack the truths, plan against the floor.",
  // PWA + iOS standalone metadata. `manifest` points at the Next.js
  // metadata-route handler at `src/app/manifest.ts`. `appleWebApp`
  // mirrors the manifest's name/colors for Safari's add-to-home-
  // screen path, which still doesn't read the manifest fully.
  manifest: "/manifest.webmanifest",
  applicationName: "Cairn",
  appleWebApp: {
    capable: true,
    title: "Cairn",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

// Viewport / theme-color split out per Next.js 16's split metadata
// API (theme-color in `metadata` is deprecated). Pinning maximum
// scale or disabling user scaling breaks accessibility for users
// who pinch-zoom — leave the defaults.
//
// `viewportFit: "cover"` is the iOS handshake: without it, the
// browser pillarboxes content away from the notch and home
// indicator and `env(safe-area-inset-*)` reports 0 everywhere,
// which makes our PWA standalone install look cramped.
//
// `interactiveWidget: "resizes-content"` tells mobile browsers to
// shrink the layout viewport when the on-screen keyboard opens
// (instead of overlaying it on top of inputs), so focused fields
// in dialogs aren't covered.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Server-side theme resolution. Reading the user's saved preference from
  // a cookie lets us bake the right `class="dark"` (or "light") into the
  // initial HTML — no inline FOUC script needed, no React 19 "script tag
  // inside component" warning, no flash. ThemeProvider mirrors any change
  // back to the cookie so subsequent SSRs stay in sync.
  const cookieStore = await cookies();
  const saved = cookieStore.get("theme")?.value;
  const initialTheme: "light" | "dark" = saved === "light" ? "light" : "dark";

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased ${initialTheme}`}
      style={{ colorScheme: initialTheme }}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider defaultTheme={initialTheme}>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
        <PwaRegister />
      </body>
    </html>
  );
}
