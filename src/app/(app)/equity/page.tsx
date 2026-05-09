import Link from "next/link";
import { Briefcase, ChevronRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { AddGrantDialog } from "@/components/app/add-grant-dialog";
import { listGrants } from "@/lib/db/queries";
import { GRANT_TYPE_LABEL } from "@/lib/grant-types";
import { equityValueForScenario } from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export default async function EquityPage() {
  const grants = await listGrants();

  return (
    <>
      <PageHeader
        title="Equity grants"
        description="Common shares, options, RSUs, SAFEs. Each grant is shown in three scenarios — Floor (zero), Liquid (current FMV), Expected (target exit)."
        actions={<AddGrantDialog />}
      />

      {grants.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No equity grants yet"
          description="Track each grant separately. Strike, FMV, and expected exit drive the three scenarios."
          action={<AddGrantDialog />}
        />
      ) : (
        <div className="grid gap-3">
          {grants.map((g) => {
            const floor = equityValueForScenario(g, "floor");
            const liquid = equityValueForScenario(g, "liquid");
            const expected = equityValueForScenario(g, "expected");
            const vestPct =
              g.totalShares > 0 ? Math.round((g.vestedShares / g.totalShares) * 100) : 0;
            return (
              <Link key={g.id} href={`/equity/${g.id}`} className="block group">
                <Card className="transition-colors hover:bg-secondary/40">
                  <CardHeader className="py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase tracking-wide">
                            {GRANT_TYPE_LABEL[g.grantType]}
                          </Badge>
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {g.currency}
                          </span>
                          <span className="text-[11px] text-muted-foreground">
                            · {vestPct}% vested
                          </span>
                        </div>
                        <CardTitle className="text-base truncate">{g.company}</CardTitle>
                        <CardDescription className="text-xs font-mono">
                          {g.vestedShares.toLocaleString()} / {g.totalShares.toLocaleString()} shares
                          {g.strikePrice != null
                            ? ` · strike ${formatMoney(g.strikePrice, g.currency)}`
                            : ""}
                        </CardDescription>
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground group-hover:text-foreground shrink-0 mt-1" />
                    </div>

                    <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-border">
                      {[
                        { label: "Floor", value: floor, hint: "equity = 0" },
                        { label: "Liquid", value: liquid, hint: "current FMV" },
                        { label: "Expected", value: expected, hint: "target exit" },
                      ].map(({ label, value, hint }) => (
                        <div key={label} className="space-y-0.5">
                          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            {label}
                          </div>
                          <div className="font-mono text-sm tabular-nums">
                            {formatMoney(value, g.currency, { compact: true })}
                          </div>
                          <div className="text-[10px] text-muted-foreground">{hint}</div>
                        </div>
                      ))}
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
