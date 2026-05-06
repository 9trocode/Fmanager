import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { and, eq, gte, lte } from "drizzle-orm";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/app/page-header";
import { LogSpendDialog } from "@/components/app/log-spend-dialog";
import { db, schema } from "@/lib/db";
import { listAccounts } from "@/lib/db/queries";
import { computeBudgetStatus } from "@/lib/aggregation";
import { deleteTransaction } from "@/lib/actions/transactions";
import { formatMoney } from "@/lib/format";

function monthBounds(): { start: string; end: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1);
  const end = new Date(y, m + 1, 0);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function barClass(p: number): string {
  if (p > 100) return "bg-destructive";
  if (p >= 80) return "bg-amber-500";
  return "bg-emerald-500";
}

export default async function BudgetDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const rows = await db
    .select()
    .from(schema.budgets)
    .where(eq(schema.budgets.id, id))
    .limit(1);
  const budget = rows[0];
  if (!budget) notFound();

  const { start, end } = monthBounds();

  const [accounts, summary, monthTxs] = await Promise.all([
    listAccounts(),
    computeBudgetStatus(budget.currency),
    db
      .select()
      .from(schema.transactions)
      .where(
        and(
          eq(schema.transactions.kind, "expense"),
          eq(schema.transactions.category, budget.category),
          gte(schema.transactions.occurredAt, start),
          lte(schema.transactions.occurredAt, end),
        ),
      ),
  ]);

  const status = summary.rows.find((r) => r.id === budget.id);
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));
  const accountNameById = new Map(accounts.map((a) => [a.id, a.name]));

  const spent = status?.spentThisMonth ?? 0;
  const limit = budget.monthlyLimit;
  const pct = limit > 0 ? (spent / limit) * 100 : 0;
  const remaining = limit - spent;
  const widthPct = Math.min(100, Math.max(0, pct));

  const sortedTxs = [...monthTxs].sort((a, b) =>
    a.occurredAt < b.occurredAt ? 1 : -1,
  );

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/budgets">
            <ArrowLeft className="size-4" />
            All budgets
          </Link>
        </Button>
      </div>

      <PageHeader
        title={budget.category}
        description={`Monthly budget · ${budget.currency} · resets each calendar month.`}
        actions={
          <LogSpendDialog
            category={budget.category}
            currency={budget.currency}
            accountOptions={accountOptions}
          />
        }
      />

      <Card className="mb-6">
        <CardHeader>
          <CardDescription>This month</CardDescription>
          <CardTitle
            className={
              "text-3xl font-semibold tabular-nums mt-1 " +
              (pct > 100 ? "text-destructive" : "")
            }
          >
            {formatMoney(spent, budget.currency)}{" "}
            <span className="text-base text-muted-foreground font-normal">
              of {formatMoney(limit, budget.currency)}
            </span>
          </CardTitle>
          <div className="mt-3 space-y-1.5">
            <div className="h-2 rounded-full bg-secondary overflow-hidden">
              <div className={"h-full " + barClass(pct)} style={{ width: `${widthPct}%` }} />
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground font-mono">
              <span>{pct.toFixed(0)}% used</span>
              <span
                className={
                  remaining < 0 ? "text-destructive" : "text-muted-foreground"
                }
              >
                {remaining < 0
                  ? `${formatMoney(Math.abs(remaining), budget.currency)} over`
                  : `${formatMoney(remaining, budget.currency)} left`}
              </span>
            </div>
          </div>
        </CardHeader>
        {budget.notes ? (
          <CardContent className="border-t border-border pt-4 text-sm text-muted-foreground whitespace-pre-wrap">
            {budget.notes}
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Spend this month</CardTitle>
          <CardDescription>
            {sortedTxs.length} transaction{sortedTxs.length === 1 ? "" : "s"}{" "}
            tagged <span className="font-mono">{budget.category}</span> in{" "}
            {start}—{end}.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {sortedTxs.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No spending logged for this category this month. Click{" "}
              <span className="font-mono">Log spend</span> to add one.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedTxs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">
                      {t.occurredAt}
                    </TableCell>
                    <TableCell className="text-sm">
                      {accountNameById.get(t.accountId) ?? `#${t.accountId}`}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground truncate max-w-[200px]">
                      {t.notes ?? "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatMoney(t.amount, t.currency)}
                    </TableCell>
                    <TableCell>
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button
                          type="submit"
                          variant="ghost"
                          size="icon"
                          className="size-7 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
