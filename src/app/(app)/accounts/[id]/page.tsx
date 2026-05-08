import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Archive,
  ArchiveRestore,
  ArrowDownRight,
  ArrowUpRight,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/app/page-header";
import { EditAccountDialog } from "@/components/app/edit-account-dialog";
import { AddSnapshotDialog } from "@/components/app/add-snapshot-dialog";
import { AddTransactionDialog } from "@/components/app/add-transaction-dialog";
import { TransactionItem } from "@/components/app/transactions-list";
import {
  getAccount,
  getEffectiveBalance,
  listAccountFlows,
  listAccountTransactions,
  listAccounts,
  listSnapshots,
} from "@/lib/db/queries";
import {
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  deleteSnapshot,
} from "@/lib/actions/accounts";
import { ACCOUNT_TYPE_LABEL, isLiability } from "@/lib/account-types";
import { FLOW_CADENCE_LABEL, monthlyEquivalent } from "@/lib/flows";
import { formatMoney } from "@/lib/format";
import { convert } from "@/lib/fx";

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();

  const account = await getAccount(id);
  if (!account) notFound();

  const [snapshots, txs, allAccounts, effective, flows] = await Promise.all([
    listSnapshots(id),
    listAccountTransactions(id, 50),
    listAccounts({ includeArchived: true }),
    getEffectiveBalance(id),
    listAccountFlows(id),
  ]);

  // Aggregate the recurring flows linked to this account into per-month
  // numbers so the header can show "this account brings in $X / mo".
  // Flows whose currency differs from the account currency are still listed
  // but the monthly net only sums same-currency flows to avoid silent FX
  // surprises on a single-account view.
  let monthlyIncomeSameCcy = 0;
  let monthlyExpenseSameCcy = 0;
  let hasMixedCurrency = false;
  for (const f of flows) {
    const m = monthlyEquivalent(f.amount, f.cadence);
    if (f.currency !== account.currency) {
      hasMixedCurrency = true;
      continue;
    }
    if (f.kind === "income") monthlyIncomeSameCcy += m;
    else monthlyExpenseSameCcy += m;
  }
  const monthlyNet = monthlyIncomeSameCcy - monthlyExpenseSameCcy;
  const latest = snapshots[0];
  const liability = isLiability(account.type);

  const accountOptions = allAccounts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
  }));

  // Lookup so transaction rows can surface a "from {flow name}" badge
  // when their flowId matches one of THIS account's recurring flows.
  // Makes the relationship between a flow (template) and its
  // auto-posted transactions (actual events) visually unambiguous —
  // they're not duplicate entries, they're the realization of the
  // same scheduled charge.
  const flowsById = new Map<
    number,
    { name: string; kind: "income" | "expense" }
  >(flows.map((f) => [f.id, { name: f.name, kind: f.kind }]));

  const displayValue =
    effective.effectiveValue ?? latest?.value ?? null;

  // Per-transaction derivation. For every tx posted strictly AFTER
  // the latest snapshot date that touches this account (as source or
  // destination), compute its signed contribution in the account's
  // currency. If the tx was in another currency, FX-convert with the
  // current cached rate and surface that fact so the user can spot
  // misconfigured flows. Same-day-as-snapshot txs are skipped to
  // match the engine's "snapshot wins on its own date" rule.
  type DerivationRow = {
    id: number;
    occurredAt: string;
    kind: string;
    nativeAmount: number;
    nativeCurrency: string;
    contribution: number;
    isCrossCurrency: boolean;
    notes: string | null;
    category: string | null;
  };
  let derivationRows: DerivationRow[] = [];
  if (latest) {
    const sinceTxs = txs.filter((t) => t.occurredAt > latest.asOf);
    derivationRows = await Promise.all(
      sinceTxs.map(async (t) => {
        const isSource = t.accountId === id;
        const isDest = t.destAccountId === id && t.kind === "transfer";
        const sign = isSource
          ? t.kind === "expense" || t.kind === "transfer"
            ? -1
            : t.kind === "income"
              ? 1
              : 0
          : isDest
            ? 1
            : 0;
        const isCrossCurrency = t.currency !== account.currency;
        const inAccount = isCrossCurrency
          ? await convert(t.amount, t.currency, account.currency)
          : t.amount;
        return {
          id: t.id,
          occurredAt: t.occurredAt,
          kind: t.kind,
          nativeAmount: t.amount,
          nativeCurrency: t.currency,
          contribution: sign * inAccount,
          isCrossCurrency,
          notes: t.notes,
          category: t.category,
        };
      }),
    );
  }
  // Same-day skipped count — these don't show in the running total
  // but should be flagged so the user knows their salary on the
  // snapshot date isn't silently being eaten.
  const sameDaySkipCount = latest
    ? txs.filter((t) => t.occurredAt === latest.asOf).length
    : 0;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/accounts">
            <ArrowLeft className="size-4" />
            All accounts
          </Link>
        </Button>
      </div>

      <PageHeader
        title={account.name}
        description={
          account.institution
            ? `${ACCOUNT_TYPE_LABEL[account.type]} · ${account.currency} · ${account.institution}`
            : `${ACCOUNT_TYPE_LABEL[account.type]} · ${account.currency}`
        }
        actions={
          <>
            <EditAccountDialog account={account} />
            {account.archived ? (
              <form action={unarchiveAccount}>
                <input type="hidden" name="id" value={account.id} />
                <Button type="submit" variant="outline" size="sm">
                  <ArchiveRestore className="size-4" />
                  Unarchive
                </Button>
              </form>
            ) : (
              <form action={archiveAccount}>
                <input type="hidden" name="id" value={account.id} />
                <Button type="submit" variant="outline" size="sm">
                  <Archive className="size-4" />
                  Archive
                </Button>
              </form>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this account?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Removes the account and all its snapshots. Permanent. Archive instead
                    if you want to keep history.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <form action={deleteAccount}>
                    <input type="hidden" name="id" value={account.id} />
                    <AlertDialogAction
                      type="submit"
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </form>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid md:grid-cols-3 gap-6">
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardDescription>Current balance</CardDescription>
              {account.archived ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            <CardTitle
              className={
                "text-4xl font-semibold tracking-tight tabular-nums mt-2 " +
                (liability ? "text-destructive" : "")
              }
            >
              {displayValue != null
                ? formatMoney(
                    liability ? -displayValue : displayValue,
                    account.currency,
                  )
                : "—"}
            </CardTitle>
            {latest ? (
              <CardDescription className="font-mono">
                effective · snapshot {formatMoney(
                  liability ? -latest.value : latest.value,
                  account.currency,
                )}{" "}
                as of {latest.asOf}
                {effective.effectiveValue != null &&
                effective.effectiveValue !== latest.value
                  ? " + transactions since"
                  : ""}
              </CardDescription>
            ) : null}
            {flows.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                {monthlyIncomeSameCcy > 0 ? (
                  <span className="font-mono tabular-nums text-emerald-300">
                    + {formatMoney(monthlyIncomeSameCcy, account.currency)} /
                    mo income
                  </span>
                ) : null}
                {monthlyExpenseSameCcy > 0 ? (
                  <span className="font-mono tabular-nums text-destructive">
                    − {formatMoney(monthlyExpenseSameCcy, account.currency)} /
                    mo expenses
                  </span>
                ) : null}
                {(monthlyIncomeSameCcy > 0 || monthlyExpenseSameCcy > 0) ? (
                  <span
                    className={
                      "font-mono tabular-nums " +
                      (monthlyNet >= 0 ? "text-foreground" : "text-destructive")
                    }
                  >
                    net{" "}
                    {formatMoney(monthlyNet, account.currency, {
                      signed: true,
                    })}{" "}
                    / mo
                  </span>
                ) : null}
                {hasMixedCurrency ? (
                  <span className="text-muted-foreground">
                    · some flows in other currencies — see list below
                  </span>
                ) : null}
              </div>
            ) : null}
          </CardHeader>
          {account.notes ? (
            <CardContent className="border-t border-border pt-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {account.notes}
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Snapshots</CardTitle>
            <CardDescription>{snapshots.length} entries</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <AddSnapshotDialog accountId={account.id} currency={account.currency} />
            <p className="text-xs text-muted-foreground">
              The latest snapshot drives net worth. Older entries are kept for history.
            </p>
          </CardContent>
        </Card>
      </div>

      {/*
        Balance derivation. Spelled out math from snapshot → effective
        balance. The user gets to see exactly which transactions
        contributed and at what rate (when FX-converted), so a
        suspicious balance never has to be a mystery.
      */}
      {latest && derivationRows.length > 0 ? (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">How this is computed</CardTitle>
            <CardDescription>
              Snapshot value plus every transaction posted since.
              Cross-currency transactions are FX-converted into{" "}
              <span className="font-mono">{account.currency}</span> at
              today&apos;s cached rate.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 py-2.5 border-t border-border bg-secondary/20 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                Snapshot {latest.asOf}
              </span>
              <span className="font-mono tabular-nums">
                {formatMoney(latest.value, account.currency)}
              </span>
            </div>
            <ul className="divide-y divide-border/60">
              {derivationRows.map((r) => (
                <li
                  key={r.id}
                  className="px-4 py-2 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-muted-foreground">
                        {r.occurredAt}
                      </span>
                      <span className="capitalize">{r.kind}</span>
                      {r.category ? (
                        <Badge variant="secondary" className="text-[10px]">
                          {r.category}
                        </Badge>
                      ) : null}
                      {r.isCrossCurrency ? (
                        <Badge
                          variant="outline"
                          className="text-[10px] border-amber-500/40 text-amber-300"
                        >
                          {r.nativeCurrency} → {account.currency}
                        </Badge>
                      ) : null}
                    </div>
                    {r.notes ? (
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {r.notes}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right shrink-0">
                    {r.isCrossCurrency ? (
                      <div className="text-[10px] text-muted-foreground/80 font-mono">
                        {r.kind === "expense" || r.kind === "transfer"
                          ? "−"
                          : "+"}
                        {formatMoney(r.nativeAmount, r.nativeCurrency, {
                          compact: true,
                        })}
                      </div>
                    ) : null}
                    <div
                      className={
                        "font-mono tabular-nums " +
                        (r.contribution > 0
                          ? "text-emerald-400"
                          : r.contribution < 0
                            ? "text-destructive"
                            : "text-muted-foreground")
                      }
                    >
                      {r.contribution > 0 ? "+" : ""}
                      {formatMoney(r.contribution, account.currency)}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <div className="px-4 py-2.5 border-t border-border bg-secondary/30 flex items-center justify-between text-sm font-medium">
              <span>Effective balance</span>
              <span
                className={
                  "font-mono tabular-nums " +
                  ((displayValue ?? 0) < 0 ? "text-destructive" : "")
                }
              >
                {displayValue != null
                  ? formatMoney(displayValue, account.currency)
                  : "—"}
              </span>
            </div>
            {sameDaySkipCount > 0 ? (
              <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
                {sameDaySkipCount}{" "}
                {sameDaySkipCount === 1 ? "transaction" : "transactions"} on
                the snapshot date ({latest.asOf}) were intentionally
                skipped — the snapshot wins on its own date. To include
                them, set the snapshot date one day earlier.
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Repeat className="size-4 text-muted-foreground" />
              Recurring flows
            </CardTitle>
            <CardDescription>
              {flows.length === 0
                ? "No recurring flows are linked to this account yet."
                : `${flows.length} ${flows.length === 1 ? "schedule" : "schedules"} that auto-post transactions to this account on each cadence. Look for the “from {flow}” badge on the transactions list to see which transaction came from which schedule.`}
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/cash-flow">
              <Repeat className="size-4" />
              Manage cash flow
            </Link>
          </Button>
        </CardHeader>
        {flows.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Add a recurring inflow (e.g. salary) or outflow (e.g. rent) on
              the{" "}
              <Link
                href="/cash-flow"
                className="underline underline-offset-3 hover:text-foreground"
              >
                cash flow page
              </Link>{" "}
              and pick this account — it&apos;ll show up here with the monthly
              equivalent rolled into the balance summary above.
            </p>
          </CardContent>
        ) : (
          <CardContent className="space-y-2">
            {flows.map((f) => {
              const isIncome = f.kind === "income";
              const monthly = monthlyEquivalent(f.amount, f.cadence);
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-md border border-border hover:bg-secondary/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={
                        "size-8 rounded-md grid place-items-center shrink-0 " +
                        (isIncome
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-destructive/15 text-destructive")
                      }
                    >
                      {isIncome ? (
                        <ArrowUpRight className="size-4" />
                      ) : (
                        <ArrowDownRight className="size-4" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{f.name}</span>
                        {f.category ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {f.category}
                          </Badge>
                        ) : null}
                        <span className="text-[10px] font-mono text-muted-foreground">
                          {FLOW_CADENCE_LABEL[f.cadence].toLowerCase()}
                        </span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Schedule — posts a transaction
                        {f.nextDueAt
                          ? ` next on ${f.nextDueAt}`
                          : f.lastPostedAt
                            ? ` (last posted ${f.lastPostedAt})`
                            : " on its cadence"}
                        .
                      </div>
                      {f.notes ? (
                        <div className="text-xs text-muted-foreground truncate">
                          {f.notes}
                        </div>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={
                        "font-mono tabular-nums text-sm " +
                        (isIncome ? "text-emerald-300" : "")
                      }
                    >
                      {isIncome ? "+" : "−"}
                      {formatMoney(f.amount, f.currency)}
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">
                      ≈ {isIncome ? "+" : "−"}
                      {formatMoney(monthly, f.currency)} / mo
                    </div>
                  </div>
                </div>
              );
            })}
          </CardContent>
        )}
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {snapshots.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              No snapshots yet.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>As of</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Δ vs prev</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapshots.map((s, i) => {
                  const prev = snapshots[i + 1];
                  const delta = prev ? s.value - prev.value : null;
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">{s.asOf}</TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatMoney(
                          liability ? -s.value : s.value,
                          account.currency,
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                        {delta == null
                          ? "—"
                          : formatMoney(delta, account.currency, { signed: true })}
                      </TableCell>
                      <TableCell>
                        <form action={deleteSnapshot}>
                          <input type="hidden" name="id" value={s.id} />
                          <input type="hidden" name="account_id" value={account.id} />
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
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AccountDetailsCard account={account} />

      <Card className="mt-6">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Transactions</CardTitle>
            <CardDescription>
              {txs.length === 0
                ? "No transactions logged yet."
                : `${txs.length} most recent`}
            </CardDescription>
          </div>
          <AddTransactionDialog
            accounts={accountOptions}
            defaultAccountId={account.id}
          />
        </CardHeader>
        {txs.length === 0 ? (
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Log expenses, income, or transfers to update the effective
              balance between snapshots.
            </p>
          </CardContent>
        ) : (
          <CardContent className="space-y-2">
            {txs.map((t) => (
              <TransactionItem
                key={t.id}
                transaction={t}
                accounts={accountOptions}
                contextAccountId={account.id}
                flowsById={flowsById}
              />
            ))}
          </CardContent>
        )}
      </Card>
    </>
  );
}

type AccountWithDetails = {
  accountNumber: string | null;
  routingOrIban: string | null;
  swiftBic: string | null;
  holderName: string | null;
  branch: string | null;
  loginUrl: string | null;
  contactPhone: string | null;
  statementsUrl: string | null;
  institution: string | null;
};

function AccountDetailsCard({ account }: { account: AccountWithDetails }) {
  const rows: Array<{ label: string; value: string | null; href?: string }> = [
    { label: "Account holder", value: account.holderName },
    { label: "Institution", value: account.institution },
    { label: "Account number", value: account.accountNumber },
    { label: "IBAN / routing", value: account.routingOrIban },
    { label: "SWIFT / BIC", value: account.swiftBic },
    { label: "Branch", value: account.branch },
    {
      label: "Support phone",
      value: account.contactPhone,
      href: account.contactPhone ? `tel:${account.contactPhone}` : undefined,
    },
    {
      label: "Login",
      value: account.loginUrl,
      href: account.loginUrl ?? undefined,
    },
    {
      label: "Statements",
      value: account.statementsUrl,
      href: account.statementsUrl ?? undefined,
    },
  ];
  const filled = rows.filter((r) => r.value);
  if (filled.length === 0) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Bank details</CardTitle>
        <CardDescription>
          Stored locally in your SQLite database. Edit on this account to add or change.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
        {filled.map((r) => (
          <div key={r.label} className="space-y-0.5 min-w-0">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {r.label}
            </div>
            {r.href ? (
              <a
                href={r.href}
                target={r.href.startsWith("http") ? "_blank" : undefined}
                rel={r.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="font-mono tabular-nums text-foreground hover:underline truncate block"
              >
                {r.value}
              </a>
            ) : (
              <div className="font-mono tabular-nums truncate">{r.value}</div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
