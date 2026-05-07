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
      <body className="min-h-full flex flex-col bg-background text-foreground">
        {/*
          FOUC-prevention script. Uses next/script with `beforeInteractive`
          (inside <body>) so Next hoists it into the document <head> via
          imperative DOM injection instead of through React's render tree —
          this is what avoids React 19's "scripts inside React components"
          warning. Runs synchronously before any other code.
        */}
        <ThemeInitScript defaultTheme="dark" />
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
