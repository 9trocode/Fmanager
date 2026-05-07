import { Receipt } from "lucide-react";
import Link from "next/link";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddTransactionDialog } from "@/components/app/add-transaction-dialog";
import { QuickAddReceiptDialog } from "@/components/app/quick-add-receipt-dialog";
import { QuickAddVoiceDialog } from "@/components/app/quick-add-voice-dialog";
import { TransactionsFilters } from "@/components/app/transactions-filters";
import { TransactionItem } from "@/components/app/transactions-list";
import {
  getBaseCurrency,
  listAccounts,
  listBudgets,
  listTransactionCategories,
  listTransactions,
  type TransactionFilter,
} from "@/lib/db/queries";
import { convert } from "@/lib/fx";
import { formatMoney } from "@/lib/format";
import type { TransactionKind } from "@/lib/db/schema";

const KIND_VALUES: TransactionKind[] = ["expense", "income", "transfer"];

function parseKindParam(raw: string | undefined): TransactionKind | undefined {
  if (!raw) return undefined;
  return KIND_VALUES.includes(raw as TransactionKind)
    ? (raw as TransactionKind)
    : undefined;
}

function monthLabel(iso: string): string {
  // iso = YYYY-MM-DD
  const [y, m] = iso.split("-");
  if (!y || !m) return iso;
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleString("en-US", { month: "long", year: "numeric" });
}

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function currentMonthBounds(): { start: string; end: string; label: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const start = new Date(y, m, 1).toISOString().slice(0, 10);
  const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
  const label = now.toLocaleString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

function buildHref(
  base: { account?: string; category?: string; kind?: string },
  range: { from?: string; to?: string; scope?: string },
): string {
  const params = new URLSearchParams();
  if (base.account) params.set("account", base.account);
  if (base.category) params.set("category", base.category);
  if (base.kind) params.set("kind", base.kind);
  if (range.from) params.set("from", range.from);
  if (range.to) params.set("to", range.to);
  if (range.scope) params.set("scope", range.scope);
  const qs = params.toString();
  return qs ? `/transactions?${qs}` : "/transactions";
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    category?: string;
    kind?: string;
    from?: string;
    to?: string;
    scope?: string;
  }>;
}) {
  const sp = await searchParams;
  const month = currentMonthBounds();

  // Default scope is "this month" so the totals reconcile with the home page.
  // Users can switch to All time (or set custom dates) explicitly.
  const userSetDates = Boolean(sp.from || sp.to);
  const scope = sp.scope === "all" ? "all" : userSetDates ? "custom" : "month";
  const effectiveFrom =
    scope === "month" ? month.start : sp.from || undefined;
  const effectiveTo = scope === "month" ? month.end : sp.to || undefined;

  const accountIdParam = sp.account ? Number(sp.account) : undefined;
  const filter: TransactionFilter = {
    accountId:
      accountIdParam != null && Number.isFinite(accountIdParam)
        ? accountIdParam
        : undefined,
    category: sp.category || undefined,
    kind: parseKindParam(sp.kind),
    dateFrom: effectiveFrom,
    dateTo: effectiveTo,
  };
  const baseLinkParams = {
    account: sp.account,
    category: sp.category,
    kind: sp.kind,
  };
  const rangeLabel =
    scope === "month"
      ? `Showing ${month.label}`
      : scope === "custom"
        ? `Showing ${effectiveFrom ?? "earliest"} → ${effectiveTo ?? "latest"}`
        : "Showing all time";

  const [accounts, categories, transactions, baseCurrency, budgetRows] =
    await Promise.all([
      listAccounts({ includeArchived: true }),
      listTransactionCategories(),
      listTransactions(filter),
      getBaseCurrency(),
      listBudgets(),
    ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));
  const budgetOptions = budgetRows.map((b) => ({
    id: b.id,
    category: b.category,
    currency: b.currency,
  }));

  // Compute totals in base currency for the filtered range.
  let incomeTotal = 0;
  let expenseTotal = 0;
  for (const t of transactions) {
    const inBase = await convert(t.amount, t.currency, baseCurrency);
    if (t.kind === "income") incomeTotal += inBase;
    else if (t.kind === "expense") expenseTotal += inBase;
    // Transfers are net-zero across accounts; ignore for the totals row.
  }
  const netTotal = incomeTotal - expenseTotal;

  // Group by month.
  const grouped = new Map<
    string,
    { label: string; rows: typeof transactions }
  >();
  for (const t of transactions) {
    const k = monthKey(t.occurredAt);
    if (!grouped.has(k)) {
      grouped.set(k, { label: monthLabel(t.occurredAt), rows: [] });
    }
    grouped.get(k)!.rows.push(t);
  }
  const groups = Array.from(grouped.entries()); // already in desc order from query

  return (
    <>
      <PageHeader
        title="Transactions"
        description="Logged transactions adjust the effective balance of each account on top of its latest snapshot. Use these for day-to-day moves between snapshots."
        actions={
          accountOptions.length > 0 ? (
            <>
              <QuickAddReceiptDialog accounts={accountOptions} />
              <QuickAddVoiceDialog accounts={accountOptions} />
              <AddTransactionDialog
                accounts={accountOptions}
                defaultAccountId={filter.accountId}
                budgets={budgetOptions}
              />
            </>
          ) : (
            <AddTransactionDialog
              accounts={accountOptions}
              defaultAccountId={filter.accountId}
              budgets={budgetOptions}
            />
          )
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="text-xs font-mono text-muted-foreground">
          {rangeLabel}
        </div>
        <div className="inline-flex rounded-lg border border-border p-1 gap-1">
          <Button
            asChild
            size="sm"
            variant={scope === "month" ? "secondary" : "ghost"}
          >
            <Link href={buildHref(baseLinkParams, {})}>This month</Link>
          </Button>
          <Button
            asChild
            size="sm"
            variant={scope === "all" ? "secondary" : "ghost"}
          >
            <Link href={buildHref(baseLinkParams, { scope: "all" })}>
              All time
            </Link>
          </Button>
          {scope === "custom" ? (
            <Button asChild size="sm" variant="secondary">
              <Link
                href={buildHref(baseLinkParams, {
                  from: effectiveFrom,
                  to: effectiveTo,
                })}
              >
                Custom
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Income</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-emerald-300">
              {formatMoney(incomeTotal, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expenses</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-destructive">
              {formatMoney(expenseTotal, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net</CardDescription>
            <CardTitle
              className={
                "text-2xl font-mono tabular-nums " +
                (netTotal >= 0 ? "text-emerald-300" : "text-destructive")
              }
            >
              {formatMoney(netTotal, baseCurrency, { signed: true })}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mb-6">
        <TransactionsFilters
          accounts={accountOptions}
          categories={categories}
          current={{
            accountId: filter.accountId,
            category: filter.category,
            kind: filter.kind,
            dateFrom: filter.dateFrom,
            dateTo: filter.dateTo,
          }}
        />
      </div>

      {transactions.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={
            accounts.length === 0
              ? "Add an account first"
              : "No transactions match these filters"
          }
          description={
            accounts.length === 0
              ? "Transactions are logged against accounts. Create one from the Accounts page first."
              : "Try clearing the filters, or log a transaction to get started."
          }
          action={
            accounts.length > 0 ? (
              <AddTransactionDialog
                accounts={accountOptions}
                budgets={budgetOptions}
              />
            ) : null
          }
        />
      ) : (
        <div className="space-y-8">
          {groups.map(([key, group]) => (
            <section key={key} className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.label}
              </h2>
              <div className="space-y-2">
                {group.rows.map((t) => (
                  <TransactionItem
                    key={t.id}
                    transaction={t}
                    accounts={accountOptions}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
