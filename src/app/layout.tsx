import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/app/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
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
      </body>
    </html>
  );
}
