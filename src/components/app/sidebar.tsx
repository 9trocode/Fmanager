"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Wallet,
  Briefcase,
  TrendingUp,
  Repeat,
  Sparkles,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", icon: Wallet },
  { href: "/equity", label: "Equity", icon: Briefcase },
  { href: "/cash-flow", label: "Cash flow", icon: Repeat },
  { href: "/projections", label: "Projections", icon: TrendingUp },
  { href: "/advisor", label: "Advisor", icon: Sparkles },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card/30 flex flex-col">
      <div className="px-5 py-5 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded-md bg-primary text-primary-foreground grid place-items-center text-sm font-semibold">
            ƒ
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Founder Finance
            </div>
            <div className="text-[11px] text-muted-foreground">
              your honest balance sheet
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-secondary text-secondary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary/60",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="px-5 py-4 border-t border-border text-[11px] text-muted-foreground">
        <span className="font-mono">v0.1.0 · self-hosted</span>
      </div>
    </aside>
  );
}
