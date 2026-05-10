import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Calendar,
  Camera,
  Coins,
  DollarSign,
  Equal,
  Globe2,
  LayoutGrid,
  Mic,
  PiggyBank,
  Receipt,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Users2,
  Wallet,
  Wrench,
  Zap,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CairnMark } from "@/components/app/cairn-mark";
import { GitHubStats } from "@/components/app/github-stats";
import { isAuthenticated } from "@/lib/auth/session";

export default async function LandingPage() {
  const authed = await isAuthenticated();

  const primaryCta = authed
    ? { label: "Go to dashboard", href: "/dashboard" }
    : { label: "Get started", href: "/welcome" };

  return (
    <div className="flex flex-col min-h-screen">
      <Hero authed={authed} primaryCta={primaryCta} />
      <DashboardPreview />
      <BudgetsPreview />
      <FeatureGrid />
      <AdvisorPitch />
      <SelfHostedPitch />
      <FinalCta primaryCta={primaryCta} />
      <Footer />
    </div>
  );
}

function Hero({
  authed,
  primaryCta,
}: {
  authed: boolean;
  primaryCta: { href: string; label: string };
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
          v0.1 — open source · self-hosted · multi-tenant
        </Badge>
        <h1 className="text-4xl md:text-6xl font-semibold tracking-tight text-balance leading-[1.05]">
          Personal finance for{" "}
          <span className="bg-gradient-to-br from-foreground to-foreground/60 bg-clip-text text-transparent">
            professionals
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
        <div className="mt-5 flex items-center justify-center">
          {/*
            Live stars + forks + last-commit pulled hourly from the
            GitHub API server-side. Wrapped in Suspense with a static
            fallback so a cold GitHub fetch never blocks the rest of
            the hero from streaming. After the first cache fill it's
            served instantly from Next's data cache for the next hour.
          */}
          <Suspense
            fallback={
              <a
                href="https://github.com/9trocode/Cairn"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground"
              >
                9trocode/Cairn · loading…
              </a>
            }
          >
            <GitHubStats />
          </Suspense>
        </div>
        <p className="mt-5 text-xs text-muted-foreground font-mono">
          BYO Anthropic key · BYO infrastructure · no premium tier exists
        </p>

        {/*
          Deployment modes. One Cairn binary, three ways to run it —
          worth saying out loud since most self-hosted finance apps
          assume a single user.
        */}
        <div className="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl mx-auto text-left">
          <DeployMode
            label="Solo"
            title="Just you"
            body="Run it on your own box. One login, all your data, never leaves the machine."
          />
          <DeployMode
            label="Family / Partners"
            title="Share the same view"
            body="Invite a partner or family member. They sign in with their own password and read or write your shared finances."
          />
          <DeployMode
            label="Host for others"
            title="Each tenant siloed"
            body="Open registration creates isolated workspaces — every user gets their own accounts, budgets, equity. Resell-ready."
          />
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pb-20">
        <ScenarioPreview />
      </div>
    </section>
  );
}

