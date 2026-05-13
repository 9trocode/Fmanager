import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDownRight, ArrowLeftRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMoney } from "@/lib/format";
import type { TransactionKind } from "@/lib/db/schema";

type Tx = {
  id: number;
  accountId: number;
  destAccountId: number | null;
  kind: TransactionKind;
  amount: number;
  currency: string;
  category: string | null;
  occurredAt: string;
  notes: string | null;
};

function KindIcon({ kind }: { kind: TransactionKind }) {
  if (kind === "income")
    return <ArrowUpRight className="size-3.5 text-emerald-300" />;
  if (kind === "expense")
    return <ArrowDownRight className="size-3.5 text-destructive" />;
  return <ArrowLeftRight className="size-3.5 text-muted-foreground" />;
}

export function RecentTransactionsCard({
  txs,
  accountNameById,
  monthLabel = null,
}: {
  txs: Tx[];
  accountNameById: Map<number, string>;
  /** When set, the card scopes its copy to that month (label string). */
  monthLabel?: string | null;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-base">Recent transactions</CardTitle>
            <CardDescription>
              {monthLabel
                ? txs.length === 0
                  ? `No transactions in ${monthLabel} yet.`
                  : `${txs.length} entr${txs.length === 1 ? "y" : "ies"} in ${monthLabel}.`
                : `Your latest ${txs.length} entries.`}
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm" className="text-xs shrink-0">
            <Link href="/transactions">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-1 pt-0">
        {txs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {monthLabel
              ? `Nothing posted in ${monthLabel}. Switch months from the sidebar to see other periods.`
              : "No transactions yet. Log one from the transactions page."}
          </p>
        ) : (
          txs.map((t) => {
            const sign =
              t.kind === "income" ? "+" : t.kind === "expense" ? "−" : "";
            const amountClass =
              t.kind === "income"
                ? "text-emerald-300"
                : t.kind === "expense"
                  ? "text-destructive"
                  : "";
            return (
              <Link
                key={t.id}
                href="/transactions"
                className="flex items-center gap-3 px-1 py-2 rounded-md hover:bg-secondary/50 transition-colors"
              >
                <KindIcon kind={t.kind} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium truncate">
                      {accountNameById.get(t.accountId) ?? "?"}
                    </span>
                    {t.category ? (
                      <Badge variant="secondary" className="text-[9px]">
                        {t.category}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {t.occurredAt}
                    {t.notes ? ` · ${t.notes.slice(0, 50)}` : ""}
                  </div>
                </div>
                <div
                  className={
                    "font-mono tabular-nums text-sm shrink-0 " + amountClass
                  }
                >
                  {sign}
                  {formatMoney(t.amount, t.currency, { compact: true })}
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
