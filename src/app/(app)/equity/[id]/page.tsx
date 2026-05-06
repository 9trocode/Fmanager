import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
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
import { EditGrantDialog } from "@/components/app/edit-grant-dialog";
import { getGrant } from "@/lib/db/queries";
import { deleteGrant } from "@/lib/actions/grants";
import { GRANT_TYPE_LABEL } from "@/lib/grant-types";
import {
  SCENARIOS,
  SCENARIO_LABEL,
  SCENARIO_DESCRIPTION,
  equityValueForScenario,
} from "@/lib/scenarios";
import { formatMoney } from "@/lib/format";

export default async function GrantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) notFound();
  const grant = await getGrant(id);
  if (!grant) notFound();

  const vestPct =
    grant.totalShares > 0 ? (grant.vestedShares / grant.totalShares) * 100 : 0;

  return (
    <>
      <div className="mb-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/equity">
            <ArrowLeft className="size-4" />
            All grants
          </Link>
        </Button>
      </div>

      <PageHeader
        title={grant.company}
        description={`${GRANT_TYPE_LABEL[grant.grantType]} · ${grant.currency} · ${vestPct.toFixed(0)}% vested`}
        actions={
          <>
            <EditGrantDialog grant={grant} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete this grant?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Permanent. This grant disappears from your dashboard and projections.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <form action={deleteGrant}>
                    <input type="hidden" name="id" value={grant.id} />
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

      <div className="grid md:grid-cols-3 gap-4 mb-6">
        {SCENARIOS.map((s) => {
          const value = equityValueForScenario(grant, s);
          return (
            <Card key={s}>
              <CardHeader className="pb-3">
                <CardDescription className="flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wide font-medium">
                    {SCENARIO_LABEL[s]}
                  </span>
                  {s === "floor" ? (
                    <Badge variant="outline" className="text-[10px]">
                      plan against this
                    </Badge>
                  ) : null}
                </CardDescription>
                <CardTitle
                  className={
                    "text-2xl font-semibold tabular-nums " +
                    (s === "floor" ? "text-muted-foreground" : "")
                  }
                >
                  {formatMoney(value, grant.currency)}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground border-t border-border pt-3">
                {SCENARIO_DESCRIPTION[s]}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Grant details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          {[
            { label: "Total shares", value: grant.totalShares.toLocaleString() },
            { label: "Vested shares", value: grant.vestedShares.toLocaleString() },
            {
              label: "Strike price",
              value:
                grant.strikePrice != null
                  ? formatMoney(grant.strikePrice, grant.currency)
                  : "—",
            },
            {
              label: "FMV / share",
              value:
                grant.fmvPerShare != null
                  ? formatMoney(grant.fmvPerShare, grant.currency)
                  : "—",
            },
            {
              label: "Exit / share",
              value:
                grant.exitPricePerShare != null
                  ? formatMoney(grant.exitPricePerShare, grant.currency)
                  : "—",
            },
            { label: "Granted on", value: grant.grantedAt ?? "—" },
          ].map((row) => (
            <div key={row.label} className="space-y-0.5">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {row.label}
              </div>
              <div className="font-mono tabular-nums">{row.value}</div>
            </div>
          ))}
        </CardContent>
        {grant.vestingNotes ? (
          <CardContent className="border-t border-border pt-4">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1.5">
              Vesting notes
            </div>
            <p className="text-sm whitespace-pre-wrap">{grant.vestingNotes}</p>
          </CardContent>
        ) : null}
      </Card>
    </>
  );
}
