import { Receipt } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddTransactionDialog } from "@/components/app/add-transaction-dialog";
import { TransactionsFilters } from "@/components/app/transactions-filters";
import { TransactionItem } from "@/components/app/transactions-list";
import {
  getBaseCurrency,
  listAccounts,
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

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    account?: string;
    category?: string;
    kind?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const sp = await searchParams;

  const accountIdParam = sp.account ? Number(sp.account) : undefined;
  const filter: TransactionFilter = {
    accountId:
      accountIdParam != null && Number.isFinite(accountIdParam)
        ? accountIdParam
        : undefined,
    category: sp.category || undefined,
    kind: parseKindParam(sp.kind),
    dateFrom: sp.from || undefined,
    dateTo: sp.to || undefined,
  };

  const [accounts, categories, transactions, baseCurrency] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listTransactionCategories(),
    listTransactions(filter),
    getBaseCurrency(),
  ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
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
          <AddTransactionDialog
            accounts={accountOptions}
            defaultAccountId={filter.accountId}
          />
        }
      />

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Income (range)</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-emerald-300">
              {formatMoney(incomeTotal, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Expenses (range)</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-destructive">
              {formatMoney(expenseTotal, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net (range)</CardDescription>
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
              <AddTransactionDialog accounts={accountOptions} />
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
