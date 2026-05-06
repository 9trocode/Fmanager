import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Sparkles,
  ShieldCheck,
  Globe2,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { isAuthenticated } from "@/lib/auth/session";

const features = [
  {
    icon: Sparkles,
    title: "Three-scenario equity",
    body: "Floor (zero). Liquid (current FMV, post-tax). Expected (full grant at exit, post-tax). Decisions are made against the floor, not the ceiling.",
  },
  {
    icon: Globe2,
    title: "Multi-currency native",
    body: "NGN, USD, EUR, GBP, CAD, CHF, JPY first-class. Live FX from a free provider. No 'base currency' that punishes the naira-holder.",
  },
  {
    icon: TrendingUp,
    title: "Projections that respect equity",
    body: "Vesting curves, exit-timing assumptions, and tax rates all flow through. The chart shows what you can actually plan against.",
  },
  {
    icon: ShieldCheck,
    title: "Self-hosted. Yours.",
    body: "Single SQLite file you back up yourself. Your Anthropic key never leaves your box. No premium tier exists, ever.",
  },
];

export default async function LandingPage() {
  const authed = await isAuthenticated();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
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
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <a href="#features">Features</a>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <a href="#self-host">Self-host</a>
            </Button>
            {authed ? (
              <Button asChild size="sm">
                <Link href="/dashboard">
                  Open dashboard <ArrowRight className="size-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-24 md:py-32 text-center space-y-8">
            <Badge variant="secondary" className="font-mono text-[11px]">
              v0.1 · open source · self-hosted
            </Badge>
            <h1 className="text-5xl md:text-6xl font-semibold tracking-tight text-balance max-w-3xl mx-auto leading-[1.05]">
              The honest balance sheet for founders.
            </h1>
            <p className="text-base md:text-lg text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
              Multi-currency net worth. Three-scenario equity (floor, liquid,
              expected). An AI advisor anchored on your real decisions. Self-hosted,
              free, and built for people whose paper net worth lies to them.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {authed ? (
                <Button asChild size="lg">
                  <Link href="/dashboard">
                    Open dashboard <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <Link href="/login">
                    Get started <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
              <Button asChild variant="outline" size="lg">
                <a href="#self-host">
                  <Code2 className="size-4" />
                  Self-host it
                </a>
              </Button>
            </div>

            {/* Three-scenario teaser */}
            <div className="pt-12 grid grid-cols-3 gap-4 max-w-2xl mx-auto">
              {[
                { label: "Floor", value: "$120k", hint: "equity = 0" },
                { label: "Liquid", value: "$680k", hint: "current FMV" },
                { label: "Expected", value: "$5.2M", hint: "target exit" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="rounded-lg border border-border bg-card/30 px-4 py-5 text-left"
                >
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {s.label}
                  </div>
                  <div className="font-mono text-xl tabular-nums mt-1">
                    {s.value}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {s.hint}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Why it exists */}
        <section className="border-b border-border bg-card/20">
          <div className="max-w-3xl mx-auto px-6 py-20 space-y-6 text-balance">
            <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
              Why this exists
            </div>
            <p className="text-xl md:text-2xl leading-relaxed">
              Founders carry weird balance sheets: NGN/USD/EUR cash, brokerage in
              two jurisdictions, crypto, and a giant slab of private company
              equity that may or may not ever be liquid.
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Existing tools either ignore one of those buckets, treat private
              equity dishonestly (one paper number, taken seriously), or hide the
              useful features behind a premium tier. This is the un-premium
              version: truly free, founder-grade, and built around the only
              question that matters — <em>what can I actually plan against?</em>
            </p>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="border-b border-border">
          <div className="max-w-6xl mx-auto px-6 py-20 space-y-12">
            <div className="space-y-3 text-center">
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                What it does
              </div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Built for the way founder net worth actually works.
              </h2>
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              {features.map((f) => (
                <div
                  key={f.title}
                  className="rounded-lg border border-border bg-card/30 p-6 space-y-3"
                >
                  <div className="size-9 rounded-md bg-primary/15 text-primary grid place-items-center">
                    <f.icon className="size-5" />
                  </div>
                  <div className="text-base font-semibold">{f.title}</div>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {f.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Self-host */}
        <section id="self-host" className="border-b border-border bg-card/20">
          <div className="max-w-3xl mx-auto px-6 py-20 space-y-8">
            <div className="space-y-3">
              <div className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">
                Self-host
              </div>
              <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">
                Three commands, one volume.
              </h2>
              <p className="text-base text-muted-foreground leading-relaxed">
                Bring your own infra and your own Anthropic key. The whole app fits in
                a single SQLite file. Back it up however you back up anything else.
              </p>
            </div>
            <pre className="rounded-lg border border-border bg-card/60 p-5 font-mono text-xs leading-relaxed overflow-x-auto">
{`cp .env.example .env
# set ADMIN_PASSWORD and SESSION_SECRET
docker compose up -d --build`}
            </pre>
            <div className="flex flex-wrap gap-3">
              <Button asChild variant="outline">
                <a
                  href="https://github.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Code2 className="size-4" />
                  View source
                </a>
              </Button>
              {authed ? (
                <Button asChild>
                  <Link href="/dashboard">
                    Open dashboard <ArrowRight className="size-4" />
                  </Link>
                </Button>
              ) : (
                <Button asChild>
                  <Link href="/login">
                    Sign in <ArrowRight className="size-4" />
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="font-mono">v0.1.0 · MIT</div>
          <div>
            Built for founders. Self-hosted, opinionated, and unwilling to lie to
            you about your equity.
          </div>
        </div>
      </footer>
    </div>
  );
}
