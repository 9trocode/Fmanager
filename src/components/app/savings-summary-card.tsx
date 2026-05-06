import Link from "next/link";
import { ArrowRight, PiggyBank } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMoney } from "@/lib/format";
import { progressPct } from "@/lib/savings";

type Goal = {
  id: number;
  name: string;
  category: string | null;
  targetAmount: number | null;
  currentAmount: number;
  currency: string;
  monthlyContribution: number;
  expectedReturnPct: number;
  horizonMonths: number;
};

export function SavingsSummaryCard({ goals }: { goals: Goal[] }) {
  const top = [...goals]
    .filter((g) => g.targetAmount != null)
    .sort((a, b) => progressPct(b) - progressPct(a))
    .slice(0, 3);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <PiggyBank className="size-4 text-muted-foreground" />
              Savings goals
            </CardTitle>
            <CardDescription>
              {goals.length === 0
                ? "Set targets, see progress."
                : `${goals.length} active`}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs shrink-0">
            <Link href="/savings">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {top.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No goals yet.{" "}
            <Link href="/savings" className="underline hover:text-foreground">
              Add one
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-3">
            {top.map((g) => {
              const pct = progressPct(g);
              return (
                <Link
                  key={g.id}
                  href={`/savings/${g.id}`}
                  className="block px-1 py-1.5 rounded-md hover:bg-secondary/50 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium truncate">{g.name}</span>
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {pct.toFixed(0)}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className={pct >= 100 ? "h-full bg-emerald-400" : "h-full bg-primary"}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <div className="text-[10px] text-muted-foreground font-mono">
                      {formatMoney(g.currentAmount, g.currency, { compact: true })}{" "}
                      of {formatMoney(g.targetAmount ?? 0, g.currency, { compact: true })}{" "}
                      · +{formatMoney(g.monthlyContribution, g.currency, { compact: true })}
                      /mo
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
