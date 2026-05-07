"use client";

import { useState, useTransition } from "react";
import { Download, Upload, FileText, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import {
  exportAllData,
  importAllData,
  importTransactionsCsv,
} from "@/lib/actions/data";
import { TRANSACTION_CSV_TEMPLATE } from "@/lib/csv";

function downloadBlob(text: string, mime: string, filename: string) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function ExportButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      onClick={() => {
        startTransition(async () => {
          try {
            const json = await exportAllData();
            const stamp = new Date().toISOString().slice(0, 10);
            downloadBlob(
              json,
              "application/json",
              `founder-finance-${stamp}.json`,
            );
            toast.success("Backup downloaded.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Export failed.");
          }
        });
      }}
      disabled={pending} loading={pending}
    >
      <Download className="size-4" />
      {pending ? "Preparing…" : "Export full backup (.json)"}
    </Button>
  );
}

function ImportJsonDialog() {
  const [open, setOpen] = useState(false);
  const [filename, setFilename] = useState<string | null>(null);
  const [contents, setContents] = useState<string>("");
  const [pending, startTransition] = useTransition();

  function reset() {
    setFilename(null);
    setContents("");
  }

  function handleConfirm() {
    if (!contents) return;
    const fd = new FormData();
    fd.set("json", contents);
    startTransition(async () => {
      try {
        const r = await importAllData(fd);
        toast.success(
          `Imported ${r.accounts} accounts, ${r.transactions} txs, ${r.grants} grants, ${r.flows} flows, ${r.budgets} budgets, ${r.savings} savings, ${r.decisions} decisions.`,
        );
        setOpen(false);
        reset();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="size-4" />
          Restore from backup (.json)
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restore from backup</DialogTitle>
          <DialogDescription>
            Replaces every account, transaction, grant, budget, flow, savings
            goal, decision, and setting with the contents of the file you
            upload. Cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="json-file">Backup file</Label>
            <input
              id="json-file"
              type="file"
              accept="application/json,.json"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground file:hover:bg-secondary/80"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFilename(file.name);
                setContents(await file.text());
              }}
            />
            {filename ? (
              <p className="text-[11px] text-muted-foreground font-mono">
                Loaded: {filename} · {(contents.length / 1024).toFixed(1)} KB
              </p>
            ) : null}
          </div>

          {contents ? (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 flex items-start gap-2.5">
              <AlertTriangle className="size-4 text-amber-300 shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                <span className="font-medium text-foreground">
                  This wipes everything currently in the database.
                </span>{" "}
                If you want to preserve current data, export a backup first.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button disabled={!contents || pending}>
                {pending ? "Restoring…" : "Restore"}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Replace all data?</AlertDialogTitle>
                <AlertDialogDescription>
                  Every existing row in every table will be deleted before the
                  backup is loaded. There is no undo.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleConfirm}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Yes, replace everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportTxCsvDialog() {
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [filename, setFilename] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    imported: number;
    errors: string[];
    errorCount: number;
  } | null>(null);

  function reset() {
    setCsv("");
    setFilename(null);
    setResult(null);
  }

  function handleImport() {
    if (!csv) return;
    const fd = new FormData();
    fd.set("csv", csv);
    startTransition(async () => {
      try {
        const r = await importTransactionsCsv(fd);
        setResult(r);
        if (r.errorCount === 0) {
          toast.success(`Imported ${r.imported} transactions.`);
        } else {
          toast.warning(
            `Imported ${r.imported} of ${r.imported + r.errorCount} (${r.errorCount} skipped).`,
          );
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Import failed.");
      }
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="size-4" />
          Import transactions (.csv)
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import transactions from CSV</DialogTitle>
          <DialogDescription>
            Append-only. Existing transactions are not touched. Headers must
            include <code className="font-mono">date</code>,{" "}
            <code className="font-mono">account</code>,{" "}
            <code className="font-mono">amount</code>. Optional:{" "}
            <code className="font-mono">currency</code>,{" "}
            <code className="font-mono">category</code>,{" "}
            <code className="font-mono">kind</code>,{" "}
            <code className="font-mono">notes</code>,{" "}
            <code className="font-mono">dest_account</code>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <input
              id="csv-file"
              type="file"
              accept="text/csv,.csv"
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-foreground file:hover:bg-secondary/80"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setFilename(file.name);
                setCsv(await file.text());
                setResult(null);
              }}
            />
            {filename ? (
              <p className="text-[11px] text-muted-foreground font-mono">
                {filename} · {csv.split("\n").length - 1} data rows
              </p>
            ) : null}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadBlob(
                TRANSACTION_CSV_TEMPLATE,
                "text/csv",
                "transactions-template.csv",
              )
            }
          >
            <Download className="size-4" />
            Download template CSV
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3 text-xs">
              <div className="font-medium">
                Imported {result.imported}{" "}
                {result.errorCount > 0
                  ? `· skipped ${result.errorCount}`
                  : ""}
              </div>
              {result.errors.length > 0 ? (
                <ul className="space-y-0.5 text-muted-foreground font-mono leading-relaxed max-h-40 overflow-y-auto">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            onClick={handleImport}
            disabled={!csv || pending || result != null}
          >
            {pending
              ? "Importing…"
              : result
                ? "Done"
                : "Import"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DataTools() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Migrate &amp; import</CardTitle>
        <CardDescription>
          Move your data in or out. The full-backup roundtrip is the cleanest
          way to migrate between machines or restore after a crash.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2.5">
        <ExportButton />
        <ImportJsonDialog />
        <ImportTxCsvDialog />
      </CardContent>
    </Card>
  );
}
