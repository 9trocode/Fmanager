import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Archive, ArchiveRestore, Trash2 } from "lucide-react";
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
import { getAccount, listSnapshots } from "@/lib/db/queries";
import {
  archiveAccount,
  unarchiveAccount,
  deleteAccount,
  deleteSnapshot,
} from "@/lib/actions/accounts";
import { ACCOUNT_TYPE_LABEL, isLiability } from "@/lib/account-types";
import { formatMoney } from "@/lib/format";

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

  const snapshots = await listSnapshots(id);
  const latest = snapshots[0];
  const liability = isLiability(account.type);

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
              {latest
                ? formatMoney(
                    liability ? -latest.value : latest.value,
                    account.currency,
                  )
                : "—"}
            </CardTitle>
            {latest ? (
              <CardDescription className="font-mono">
                as of {latest.asOf}
              </CardDescription>
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
    </>
  );
}
