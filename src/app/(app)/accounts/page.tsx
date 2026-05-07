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
import { listAccountsWithEffective, listFlows } from "@/lib/db/queries";
import { ACCOUNT_TYPE_LABEL, isLiability } from "@/lib/account-types";
import { monthlyEquivalent } from "@/lib/flows";
import { formatMoney } from "@/lib/format";

type FlowSummary = {
  monthlyIncome: number;
  monthlyExpense: number;
  count: number;
  hasMixedCurrency: boolean;
};

export default async function AccountsPage() {
  const [accounts, flows] = await Promise.all([
    listAccountsWithEffective({ includeArchived: true }),
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

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Cash, brokerage, crypto, real estate. One row per account, snapshots track changes over time."
        actions={<AddAccountDialog />}
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
            const hasFlow =
              flow != null &&
              (flow.monthlyIncome > 0 ||
                flow.monthlyExpense > 0 ||
                flow.hasMixedCurrency);
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
                      {hasFlow ? (
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
