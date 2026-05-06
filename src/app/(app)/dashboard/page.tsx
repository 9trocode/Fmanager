import { Wallet, Plus, Briefcase, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
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
import { getBaseCurrency } from "@/lib/db/queries";
import {
  computeNetWorth,
  computeCashRunway,
  computeBudgetStatus,
  CATEGORY_LABEL,
  CATEGORY_DISPLAY_ORDER,
  type CategoryKey,
} from "@/lib/aggregation";
import { RunwayCard } from "@/components/app/runway-card";
import {
  SCENARIOS,
  SCENARIO_LABEL,
  SCENARIO_DESCRIPTION,
  type Scenario,
} from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export default async function DashboardPage() {
  const baseCurrency = await getBaseCurrency();
  const [summary, runway, budgets] = await Promise.all([
    computeNetWorth(baseCurrency),
    computeCashRunway(baseCurrency),
    computeBudgetStatus(baseCurrency),
  ]);

  return (
    <>
      <PageHeader
        title="Net worth"
        description="The honest balance sheet — three scenarios, one base currency."
        actions={
          <>
            <AddAccountDialog
              trigger={
                <Button variant="outline" size="sm">
                  <Plus className="size-4" />
                  Add account
                </Button>
              }
            />
            <AddGrantDialog />
          </>
        }
      />

      {!summary.hasData ? (
        <EmptyState
          icon={Wallet}
          title="No data yet"
          description="Add your first account or equity grant to see your net worth across scenarios and currencies."
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

          {budgets.overBudget.length > 0 ? (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-4" />
                  Over budget this month
                </CardTitle>
                <CardDescription>
                  {budgets.overBudget.length === 1
                    ? "1 category"
                    : `${budgets.overBudget.length} categories`}{" "}
                  past the monthly limit.{" "}
                  <Link
                    href="/budgets"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Review budgets
                  </Link>
                  .
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0 flex flex-wrap gap-2">
                {budgets.overBudget.map((b) => (
                  <Badge
                    key={b.id}
                    variant="outline"
                    className="border-destructive/40 text-destructive font-mono text-[11px]"
                  >
                    {b.category} · +{(b.percentUsed - 100).toFixed(0)}%
                  </Badge>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {SCENARIOS.map((s) => (
            <TabsContent key={s} value={s} className="space-y-6">
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <ScenarioHero
                    scenario={s}
                    summary={summary}
                    baseCurrency={baseCurrency}
                  />
                </div>
                <RunwayCard runway={runway} />
              </div>
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

  return (
    <Card>
      <CardHeader>
        <CardDescription>{SCENARIO_DESCRIPTION[scenario]}</CardDescription>
        <CardTitle className="text-5xl font-semibold tracking-tight tabular-nums mt-2">
          {formatMoney(value, baseCurrency)}
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
                    "flex items-center gap-2 " +
                    (isLiability ? "text-destructive" : "")
                  }
                >
                  {CATEGORY_LABEL[k]}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {pct.toFixed(0)}%
                  </span>
                </span>
                <span
                  className={
                    "font-mono tabular-nums " +
                    (v < 0 ? "text-destructive" : "")
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
    .filter(([, v]) => v !== 0)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, [, v]) => sum + Math.abs(v), 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Briefcase className="size-4 text-muted-foreground" />
          By currency
        </CardTitle>
        <CardDescription>
          Where your value lives. Each row is converted into {baseCurrency} for comparison.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-1">
        {rows.map(([currency, value]) => {
          const pct = total > 0 ? (Math.abs(value) / total) * 100 : 0;
          return (
            <div key={currency} className="space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-sm">{currency}</span>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {pct.toFixed(0)}%
                </span>
              </div>
              <div className="font-mono tabular-nums text-sm">
                {formatMoney(value, baseCurrency, { compact: true })}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
