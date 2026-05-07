import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Camera,
  Coins,
  DollarSign,
  Globe2,
  LayoutGrid,
  Mic,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { isAuthenticated } from "@/lib/auth/session";

export default async function LandingPage() {
  const authed = await isAuthenticated();
  const primaryCta = authed
    ? { href: "/dashboard", label: "Open dashboard" }
    : { href: "/welcome", label: "Get started" };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <Header authed={authed} />
      <main className="flex-1">
        <Hero primaryCta={primaryCta} authed={authed} />
        <FeatureGrid />
        <ScenarioDeepDive />
        <SmartCapture />
        <AdvisorPitch />
        <SelfHostedPitch />
        <FinalCta primaryCta={primaryCta} />
      </main>
      <Footer />
    </div>
  );
}

function Header({ authed }: { authed: boolean }) {
  return (
    <header className="border-b border-border/60 bg-background/80 backdrop-blur sticky top-0 z-30">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="size-9 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground grid place-items-center text-base font-semibold">
            ƒ
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight">
              Founder Finance
            </div>
            <div className="text-[10px] text-muted-foreground">
              your honest balance sheet
            </div>
          </div>
        </Link>
        <nav className="flex items-center gap-2">
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="#features">Features</a>
          </Button>
          <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
            <a href="#self-hosted">Self-host</a>
          </Button>
          {authed ? (
            <Button asChild size="sm">
              <Link href="/dashboard">
                Open dashboard <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/welcome">
                  Get started <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero({
  primaryCta,
  authed,
}: {
  primaryCta: { href: string; label: string };
  authed: boolean;
}) {
  return (
    <section className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,oklch(0.55_0.18_265_/_0.18),transparent_70%)]"
      />
      <div className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <Badge variant="outline" className="mb-6 font-mono text-[11px] gap-1.5">
          <span className="size-1.5 rounded-full bg-emerald-400" />
          v0.1 — open source · self-hosted
        </Badge>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-balance leading-[1.05]">
          Personal finance for{" "}
          <span className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            co-founders
          </span>
          ,{" "}
          <span className="text-muted-foreground">
            with the equity treated honestly.
          </span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-balance leading-relaxed">
          Track every account, transaction, budget, and savings goal across
          NGN, USD, EUR — and see your private company equity in three scenarios
          instead of one cooked number.
        </p>
        <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
          <Button asChild size="lg">
            <Link href={primaryCta.href}>
              {primaryCta.label} <ArrowRight className="size-4" />
            </Link>
          </Button>
          {!authed ? (
            <Button asChild size="lg" variant="outline">
              <a href="#features">See what it does</a>
            </Button>
          ) : null}
        </div>
        <p className="mt-6 text-xs text-muted-foreground font-mono">
          BYO Anthropic key · BYO infrastructure · no premium tier exists
        </p>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        <ScenarioPreview />
      </div>
    </section>
  );
}

function ScenarioPreview() {
  const cards = [
    {
      label: "Without equity",
      sublabel: "what you actually have today",
      value: "$181K",
      tone: "border-border bg-card",
      pillBg: "bg-foreground",
      caption: "Plan against this number",
    },
    {
      label: "+ Equity at today's value",
      sublabel: "vested × current FMV, post-tax",
      value: "$1.1M",
      tone: "border-border/60 bg-card/80",
      pillBg: "bg-foreground/40",
      caption: "Paper, not bankable",
    },
    {
      label: "+ Equity at target exit",
      sublabel: "full grant × exit price, post-tax",
      value: "$5.4M",
      tone: "border-border/40 bg-card/60",
      pillBg: "bg-foreground/20",
      caption: "If it works out",
    },
  ];
  return (
    <div className="rounded-2xl border border-border bg-card/40 p-6 md:p-8">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Total net worth
          </div>
          <div className="text-sm text-muted-foreground mt-0.5">
            Three honest views, one balance sheet.
          </div>
        </div>
        <Badge variant="secondary" className="font-mono text-[10px]">
          base · USD
        </Badge>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border ${c.tone} p-5 space-y-3`}
          >
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full ${c.pillBg}`} />
              <span className="text-[11px] font-mono uppercase tracking-wide text-muted-foreground">
                {c.label}
              </span>
            </div>
            <div className="text-3xl font-semibold tabular-nums tracking-tight">
              {c.value}
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed">
              {c.sublabel}
            </div>
            <div className="text-[10px] font-mono text-muted-foreground pt-2 border-t border-border/60">
              {c.caption}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FeatureGrid() {
  const groups: Array<{
    title: string;
    description: string;
    items: Array<{
      icon: React.ComponentType<{ className?: string }>;
      title: string;
      body: string;
    }>;
  }> = [
    {
      title: "Daily money",
      description: "The stuff you actually look at every week.",
      items: [
        {
          icon: Receipt,
          title: "Transactions",
          body:
            "Every income, expense, and transfer. Auto-tagged by category. Filterable by account, date range, kind. Snapshots and transactions stay in sync via effective balance math.",
        },
        {
          icon: Target,
          title: "Budgets per category",
          body:
            "Set monthly limits per category. Click into any budget to see this month's spend and Log spend in one click — it lands as a real transaction.",
        },
        {
          icon: ArrowUpRight,
          title: "Recurring income & expenses",
          body:
            "Salary, rent, contractors, SaaS, school fees. Weekly / monthly / yearly cadences in any currency. Powers cash-flow projections.",
        },
        {
          icon: ShieldCheck,
          title: "Months covered",
          body:
            "Liquid cash divided by monthly expenses. Color-coded threshold so you always know how long your savings cover you if income paused.",
        },
      ],
    },
    {
      title: "Plans & goals",
      description: "What you're working toward, made concrete.",
      items: [
        {
          icon: PiggyBank,
          title: "Savings goals",
          body:
            "Target amount, monthly contribution, length, expected return. See projected balance at completion plus your total net worth at that horizon — in plain English.",
        },
        {
          icon: TrendingUp,
          title: "Net worth projections",
          body:
            "Pre-filled with your real net cash flow. Three lines (Floor / Liquid / Expected) over your chosen horizon, with vesting curves and exit timing baked in.",
        },
      ],
    },
    {
      title: "Wealth & equity",
      description: "The whole balance sheet, including the messy parts.",
      items: [
        {
          icon: Wallet,
          title: "Accounts in any currency",
          body:
            "Cash, brokerage, crypto, real estate, retirement, loans, equity. Each account holds full bank details, snapshots over time, and a transaction log.",
        },
        {
          icon: Globe2,
          title: "Multi-currency native",
          body:
            "NGN, USD, EUR, GBP, CAD, CHF, JPY first-class. Live FX from a free provider, cached locally. Display totals in the currency that lives in your head.",
        },
        {
          icon: Coins,
          title: "Three-scenario equity",
          body:
            "Floor (zero), Liquid (current FMV, post-tax), Expected (full grant × exit, post-tax). Vesting cliffs, exit timing, and tax rates all flow through honestly.",
        },
      ],
    },
    {
      title: "AI that's actually useful",
      description: "Pointed at your real numbers, not stock advice.",
      items: [
        {
          icon: Sparkles,
          title: "Decision-anchored advisor",
          body:
            "BYO Anthropic key. The advisor's system prompt knows your accounts, equity, recurring flows, budgets, runway, and the three real decisions you're weighing.",
        },
        {
          icon: Camera,
          title: "Photo a receipt",
          body:
            "Phone-photo a receipt → Claude vision extracts vendor, amount, date, and category → you confirm → it lands as a transaction.",
        },
        {
          icon: Mic,
          title: "Speak a transaction",
          body:
            '"Spent ₦12,000 on dinner with Tunde." Web Speech captures, Claude parses, you review and submit. No typing required.',
        },
      ],
    },
    {
      title: "Yours, forever",
      description: "Not a SaaS. Not for sale to advertisers.",
      items: [
        {
          icon: ShieldCheck,
          title: "Self-hosted",
          body:
            "Single SQLite file you back up yourself. docker compose up to deploy. Multi-arch images for amd64/arm64. Your data never leaves your box.",
        },
        {
          icon: Users2,
          title: "Read-only sharing",
          body:
            "Optional VIEWER_PASSWORD lets a partner or co-founder see your dashboard without edit rights. Every mutation is admin-guarded server-side.",
        },
        {
          icon: DollarSign,
          title: "No premium tier",
          body:
            "Every feature is in the open source repo. BYO LLM key means inference cost is yours, not ours. There is no tier above this.",
        },
      ],
    },
  ];

  return (
    <section
      id="features"
      className="border-t border-border/60 bg-muted/20 py-24"
    >
      <div className="max-w-6xl mx-auto px-6 space-y-20">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <Badge variant="secondary" className="font-mono text-[10px]">
            What it actually does
          </Badge>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
            Everything you need to run your personal finance life as a founder.
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            Not a stock-tracking app with a dashboard glued on. Real personal
            finance plumbing — accounts, transactions, budgets, goals — with
            equity treated as the asymmetric thing it is.
          </p>
        </div>

        {groups.map((g) => (
          <div key={g.title} className="space-y-6">
            <div className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {g.title}
              </div>
              <h3 className="text-xl md:text-2xl font-semibold tracking-tight">
                {g.description}
              </h3>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.items.map(({ icon: Icon, title, body }) => (
                <Card
                  key={title}
                  className="p-5 space-y-3 hover:border-foreground/30 transition-colors"
                >
                  <div className="size-9 rounded-lg bg-primary/10 text-primary grid place-items-center">
                    <Icon className="size-4" />
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-base font-semibold tracking-tight">
                      {title}
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {body}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScenarioDeepDive() {
  return (
    <section className="py-24 border-t border-border/60">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <Badge variant="secondary" className="font-mono text-[10px]">
              The wedge
            </Badge>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              One paper number is a lie.{" "}
              <span className="text-muted-foreground">
                Three honest ones is a balance sheet.
              </span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Most personal finance apps either ignore your private equity or
              show one inflated number from the last 409A. You spend like you
              have it. You don&apos;t.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Founder Finance models every grant in three scenarios with
              vesting curves, cliffs, exit timing, and tax rates baked in.
              You&apos;ll see what you can plan against today, what&apos;s
              technically on paper, and what an actual exit might net you —
              side by side.
            </p>
          </div>
          <div className="space-y-3">
            {[
              {
                k: "Floor",
                desc: "Equity zeroed out. The honest baseline you plan against.",
                v: "$181,420",
                color: "bg-foreground",
              },
              {
                k: "Liquid",
                desc: "Vested shares × current FMV, post-tax.",
                v: "$1,089,200",
                color: "bg-foreground/50",
              },
              {
                k: "Expected",
                desc: "Full grant × target exit price, post-tax, at exit month.",
                v: "$5,412,000",
                color: "bg-foreground/25",
              },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card p-5"
              >
                <div className="flex items-center gap-3">
                  <span className={`size-2 rounded-full ${row.color}`} />
                  <div>
                    <div className="text-sm font-medium">{row.k}</div>
                    <div className="text-xs text-muted-foreground">{row.desc}</div>
                  </div>
                </div>
                <div className="text-lg font-semibold tabular-nums">
                  {row.v}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function SmartCapture() {
  return (
    <section className="py-24 border-t border-border/60 bg-muted/20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5 order-2 md:order-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="font-mono text-[10px]">
                <Camera className="size-3" /> Photo
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                <Mic className="size-3" /> Voice
              </Badge>
              <Badge variant="outline" className="font-mono text-[10px]">
                <LayoutGrid className="size-3" /> Manual
              </Badge>
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              Logging an expense should take seconds,{" "}
              <span className="text-muted-foreground">not five fields.</span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Snap a receipt — Claude vision extracts vendor, amount, currency,
              date. Or speak it: <em>&ldquo;Spent ₦12,000 on dinner with
              Tunde&rdquo;</em>, parsed into structured fields. You always
              review before it lands. The full manual form is one click away
              when you want it.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              All three flows route through the same{" "}
              <code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                createTransaction
              </code>{" "}
              path, so the data ends up clean and queryable no matter how it
              entered.
            </p>
          </div>
          <Card className="p-6 space-y-4 order-1 md:order-2">
            <div className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-destructive/15 text-destructive grid place-items-center">
                <Receipt className="size-4" />
              </div>
              <div>
                <div className="text-sm font-medium">Restaurant Bonjour</div>
                <div className="text-[11px] text-muted-foreground font-mono">
                  Personal · 2026-05-04
                </div>
              </div>
            </div>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-semibold tabular-nums text-destructive">
                −₦12,000
              </span>
              <Badge
                variant="secondary"
                className="text-[10px] font-mono gap-1"
              >
                <Sparkles className="size-3" /> high confidence
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed pt-3 border-t border-border">
              Posted to <span className="font-mono">GTBank naira</span>. Counts
              against your <span className="font-mono">Personal</span> budget
              for May.
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function AdvisorPitch() {
  return (
    <section className="py-24 border-t border-border/60">
      <div className="max-w-5xl mx-auto px-6">
        <div className="space-y-12">
          <div className="text-center space-y-3 max-w-2xl mx-auto">
            <Badge variant="secondary" className="font-mono text-[10px] gap-1.5">
              <Sparkles className="size-3" /> Decision-anchored advisor
            </Badge>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              Not a chatbot.{" "}
              <span className="text-muted-foreground">
                A co-pilot pointed at your real numbers.
              </span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              The advisor sees your full balance sheet, recurring flows,
              budgets, runway, equity grants, and the three open decisions
              you&apos;re wrestling with — every conversation. BYO Anthropic
              key. Your data never trains a model.
            </p>
          </div>

          <Card className="p-6 md:p-8 space-y-5 max-w-3xl mx-auto bg-card">
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-secondary text-foreground/80 grid place-items-center text-xs font-semibold shrink-0">
                You
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-secondary/60 px-4 py-3 text-sm leading-relaxed">
                Should I early-exercise my Ex-Startup ISOs before September?
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-primary/5 border border-primary/15 px-4 py-3 text-sm leading-relaxed space-y-2">
                <p>
                  At your current floor net worth ($181K) you&apos;d need
                  ~$2,250 cash for the strike plus ~$11K for AMT — that takes
                  your liquid USD from $35K to $22K, dropping your months-covered
                  from 8 to 5.
                </p>
                <p>
                  That&apos;s tight against your &ldquo;12-month sustainability&rdquo;
                  decision. If you exercise, also commit to deferring the
                  Lekki house deposit goal by 4 months. Otherwise: don&apos;t.
                </p>
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground font-mono pt-3 border-t border-border">
              system prompt sees: 8 accounts · 3 grants · 10 recurring flows ·
              5 budgets · 3 active decisions · 28 transactions in last 30d
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function SelfHostedPitch() {
  return (
    <section
      id="self-hosted"
      className="py-24 border-t border-border/60 bg-muted/20"
    >
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          <div className="space-y-5">
            <Badge variant="secondary" className="font-mono text-[10px]">
              <ShieldCheck className="size-3" /> Yours, forever
            </Badge>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              No SaaS account.{" "}
              <span className="text-muted-foreground">
                No premium tier. No data egress.
              </span>
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              Founder Finance is a single Next.js app talking to a single
              SQLite file on disk. Bring your own Anthropic key for the AI
              features. The repo is open source — every feature on this page
              ships in the box.
            </p>
            <ul className="space-y-3 text-sm">
              {[
                "docker compose up to deploy. Multi-arch buildx for amd64/arm64.",
                "Single SQLite file. cp it for backup. Restic / Borg / Litestream optional.",
                "Optional viewer password to share your dashboard read-only.",
                "BYO Anthropic key for the advisor + receipt scan + voice input.",
                "Free FX provider (open.er-api.com) cached in your local DB.",
              ].map((item) => (
                <li key={item} className="flex items-start gap-2.5">
                  <span className="size-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  <span className="text-muted-foreground">{item}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-card p-5 font-mono text-xs leading-relaxed">
              <div className="text-muted-foreground mb-3">
                # one-shot deploy
              </div>
              <div>
                <span className="text-muted-foreground">$</span> git clone
                founder-finance
              </div>
              <div>
                <span className="text-muted-foreground">$</span> cp .env.example
                .env
              </div>
              <div>
                <span className="text-muted-foreground">$</span> docker compose
                up -d --build
              </div>
              <div className="text-muted-foreground mt-3">
                # data lives in ./data/app.db
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Stack
              </div>
              <div className="text-xs text-muted-foreground font-mono leading-relaxed">
                Next.js 16 · TypeScript · Tailwind v4 · shadcn/ui · Drizzle ORM
                · better-sqlite3 · AI SDK v6 · @ai-sdk/anthropic
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FinalCta({
  primaryCta,
}: {
  primaryCta: { href: string; label: string };
}) {
  return (
    <section className="py-24 border-t border-border/60">
      <div className="max-w-3xl mx-auto px-6 text-center space-y-6">
        <Briefcase className="size-10 mx-auto text-muted-foreground" />
        <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
          Stop spending against equity you don&apos;t actually have yet.
        </h2>
        <p className="text-muted-foreground leading-relaxed max-w-xl mx-auto">
          Three minutes to set up. Add your accounts, your grants, your three
          decisions. Watch the dashboard light up.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link href={primaryCta.href}>
              {primaryCta.label} <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
          <div className="size-6 rounded bg-primary/10 text-primary grid place-items-center text-[10px] font-semibold">
            ƒ
          </div>
          <span>
            Founder Finance · open source ·{" "}
            <span className="font-mono">v0.1.0</span>
          </span>
        </div>
        <nav className="flex items-center gap-5 text-xs text-muted-foreground">
          <a
            href="#features"
            className="hover:text-foreground transition-colors"
          >
            Features
          </a>
          <a
            href="#self-hosted"
            className="hover:text-foreground transition-colors"
          >
            Self-host
          </a>
          <Link
            href="/welcome"
            className="hover:text-foreground transition-colors"
          >
            Get started
          </Link>
          <Link
            href="/login"
            className="hover:text-foreground transition-colors"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
