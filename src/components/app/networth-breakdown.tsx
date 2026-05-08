import Link from "next/link";
import { ArrowRight, ChevronRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getLatestSnapshot,
  listAccounts,
  listAccountTransactions,
} from "@/lib/db/queries";
import { formatMoney } from "@/lib/format";
import { isLiability } from "@/lib/account-types";

/**
 * Server-rendered breakdown of how the FLOOR net-worth number was
 * computed. For each non-archived account, shows:
 *   Latest snapshot value (date)
 *   ± transactions posted since that snapshot
 *   = current effective balance
 *
 * Liabilities (loan accounts) are signed negative in the total. Grants
 * contribute zero under the floor scenario, so they're omitted here —
 * the Liquid / Expected tabs render their own per-grant detail
 * elsewhere.
 *
 * This is the answer to "why am I seeing minus a hundred million with
 * zero explanation": every contributor is on screen, every transaction
 * count is clickable through to /transactions?account=<id>.
 */
export async function NetWorthBreakdown() {
  const accounts = await listAccounts();
  if (accounts.length === 0) return null;

  // Pull each account's latest snapshot + the list of transactions
  // since that snapshot date. Both queries are already indexed; the
  // total work here is bounded by the user's account count.
  const rows = await Promise.all(
    accounts.map(async (a) => {
      const latest = await getLatestSnapshot(a.id);
      // listAccountTransactions returns BOTH source AND destination
      // legs, ordered most-recent-first. Filter to those at-or-after
      // the snapshot date (snapshot wins on its own date — snapshot
      // captures end-of-day, so we ignore txs ON that date too).
      const txs = latest
        ? await listAccountTransactions(a.id)
        : await listAccountTransactions(a.id);
      const sinceTxs = latest
        ? txs.filter((t) => t.occurredAt > latest.asOf)
        : txs;
      let delta = 0;
      for (const t of sinceTxs) {
        if (t.accountId === a.id) {
          if (t.kind === "expense" || t.kind === "transfer") delta -= t.amount;
          else if (t.kind === "income") delta += t.amount;
        }
        if (t.destAccountId === a.id && t.kind === "transfer") {
          delta += t.amount;
        }
      }
      const latestValue = latest?.value ?? null;
      const effective = latestValue != null ? latestValue + delta : null;
      return {
        account: a,
        latest,
        delta,
        sinceCount: sinceTxs.length,
        effective,
      };
    }),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">How this is computed</CardTitle>
        <CardDescription>
          Latest snapshot per account, plus signed transactions posted
          since. Tap a row to see the transactions that moved the
          balance.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y divide-border">
          {rows.map((r) => {
            const a = r.account;
            const sign = isLiability(a.type) ? -1 : 1;
            const signedEffective =
              r.effective != null ? r.effective * sign : null;
            const accentClass =
              signedEffective == null
                ? "text-muted-foreground"
                : signedEffective > 0
                  ? "text-foreground"
                  : signedEffective < 0
                    ? "text-destructive"
                    : "text-muted-foreground";
            return (
              <li
                key={a.id}
                className="px-4 py-3 hover:bg-secondary/30 transition-colors"
              >
                <Link
                  href={`/accounts/${a.id}`}
                  className="flex items-center gap-3 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {a.name}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {a.type}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {a.currency}
                      </Badge>
                      {isLiability(a.type) ? (
                        <Badge variant="outline" className="text-[10px]">
                          liability
                        </Badge>
                      ) : null}
                    </div>
                    {r.latest ? (
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        snapshot {r.latest.asOf}:{" "}
                        {formatMoney(r.latest.value, a.currency, { compact: true })}
                        {r.sinceCount > 0 ? (
                          <>
                            {"  "}·{"  "}
                            <span
                              className={
                                r.delta > 0
                                  ? "text-emerald-500"
                                  : r.delta < 0
                                    ? "text-destructive"
                                    : ""
                              }
                            >
                              {r.delta > 0 ? "+" : ""}
                              {formatMoney(r.delta, a.currency, { compact: true })}
                            </span>{" "}
                            from {r.sinceCount}{" "}
                            {r.sinceCount === 1 ? "tx" : "txs"} since
                          </>
                        ) : (
                          <>{"  "}·{"  "}no txs since</>
                        )}
                      </div>
                    ) : (
                      <div className="text-[11px] font-mono text-muted-foreground mt-0.5">
                        no snapshot — add an opening balance to count this
                        account
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-mono tabular-nums text-sm ${accentClass}`}>
                      {r.effective != null
                        ? `${signedEffective! < 0 ? "−" : ""}${formatMoney(
                            Math.abs(r.effective),
                            a.currency,
                            { compact: true },
                          )}`
                        : "—"}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="px-4 py-3 border-t border-border bg-secondary/20">
          <Link
            href="/transactions"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            See every transaction <ArrowRight className="size-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
