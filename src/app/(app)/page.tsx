import { Wallet, ArrowUpRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";
import { SCENARIO_LABEL, SCENARIO_DESCRIPTION } from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export default function DashboardPage() {
  const baseCurrency = "USD";

  // Stub values until real data flows through.
  const scenarios = {
    floor: 0,
    expected: 0,
    liquid: 0,
  };

  return (
    <>
      <PageHeader
        title="Net worth"
        description="The honest balance sheet — three scenarios, one base currency."
        actions={
          <>
            <Button variant="outline" size="sm">
              <Plus className="size-4" />
              Add account
            </Button>
            <Button size="sm">
              <ArrowUpRight className="size-4" />
              Snapshot
            </Button>
          </>
        }
      />

      <Tabs defaultValue="floor" className="space-y-6">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="floor">{SCENARIO_LABEL.floor}</TabsTrigger>
            <TabsTrigger value="expected">{SCENARIO_LABEL.expected}</TabsTrigger>
            <TabsTrigger value="liquid">{SCENARIO_LABEL.liquid}</TabsTrigger>
          </TabsList>
          <Badge variant="secondary" className="font-mono text-[11px]">
            base · {baseCurrency}
          </Badge>
        </div>

        {(["floor", "expected", "liquid"] as const).map((s) => (
          <TabsContent key={s} value={s} className="space-y-6">
            <Card>
              <CardHeader>
                <CardDescription>{SCENARIO_DESCRIPTION[s]}</CardDescription>
                <CardTitle className="text-4xl font-semibold tracking-tight tabular-nums mt-2">
                  {formatMoney(scenarios[s], baseCurrency)}
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border">
                {[
                  { label: "Cash", value: 0 },
                  { label: "Brokerage", value: 0 },
                  { label: "Crypto", value: 0 },
                  { label: "Equity", value: 0 },
                ].map(({ label, value }) => (
                  <div key={label} className="space-y-1">
                    <div className="text-xs text-muted-foreground uppercase tracking-wide">
                      {label}
                    </div>
                    <div className="font-mono text-sm tabular-nums">
                      {formatMoney(value, baseCurrency, { compact: true })}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>

      <div className="mt-8">
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your first account to see your net worth across currencies and scenarios."
          action={
            <Button>
              <Plus className="size-4" />
              Add your first account
            </Button>
          }
        />
      </div>
    </>
  );
}
