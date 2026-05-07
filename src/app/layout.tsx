import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Synchronous FOUC-prevention script.
//
// next-themes ships its own inline script for this, but it injects it inside
// `<body>` which React 19 warns about ("Encountered a script tag while
// rendering React component… scripts inside React components are never
// executed when rendering on the client"). Hoisting an equivalent script
// into `<head>` is the React-blessed location and runs before any paint.
//
// We mirror next-themes' default behavior (storageKey "theme", attribute
// "class") so when ThemeProvider hydrates it agrees with the class we
// already applied — no flash, no mismatch.
const THEME_INIT_SCRIPT = `(function(){try{var s=localStorage.getItem('theme')||'dark';var t=s==='system'?(window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):s;var d=document.documentElement;d.classList.remove('light','dark');d.classList.add(t);d.style.colorScheme=t;}catch(e){}})();`;

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
          Inline FOUC-prevention script in <head>. Runs synchronously before
          paint to apply the saved theme class. Lives in <head> to avoid the
          React 19 "scripts inside React components" warning that fires when
          next-themes injects its equivalent script inside <body>.
        */}
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
