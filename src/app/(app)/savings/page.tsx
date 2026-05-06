import Link from "next/link";
import { PiggyBank, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddSavingsGoalDialog } from "@/components/app/add-savings-goal-dialog";
import { listAccounts, listSavingsGoals } from "@/lib/db/queries";
import { formatMoney } from "@/lib/format";
import {
  monthsToTarget,
  progressPct,
  projectedEndValue,
} from "@/lib/savings";

export default async function SavingsPage() {
  const [goals, accounts] = await Promise.all([
    listSavingsGoals({ includeArchived: true }),
    listAccounts(),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <>
      <PageHeader
        title="Savings goals"
        description="Set a target, a monthly contribution, and a length. See projected balance and your net worth at the end."
        actions={<AddSavingsGoalDialog accountOptions={accountOptions} />}
      />

      {active.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title="No savings goals yet"
          description="Goals are named, monthly-contributed savings targets — emergency fund, house deposit, vacation, anything."
          action={<AddSavingsGoalDialog accountOptions={accountOptions} />}
        />
      ) : (
        <div className="grid gap-3">
          {active.map((g) => {
            const pct = progressPct(g);
            const months = monthsToTarget(g);
            const endValue = projectedEndValue(g);
            return (
              <Link key={g.id} href={`/savings/${g.id}`} className="block group">
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardHeader className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          {g.category ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] uppercase tracking-wide"
                            >
                              {g.category}
                            </Badge>
                          ) : null}
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {g.currency}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            · {g.horizonMonths} mo · +
                            {formatMoney(g.monthlyContribution, g.currency, {
                              compact: true,
                            })}
                            /mo
                          </span>
                        </div>
                        <CardTitle className="text-base truncate">{g.name}</CardTitle>
                        <CardDescription className="text-xs font-mono">
                          {formatMoney(g.currentAmount, g.currency)}
                          {g.targetAmount != null
                            ? ` of ${formatMoney(g.targetAmount, g.currency)}`
                            : ""}
                          {g.targetAmount != null
                            ? ` · ends at ${formatMoney(endValue, g.currency, {
                                compact: true,
                              })}`
                            : ""}
                        </CardDescription>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1" />
                    </div>

                    {g.targetAmount != null ? (
                      <div className="mt-3 space-y-1.5">
                        <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                          <div
                            className={
                              pct >= 100
                                ? "h-full bg-emerald-400"
                                : "h-full bg-primary"
                            }
                            style={{ width: `${Math.min(100, pct)}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
                          <span>{pct.toFixed(0)}% saved</span>
                          <span>
                            {months == null
                              ? "→ never at this rate"
                              : months === 0
                                ? "→ target reached"
                                : `→ ~${months} mo to target`}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 ? (
        <div className="mt-10 space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Archived
          </h2>
          <div className="grid gap-2">
            {archived.map((g) => (
              <Link key={g.id} href={`/savings/${g.id}`} className="block">
                <Card className="opacity-60 hover:opacity-100 transition-opacity">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{g.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        archived
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {g.currency} ·{" "}
                      {formatMoney(g.currentAmount, g.currency, { compact: true })}
                      {g.targetAmount != null
                        ? ` of ${formatMoney(g.targetAmount, g.currency, { compact: true })}`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}
