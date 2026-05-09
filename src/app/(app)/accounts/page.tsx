import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  ChevronRight,
  Wallet,
} from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddAccountDialog } from "@/components/app/add-account-dialog";
import {
  listAccountsWithEffective,
  listFlows,
  listTransactionsBetween,
} from "@/lib/db/queries";
import { convert } from "@/lib/fx";
import { ACCOUNT_TYPE_LABEL, isLiability } from "@/lib/account-types";
import { monthlyEquivalent } from "@/lib/flows";
import { formatMoney } from "@/lib/format";
import { resolveMonthKey } from "@/lib/month-filter";

type FlowSummary = {
  monthlyIncome: number;
  monthlyExpense: number;
  count: number;
  hasMixedCurrency: boolean;
};

type ActualSummary = {
  in: number;
  out: number;
  net: number;
  count: number;
};

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function endOfMonthYmd(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m, 0);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function monthLabelFromKey(monthKey: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!m) return monthKey;
  const date = new Date(Number(m[1]), Number(m[2]) - 1, 1);
  return date.toLocaleString("en-US", { month: "long", year: "numeric" });
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const params = await searchParams;
  const selectedMonth = await resolveMonthKey(params.m);
  const isPastMonth =
    selectedMonth != null && selectedMonth !== currentMonthKey();
  const asOfDate = isPastMonth ? endOfMonthYmd(selectedMonth!) : undefined;

  const [accounts, flows] = await Promise.all([
    listAccountsWithEffective({ includeArchived: true, asOfDate }),
    listFlows(),
  ]);
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  // Roll recurring flows up by account so each row can show a
  // "+ $X / mo income" or "− $Y / mo expenses" hint without needing to
  // navigate into the account. Cross-currency flows are listed only as a
  // count + caveat — we don't FX-convert here to keep the per-row math
  // honest with whatever currency the account is denominated in.
  const flowByAccount = new Map<number, FlowSummary>();
  for (const f of flows) {
    if (f.accountId == null) continue;
    const acct = accounts.find((a) => a.id === f.accountId);
    if (!acct) continue;
    const m = monthlyEquivalent(f.amount, f.cadence);
    const existing = flowByAccount.get(f.accountId) ?? {
      monthlyIncome: 0,
      monthlyExpense: 0,
      count: 0,
      hasMixedCurrency: false,
    };
    existing.count += 1;
    if (f.currency !== acct.currency) {
      existing.hasMixedCurrency = true;
    } else if (f.kind === "income") {
      existing.monthlyIncome += m;
    } else {
      existing.monthlyExpense += m;
    }
    flowByAccount.set(f.accountId, existing);
  }

  // For past-month views, the recurring-flow projection is misleading
  // — it answers "what does my setup expect every month" rather than
  // "what actually moved this month". So when filtered to a past
  // month, build a parallel actuals-from-transactions rollup per
  // account, in account currency (FX-converted when needed). Render
  // chooses one or the other below.
  const actualByAccount = new Map<number, ActualSummary>();
  if (isPastMonth) {
    const [yStr, mStr] = selectedMonth!.split("-");
    const startDate = `${yStr}-${mStr}-01`;
    const endDate = asOfDate!;
    const txsInMonth = await listTransactionsBetween(startDate, endDate);
    for (const t of txsInMonth) {
      const source = accounts.find((a) => a.id === t.accountId);
      const dest =
        t.destAccountId != null
          ? accounts.find((a) => a.id === t.destAccountId)
          : null;
      if (source) {
        const amt =
          t.currency === source.currency
            ? t.amount
            : await convert(t.amount, t.currency, source.currency);
        const s = actualByAccount.get(source.id) ?? {
          in: 0,
          out: 0,
          net: 0,
          count: 0,
        };
        if (t.kind === "income") s.in += amt;
        else if (t.kind === "expense" || t.kind === "transfer")
          s.out += amt;
        s.net = s.in - s.out;
        s.count += 1;
        actualByAccount.set(source.id, s);
      }
      if (dest && t.kind === "transfer") {
        const amt =
          t.currency === dest.currency
            ? t.amount
            : await convert(t.amount, t.currency, dest.currency);
        const d = actualByAccount.get(dest.id) ?? {
          in: 0,
          out: 0,
          net: 0,
          count: 0,
        };
        d.in += amt;
        d.net = d.in - d.out;
        d.count += 1;
        actualByAccount.set(dest.id, d);
      }
    }
  }

  return (
    <>
      <PageHeader
        title="Accounts"
        description={
          isPastMonth
            ? `Balances as of ${asOfDate} (end of ${monthLabelFromKey(selectedMonth!)}). Latest snapshot at or before that date plus signed transactions through it. Switch back to the current month in the sidebar for live balances.`
            : "Cash, brokerage, crypto, real estate. One row per account, snapshots track changes over time."
        }
        actions={
          <>
            {isPastMonth ? (
              <Badge variant="secondary" className="font-mono text-[11px]">
                as of {asOfDate}
              </Badge>
            ) : null}
            <AddAccountDialog />
          </>
        }
      />

      {active.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account. Each one holds a balance in a single currency."
          action={<AddAccountDialog />}
        />
      ) : (
        <div className="grid gap-3">
          {active.map((a) => {
            const flow = flowByAccount.get(a.id);
            const actual = actualByAccount.get(a.id);
            const hasFlow =
              flow != null &&
              (flow.monthlyIncome > 0 ||
                flow.monthlyExpense > 0 ||
                flow.hasMixedCurrency);
            const hasActual =
              actual != null && (actual.in > 0 || actual.out > 0);
            const net = flow
              ? flow.monthlyIncome - flow.monthlyExpense
              : 0;
            return (
              <Link
                key={a.id}
                href={`/accounts/${a.id}`}
                className="block group"
              >
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardHeader className="flex flex-row items-center justify-between gap-4 py-4">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                          {ACCOUNT_TYPE_LABEL[a.type]}
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">
                          {a.currency}
                        </span>
                        {a.institution ? (
                          <span className="text-[11px] text-muted-foreground">
                            · {a.institution}
                          </span>
                        ) : null}
                      </div>
                      <CardTitle className="text-base truncate">{a.name}</CardTitle>
                      {isPastMonth ? (
                        // Past-month view — show ACTUALS for the
                        // selected month, sourced from transactions
                        // on this account, FX-converted into the
                        // account currency.
                        hasActual ? (
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono">
                            {actual.in > 0 ? (
                              <span className="inline-flex items-center gap-1 text-emerald-300">
                                <ArrowUpRight className="size-3" />+
                                {formatMoney(actual.in, a.currency)} in
                              </span>
                            ) : null}
                            {actual.out > 0 ? (
                              <span className="inline-flex items-center gap-1 text-destructive">
                                <ArrowDownRight className="size-3" />−
                                {formatMoney(actual.out, a.currency)} out
                              </span>
                            ) : null}
                            {actual.in > 0 && actual.out > 0 ? (
                              <span
                                className={
                                  "tabular-nums " +
                                  (actual.net >= 0
                                    ? "text-muted-foreground"
                                    : "text-destructive")
                                }
                              >
                                net{" "}
                                {formatMoney(actual.net, a.currency, {
                                  signed: true,
                                })}
                              </span>
                            ) : null}
                            <span className="text-muted-foreground">
                              · {actual.count}{" "}
                              {actual.count === 1 ? "tx" : "txs"} in{" "}
                              {monthLabelFromKey(selectedMonth!)}
                            </span>
                          </div>
                        ) : (
                          <div className="text-[11px] font-mono text-muted-foreground">
                            no transactions in{" "}
                            {monthLabelFromKey(selectedMonth!)}
                          </div>
                        )
                      ) : hasFlow ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] font-mono">
                          {flow.monthlyIncome > 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <ArrowUpRight className="size-3" />+
                              {formatMoney(flow.monthlyIncome, a.currency)} / mo
                            </span>
                          ) : null}
                          {flow.monthlyExpense > 0 ? (
                            <span className="inline-flex items-center gap-1 text-destructive">
                              <ArrowDownRight className="size-3" />−
                              {formatMoney(flow.monthlyExpense, a.currency)} / mo
                            </span>
                          ) : null}
                          {flow.monthlyIncome > 0 &&
                          flow.monthlyExpense > 0 ? (
                            <span
                              className={
                                "tabular-nums " +
                                (net >= 0
                                  ? "text-muted-foreground"
                                  : "text-destructive")
                              }
                            >
                              net{" "}
                              {formatMoney(net, a.currency, { signed: true })}{" "}
                              / mo
                            </span>
                          ) : null}
                          {flow.hasMixedCurrency ? (
                            <span className="text-muted-foreground">
                              · other-currency flows attached
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div
                          className={
                            "font-mono tabular-nums text-base " +
                            (isLiability(a.type) ? "text-destructive" : "")
                          }
                        >
                          {a.effectiveValue == null
                            ? "—"
                            : formatMoney(
                                isLiability(a.type) ? -a.effectiveValue : a.effectiveValue,
                                a.currency,
                              )}
                        </div>
                        {a.latestAsOf ? (
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {a.latestAsOf}
                          </div>
                        ) : null}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground" />
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {archived.length > 0 ? (
        <div className="mt-10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
              Archived
            </h2>
          </div>
          <div className="grid gap-2">
            {archived.map((a) => (
              <Link key={a.id} href={`/accounts/${a.id}`} className="block">
                <Card className="opacity-60 hover:opacity-100 transition-opacity">
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <span>{a.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        archived
                      </Badge>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {ACCOUNT_TYPE_LABEL[a.type]} · {a.currency}
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
