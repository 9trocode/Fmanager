"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutGrid,
  Receipt,
  Target,
  Repeat,
  PiggyBank,
  LineChart,
  Wallet,
  Coins,
  Award,
  Sparkles,
  Bell,
  Settings,
  LogOut,
  Eye,
  Menu,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { LockNowButton, PanicButton } from "@/components/app/screen-lock";
import { MonthFilter } from "@/components/app/month-filter";
import { useRole } from "@/components/app/role-context";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { VisuallyHidden } from "radix-ui";

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    label: "Money",
    items: [
      { href: "/dashboard", label: "Home", icon: LayoutGrid },
      { href: "/transactions", label: "Transactions", icon: Receipt },
      { href: "/budgets", label: "Budgets", icon: Target },
      { href: "/cash-flow", label: "Cash flow", icon: Repeat },
    ],
  },
  {
    label: "Goals",
    items: [
      { href: "/savings", label: "Goals", icon: PiggyBank },
      { href: "/projections", label: "Projections", icon: LineChart },
    ],
  },
  {
    label: "Wealth",
    items: [
      { href: "/accounts", label: "Accounts", icon: Wallet },
      { href: "/net-worth", label: "Net worth", icon: Coins },
      { href: "/equity", label: "Equity", icon: Award },
    ],
  },
  {
    label: "Tools",
    items: [
      { href: "/advisor", label: "Advisor", icon: Sparkles },
      { href: "/alerts", label: "Alerts", icon: Bell },
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(href + "/");
}

/**
 * Inner content of the sidebar — brand, nav sections, role + sign-out.
 * Reused by both the desktop sidebar (always visible at md+) and the
 * mobile slide-out sheet (triggered from the top bar).
 *
 * `onNavigate` is called when the user picks a link, so the parent can
 * close the sheet on mobile.
 */
function SidebarContent({
  onNavigate,
  alertCount = 0,
  alertCritical = 0,
  panicRedirectUrl = "/login",
}: {
  onNavigate?: () => void;
  alertCount?: number;
  alertCritical?: number;
  panicRedirectUrl?: string;
}) {
  const pathname = usePathname();
  const role = useRole();

  return (
    <>
      {/* Brand */}
      <div className="px-5 py-6">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className="flex items-center gap-3 group"
        >
          <div className="size-10 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-lg font-semibold shadow-sm group-hover:shadow-md transition-shadow">
            ƒ
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-[15px] font-semibold tracking-tight truncate">
              Founder Finance
            </div>
            <div className="text-[11px] text-muted-foreground tracking-wide">
              your honest balance sheet
            </div>
          </div>
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-6">
        {SECTIONS.map((section) => (
          <div key={section.label} className="space-y-1">
            <div className="px-3 mb-1.5 text-[11px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
              {section.label}
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-full bg-primary" />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-[18px] shrink-0",
                      active ? "text-primary" : "",
                    )}
                  />
                  <span className="truncate">{label}</span>
                  {href === "/alerts" && alertCount > 0 ? (
                    <span
                      className={cn(
                        "ml-auto inline-flex min-w-[1.25rem] h-5 px-1.5 items-center justify-center rounded-full text-[10px] font-mono font-medium tabular-nums",
                        alertCritical > 0
                          ? "bg-destructive text-destructive-foreground"
                          : "bg-secondary text-foreground",
                      )}
                      aria-label={`${alertCount} active alerts${alertCritical > 0 ? `, ${alertCritical} critical` : ""}`}
                    >
                      {alertCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: month filter + role + sign out */}
      <div className="px-3 py-3 border-t border-border space-y-2">
        {/*
          Global month-scope picker. Lives in the sidebar so the choice
          persists across page navigations — pick October 2024 once,
          every page that respects it (Home, Budgets, …) re-renders
          for that month until you reset.
        */}
        <div className="px-1">
          <MonthFilter variant="compact" />
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pt-1">
          <div className="flex items-center gap-2 min-w-0">
            {role === "viewer" ? (
              <span className="flex items-center gap-1.5 text-xs font-mono text-amber-300/90">
                <Eye className="size-3.5" />
                viewer
              </span>
            ) : (
              <span className="text-xs font-mono text-muted-foreground">
                admin
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <LockNowButton />
            <PanicButton redirectUrl={panicRedirectUrl} />
            <ThemeToggle />
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                title="Sign out"
                className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
              >
                <LogOut className="size-4" />
              </button>
            </form>
          </div>
        </div>
        <div className="mt-1.5 px-2 text-[10px] font-mono text-muted-foreground/60">
          v0.1.0
        </div>
      </div>
    </>
  );
}

/**
 * Desktop-only sidebar. Hidden below md so it doesn't squeeze the main
 * column on phones. Mobile users get the same nav via <MobileTopBar>.
 */
export function Sidebar({
  alertCount,
  alertCritical,
  panicRedirectUrl,
}: {
  alertCount?: number;
  alertCritical?: number;
  panicRedirectUrl?: string;
}) {
  return (
    <aside className="hidden md:flex sticky top-0 self-start h-screen w-72 shrink-0 border-r border-border bg-card/40 backdrop-blur-md flex-col">
      <SidebarContent
        alertCount={alertCount}
        alertCritical={alertCritical}
        panicRedirectUrl={panicRedirectUrl}
      />
    </aside>
  );
}

/**
 * Mobile top bar with brand + hamburger. The hamburger opens a left-side
 * sheet containing the full sidebar. Auto-closes on route change so the
 * user lands on the new page without an open drawer.
 */
export function MobileTopBar({
  alertCount,
  alertCritical,
  panicRedirectUrl,
}: {
  alertCount?: number;
  alertCritical?: number;
  panicRedirectUrl?: string;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the sheet when the route changes — clicking a link inside the
  // sheet would otherwise leave it stuck open on the new page.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <header className="md:hidden sticky top-0 z-40 flex items-center justify-between gap-3 h-14 px-4 border-b border-border bg-background/85 backdrop-blur-md">
      <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
        <div className="size-8 rounded-md bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-sm font-semibold shrink-0">
          ƒ
        </div>
        <span className="text-sm font-semibold tracking-tight truncate">
          Founder Finance
        </span>
      </Link>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            aria-label="Open navigation"
            className="size-9 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </SheetTrigger>
        <SheetContent
          side="left"
          className="w-72 max-w-[85vw] p-0 flex flex-col bg-card/95 backdrop-blur-md"
          showCloseButton={false}
        >
          {/* Sheet requires a title for a11y; we don't want it visible. */}
          <VisuallyHidden.Root asChild>
            <SheetTitle>Navigation</SheetTitle>
          </VisuallyHidden.Root>
          <SidebarContent
            onNavigate={() => setOpen(false)}
            alertCount={alertCount}
            alertCritical={alertCritical}
            panicRedirectUrl={panicRedirectUrl}
          />
        </SheetContent>
      </Sheet>
    </header>
  );
}
