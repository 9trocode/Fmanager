import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import {
  ThemeInitScript,
  ThemeProvider,
} from "@/components/app/theme-provider";
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
  title: "Founder Finance",
  description: "Multi-currency net worth + decision co-pilot for founders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Synchronous FOUC-prevention script. Server-Component emits it once
          into the SSR'd HTML. Lives in <head> so it runs before paint;
          never re-renders on the client, so React 19's "scripts inside
          React components" warning doesn't fire.
        */}
        <ThemeInitScript defaultTheme="dark" />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