function DeployMode({
  label,
  title,
  body,
}: {
  label: string;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card/50 p-4 space-y-1.5">
      <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium">{title}</div>
      <p className="text-xs text-muted-foreground leading-relaxed">{body}</p>
    </div>
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

/**
 * Realistic Home-page snapshot. Mirrors the actual /dashboard surface
 * — month filter chip, three stats cards (Spent / Income / Net),
 * income progress bar — so visitors see the product, not a stock
 * mockup. Numbers are illustrative; the structure is real.
 */
function DashboardPreview() {
  return (
    <section className="py-20 border-t border-border/60">
      <div className="max-w-5xl mx-auto px-6 space-y-10">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <Badge variant="secondary" className="font-mono text-[10px] gap-1.5">
            <LayoutGrid className="size-3" /> Home
          </Badge>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
            Every month resets.{" "}
            <span className="text-muted-foreground">
              Caps and recurring flows carry over as the skeleton.
            </span>
          </h2>
          <p className="text-muted-foreground leading-relaxed">
            One sidebar dropdown scrubs every page back through the last
            two years. Spend starts fresh on the 1st; the structure
            you&apos;ve built doesn&apos;t.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 md:p-7 space-y-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-xl font-semibold tracking-tight">Home</div>
              <div className="text-xs text-muted-foreground">
                Where your money&apos;s going in May 2026.
              </div>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background/60 px-2.5 py-1 text-[11px] font-mono text-muted-foreground">
              <Calendar className="size-3" />
              May 2026 (this month)
            </div>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <PreviewStat
              label="Spent this month"
              icon={<ArrowDownRight className="size-3.5 text-destructive" />}
              value="NGN 700K"
              valueClass="text-destructive"
              footnote="700K of 1.2M budgeted (58%)"
              progress={58}
              progressClass="bg-emerald-500/80"
            />
            <PreviewStat
              label="Income this month"
              icon={<ArrowUpRight className="size-3.5 text-emerald-300" />}
              value="NGN 2.18M"
              valueClass="text-emerald-300"
              footnote="Received so far: 0 · 0%"
              progress={0}
              progressClass="bg-emerald-500/70"
              progressLabel
            />
            <PreviewStat
              label="Net this month"
              icon={<Equal className="size-3.5 text-muted-foreground" />}
              value="+NGN 1.48M"
              valueClass="text-emerald-300"
              footnote="MTD actual: −NGN 700K (logged − spend so far)"
            />
          </div>

          <div className="flex items-center justify-between gap-3 text-[11px] text-muted-foreground font-mono pt-1">
            <span>· Sidebar month filter persists across every page</span>
            <span>· Auto-accrual posts paychecks and rent on schedule</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewStat({
  label,
  icon,
  value,
  valueClass,
  footnote,
  progress,
  progressClass,
  progressLabel,
}: {
  label: string;
  icon: React.ReactNode;
  value: string;
  valueClass: string;
  footnote: string;
  progress?: number;
  progressClass?: string;
  progressLabel?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4 space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className={`text-2xl font-mono tabular-nums tracking-tight ${valueClass}`}>
        {value}
      </div>
      <div className="text-[11px] font-mono text-muted-foreground leading-snug">
        {footnote}
      </div>
      {progress != null ? (
        <div className="space-y-1 pt-1">
          {progressLabel ? (
            <div className="flex justify-end text-[10px] font-mono text-muted-foreground">
              {progress}%
            </div>
          ) : null}
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className={`h-full ${progressClass ?? "bg-foreground/40"}`}
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Real-shape mock of the "Budgets vs cash flow" panel on /budgets.
 * A stacked four-bucket bar (budgeted, recurring, one-time, free)
 * plus a legend — exactly what users see in-app. Drives home that
 * the product knows the difference between planned vs actual.
 */
function BudgetsPreview() {
  return (
    <section className="py-16 border-t border-border/60 bg-muted/20">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="space-y-5">
            <Badge variant="secondary" className="font-mono text-[10px] gap-1.5">
              <Target className="size-3" /> Budgets vs cash flow
            </Badge>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
              Stop planning against income that&apos;s already spent.
            </h2>
            <p className="text-muted-foreground leading-relaxed">
              A stacked allocation bar splits your monthly income four
              ways: budget caps, recurring flows that aren&apos;t in a
              budget, one-time expenses you&apos;ve already logged this
              month, and what&apos;s actually free.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Recurring flows tied to a budget auto-accrue into it — no
              double-count, no manual logging — and the bar lights up
              red the moment your commitments cross your income.
            </p>
            <ul className="space-y-2 text-sm">
              {[
                "Auto-accrual posts paychecks + rent on schedule",
                "Budgets can scope to a single account or all of them",
                "One-time expenses tie to a budget at log time",
                "Switch months in the sidebar to compare past periods",
              ].map((b) => (
                <li
                  key={b}
                  className="flex items-start gap-2 text-muted-foreground"
                >
                  <span className="size-1.5 rounded-full bg-emerald-400 mt-2 shrink-0" />
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border border-border bg-card/60 backdrop-blur p-5 md:p-6 space-y-5 shadow-sm">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="size-4 text-muted-foreground" />
                  Budgets vs cash flow
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Where your monthly income is going.
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Monthly income
                </div>
                <div className="font-mono tabular-nums text-base text-emerald-300">
                  $5,000
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="h-3 rounded-full bg-secondary overflow-hidden flex">
                <div className="h-full bg-blue-500/80" style={{ width: "30%" }} />
                <div className="h-full bg-amber-500/80" style={{ width: "26%" }} />
                <div className="h-full bg-orange-500/80" style={{ width: "14%" }} />
                <div className="h-full bg-emerald-500/70" style={{ width: "30%" }} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <PreviewLegend
                  swatch="bg-blue-500/80"
                  label="Budgeted"
                  amount="$1,500"
                  share="30%"
                />
                <PreviewLegend
                  swatch="bg-amber-500/80"
                  label="Recurring"
                  amount="$1,300"
                  share="26%"
                  hint="not in a budget"
                />
                <PreviewLegend
                  swatch="bg-orange-500/80"
                  label="One-time"
                  amount="$700"
                  share="14%"
                  hint="MTD unbudgeted"
                />
                <PreviewLegend
                  swatch="bg-emerald-500/70"
                  label="Free"
                  amount="$1,500"
                  share="30%"
                  hint="point a savings goal at it"
                />
              </div>
            </div>

            <div className="rounded-md border border-blue-500/25 bg-blue-500/5 px-3 py-2.5 text-[11px] leading-relaxed">
              <div className="font-medium text-blue-200 mb-0.5">
                Recurring Internet auto-fills its budget.
              </div>
              <div className="text-muted-foreground">
                Tied flows accrue straight into the matching cap — no
                double-count.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function PreviewLegend({
  swatch,
  label,
  amount,
  share,
  hint,
}: {
  swatch: string;
  label: string;
  amount: string;
  share: string;
  hint?: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className={`size-2 rounded-sm ${swatch}`} />
        <span className="font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="font-mono tabular-nums">
        {amount}
        <span className="text-muted-foreground text-[10px] ml-1">
          ({share})
        </span>
      </div>
      {hint ? (
        <div className="text-[10px] text-muted-foreground">{hint}</div>
      ) : null}
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
      ],
    },
    {
      title: "Plans & goals",
      description: "What you're working toward, made concrete.",
      items: [
        {
          icon: ShieldCheck,
          title: "Months covered",
          body:
            "Liquid cash divided by monthly expenses. Color-coded threshold so you always know how long your savings cover you if income paused.",
        },
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
            '\"Spent ₦12,000 on dinner with Tunde.\" Web Speech captures, Claude parses, you review and submit. No typing required.',
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
            "Optional VIEWER_PASSWORD lets a partner view your dashboard without edit rights. Every mutation is admin-guarded server-side.",
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
      className="border-t border-border/60 bg-muted/20 py-16"
    >
      <div className="max-w-6xl mx-auto px-6 space-y-20">
        <div className="text-center max-w-2xl mx-auto space-y-3">
          <Badge variant="secondary" className="font-mono text-[10px]">
            What it actually does
          </Badge>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight text-balance">
            Everything you need to run your personal finance life.
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

function AdvisorPitch() {
  return (
    <section className="py-16 border-t border-border/60">
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

            {/* Agent action — shows the advisor isn't just talking. */}
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-secondary text-foreground/80 grid place-items-center text-xs font-semibold shrink-0">
                You
              </div>
              <div className="rounded-2xl rounded-tl-sm bg-secondary/60 px-4 py-3 text-sm leading-relaxed">
                OK, log a $13,250 expense to Capital Reserve and tag it
                ISO exercise.
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="size-8 rounded-full bg-primary/15 text-primary grid place-items-center shrink-0">
                <Sparkles className="size-4" />
              </div>
              <div className="space-y-2 flex-1">
                <div className="rounded-md border border-border/80 bg-background/60 px-2.5 py-1.5 text-[11px] font-mono inline-flex items-center gap-1.5 text-muted-foreground">
                  <Wrench className="size-3" />
                  <span className="text-foreground">listAccounts</span>
                  <span className="text-[10px]">✓ done</span>
                </div>
                <div className="rounded-md border border-border/80 bg-background/60 px-2.5 py-1.5 text-[11px] font-mono inline-flex items-center gap-1.5 text-muted-foreground ml-2">
                  <Wrench className="size-3" />
                  <span className="text-foreground">createTransaction</span>
                  <span className="text-[10px]">✓ done</span>
                </div>
                <div className="rounded-2xl rounded-tl-sm bg-primary/5 border border-primary/15 px-4 py-3 text-sm leading-relaxed">
                  Logged −$13,250 to Capital Reserve on 2026-05-07,
                  category &ldquo;ISO exercise.&rdquo; Net worth dropped to
                  $168K floor; runway is now 5.2 months — flagged in your
                  decision context for the next time we look.
                </div>
              </div>
            </div>

            <div className="text-[11px] text-muted-foreground font-mono pt-3 border-t border-border flex items-center gap-2 flex-wrap">
              <span>system prompt sees:</span>
              <span>8 accounts · 3 grants · 10 recurring flows · 5 budgets · 3 active decisions · 28 transactions / 30d</span>
              <Zap className="size-3 text-amber-300/80 ml-auto" />
              <span className="text-amber-300/80">8 tools to act on your behalf</span>
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
      className="py-16 border-t border-border/60 bg-muted/20"
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
              Cairn is a single Next.js app talking to a single SQLite
              file on disk. Bring your own Anthropic key for the AI
              features. The repo is open source — every feature on this
              page ships in the box.
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
                cairn
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
    <section className="py-16 border-t border-border/60">
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
          <div className="size-6 rounded bg-primary/10 text-primary grid place-items-center">
            <CairnMark size={14} bare className="text-primary" />
          </div>
          <span>
            Cairn · open source ·{" "}
            <span className="font-mono">v1.1.0</span>
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
          <a
            href="https://github.com/9trocode/Cairn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors inline-flex items-center gap-1.5"
            aria-label="Cairn on GitHub"
          >
            {/* Inline GitHub mark — kept self-contained here so the
                Footer doesn't need to fetch live stats just to render. */}
            <svg
              viewBox="0 0 24 24"
              width={14}
              height={14}
              aria-hidden
              fill="currentColor"
            >
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.96 10.96 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
