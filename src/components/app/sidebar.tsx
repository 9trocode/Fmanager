"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  Settings,
  LogOut,
  Eye,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRole } from "@/components/app/role-context";

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
      { href: "/savings", label: "Savings", icon: PiggyBank },
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
      { href: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  if (pathname === href) return true;
  if (href === "/dashboard") return false;
  return pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  const role = useRole();

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card/30 flex flex-col">
      {/* Brand */}
      <div className="px-5 py-5">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <div className="size-8 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-base font-semibold shadow-sm group-hover:shadow-md transition-shadow">
            ƒ
          </div>
          <div className="leading-tight min-w-0">
            <div className="text-sm font-semibold tracking-tight truncate">
              Founder Finance
            </div>
            <div className="text-[10px] text-muted-foreground tracking-wide">
              your honest balance sheet
            </div>
          </div>
        </Link>
      </div>

      {/* Sections */}
      <nav className="flex-1 overflow-y-auto px-3 pb-2 space-y-5">
        {SECTIONS.map((section) => (
          <div key={section.label} className="space-y-0.5">
            <div className="px-3 mb-1 text-[10px] uppercase tracking-[0.08em] font-medium text-muted-foreground/70">
              {section.label}
            </div>
            {section.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-md px-3 py-1.5 text-[13px] transition-colors",
                    active
                      ? "bg-primary/10 text-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50",
                  )}
                >
                  {active ? (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-0.5 rounded-full bg-primary" />
                  ) : null}
                  <Icon
                    className={cn(
                      "size-4 shrink-0",
                      active ? "text-primary" : "",
                    )}
                  />
                  <span className="truncate">{label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer: role + sign out */}
      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="flex items-center gap-2 min-w-0">
            {role === "viewer" ? (
              <span className="flex items-center gap-1.5 text-[11px] font-mono text-amber-300/90">
                <Eye className="size-3" />
                viewer
              </span>
            ) : (
              <span className="text-[11px] font-mono text-muted-foreground">
                admin
              </span>
            )}
          </div>
          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              title="Sign out"
              className="size-7 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
            >
              <LogOut className="size-3.5" />
            </button>
          </form>
        </div>
        <div className="mt-2 px-2 text-[10px] font-mono text-muted-foreground/60">
          v0.1.0
        </div>
      </div>
    </aside>
  );
}
