import { Briefcase } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import { AddGrantDialog } from "@/components/app/add-grant-dialog";
import { HeroBackground } from "@/components/app/hero-background";
import { NetWorthBreakdown } from "@/components/app/networth-breakdown";
import {
  ExplainPopover,
  type ExplainLine,
} from "@/components/app/explain-popover";
import { getBaseCurrency, listAccounts } from "@/lib/db/queries";
import {
  computeNetWorth,
  CATEGORY_LABEL,
  CATEGORY_DISPLAY_ORDER,
  type CategoryKey,
} from "@/lib/aggregation";
import {
  SCENARIOS,
  SCENARIO_LABEL,
  SCENARIO_DESCRIPTION,
  type Scenario,
} from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export default async function NetWorthPage() {
  const baseCurrency = await getBaseCurrency();
  const [summary, accounts] = await Promise.all([
    computeNetWorth(baseCurrency),
    listAccounts(),
  ]);
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));
  void accountOptions;

  return (
    <>
      <HeroBackground />
      <PageHeader
        size="lg"
        title="Net worth"
        description="Your full balance sheet across currencies, with company equity shown three ways: without it, at its current value, or at target exit."
        actions={
          <>
            <AddAccountDialog />
            <AddGrantDialog />
          </>
        }
      />

      {!summary.hasData ? (
        <EmptyState
          icon={Briefcase}
          title="No data yet"
          description="Add an account or equity grant to see your net worth across scenarios and currencies."
          action={
            <div className="flex gap-2">
              <AddAccountDialog />
              <AddGrantDialog />
            </div>
          }
        />
      ) : (
        <Tabs defaultValue="floor" className="space-y-6">
          <div className="flex items-center justify-between">
            <TabsList>
              {SCENARIOS.map((s) => (
                <TabsTrigger key={s} value={s}>
                  {SCENARIO_LABEL[s]}
                </TabsTrigger>
              ))}
            </TabsList>
            <Badge variant="secondary" className="font-mono text-[11px]">
              base · {baseCurrency}
            </Badge>
          </div>

          {SCENARIOS.map((s) => (
            <TabsContent key={s} value={s} className="space-y-6">
              <ScenarioHero
                scenario={s}
                summary={summary}
                baseCurrency={baseCurrency}
              />
              <CategoryBreakdown
                scenario={s}
                summary={summary}
                baseCurrency={baseCurrency}
              />
              <CurrencyBreakdown
                scenario={s}
                summary={summary}
                baseCurrency={baseCurrency}
              />
              {/*
                Per-account derivation. Same shape under every
                scenario (snapshot + transactions-since is what feeds
                the cash side of all three); equity overlay differs
                per scenario but is summarized in the category
                panel above.
              */}
              <NetWorthBreakdown />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  );
}

function ScenarioHero({
  scenario,
  summary,
  baseCurrency,
}: {
  scenario: Scenario;
  summary: ReturnType<typeof computeNetWorth> extends Promise<infer T> ? T : never;
  baseCurrency: string;
}) {
  const value = summary.totals[scenario];
  const others = SCENARIOS.filter((s) => s !== scenario);

  // Build the breakdown lines that explain how the headline number was
  // computed — every non-zero asset / liability category that fed into
  // the scenario total. Helps answer "wait, why is this NGN 57k?"
  // without the user having to crawl the per-category panel below.
  const cats = summary.byCategory[scenario];
  const breakdownLines: ExplainLine[] = CATEGORY_DISPLAY_ORDER.filter(
    (k) => cats[k] !== 0,
  ).map((k) => ({
    label: CATEGORY_LABEL[k],
    value: formatMoney(cats[k], baseCurrency, { signed: cats[k] < 0 }),
  }));
  breakdownLines.push({
    label: "Total",
    value: formatMoney(value, baseCurrency),
    emphasis: "total",
  });

  return (
    <Card>
      <CardHeader>
        <CardDescription>{SCENARIO_DESCRIPTION[scenario]}</CardDescription>
        <CardTitle className="text-5xl font-semibold tracking-tight tabular-nums mt-2 flex items-center gap-2">
          {formatMoney(value, baseCurrency)}
          <ExplainPopover
            title={formatMoney(value, baseCurrency)}
            subtitle={`${SCENARIO_LABEL[scenario]} net worth — sum of every account and grant under this scenario.`}
            lines={breakdownLines}
            formula={`= ${CATEGORY_DISPLAY_ORDER.filter((k) => cats[k] !== 0)
              .map((k) => CATEGORY_LABEL[k])
              .join(" + ")}`}
            footer={
              scenario === "floor"
                ? "Floor pretends company equity is worth $0 today — the honest baseline you can plan against."
                : scenario === "liquid"
                  ? "Liquid uses each grant's vested shares × current FMV minus tax — what you could realistically convert today."
                  : "Expected uses each grant's full share count × target exit price minus tax — the if-it-works-out number."
            }
          />
        </CardTitle>
      </CardHeader>
      <CardContent className="border-t border-border pt-4 flex items-center gap-6 text-xs">
        {others.map((o) => {
          const diff = summary.totals[o] - value;
          return (
            <div key={o}>
              <span className="text-muted-foreground">vs {SCENARIO_LABEL[o]}: </span>
              <span
                className={
                  "font-mono tabular-nums " +
                  (diff > 0 ? "text-emerald-400" : diff < 0 ? "text-destructive" : "")
                }
              >
                {formatMoney(diff, baseCurrency, { signed: true, compact: true })}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CategoryBreakdown({
  scenario,
  summary,
  baseCurrency,
}: {
  scenario: Scenario;
  summary: ReturnType<typeof computeNetWorth> extends Promise<infer T> ? T : never;
  baseCurrency: string;
}) {
  const cats = summary.byCategory[scenario];
  const rows = CATEGORY_DISPLAY_ORDER.filter(
    (k): k is CategoryKey => cats[k] !== 0,
  );
  const total = summary.totals[scenario];
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">By category</CardTitle>
        <CardDescription>What&apos;s in the pile, in {baseCurrency}.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-1">
        {rows.map((k) => {
          const v = cats[k];
          const pct = total !== 0 ? Math.abs((v / total) * 100) : 0;
          const isLiability = k === "loan";
          return (
            <div key={k} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span
                  className={
                    "flex items-center gap-2 " + (isLiability ? "text-destructive" : "")
                  }
                >
                  {CATEGORY_LABEL[k]}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {pct.toFixed(0)}%
                  </span>
                </span>
                <span
                  className={
                    "font-mono tabular-nums " + (v < 0 ? "text-destructive" : "")
                  }
                >
                  {formatMoney(v, baseCurrency)}
                </span>
              </div>
              <div className="h-1 rounded-full bg-secondary overflow-hidden">
                <div
                  className={isLiability ? "h-full bg-destructive" : "h-full bg-primary"}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function CurrencyBreakdown({
  scenario,
  summary,
  baseCurrency,
}: {
  scenario: Scenario;
  summary: ReturnType<typeof computeNetWorth> extends Promise<infer T> ? T : never;
  baseCurrency: string;
}) {
  const currencies = summary.byCurrency[scenario];
  const rows = Object.entries(currencies)
    .filter(([, v]) => v.inBase !== 0)
    .sort((a, b) => Math.abs(b[1].inBase) - Math.abs(a[1].inBase));
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, [, v]) => sum + Math.abs(v.inBase), 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="size-4 text-muted-foreground" />
          By currency
        </CardTitle>
        <CardDescription>
          Where your value lives, shown in each currency&apos;s own units.
          Percentages compare in {baseCurrency}.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
        {rows.map(([currency, bucket]) => {
          const pct = total > 0 ? (Math.abs(bucket.inBase) / total) * 100 : 0;
          const sameAsBase = currency === baseCurrency;
          return (
            <div key={currency} className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm">{currency}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-sm">
                {formatMoney(bucket.native, currency, { compact: true })}
              </div>
              {!sameAsBase ? (
                <div className="font-mono tabular-nums text-[10px] text-muted-foreground">
                  ≈ {formatMoney(bucket.inBase, baseCurrency, { compact: true })}
                </div>
              ) : null}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
