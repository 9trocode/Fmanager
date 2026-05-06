import Link from "next/link";
import { Wallet, ChevronRight } from "lucide-react";
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
import { listAccountsWithEffective } from "@/lib/db/queries";
import { ACCOUNT_TYPE_LABEL, isLiability } from "@/lib/account-types";
import { formatMoney } from "@/lib/format";

export default async function AccountsPage() {
  const accounts = await listAccountsWithEffective({ includeArchived: true });
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

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
          {active.map((a) => (
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
          ))}
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
