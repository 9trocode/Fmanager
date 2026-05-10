"use client";

import { useState, useTransition } from "react";
import { FileSpreadsheet, FileText, Download, FileCode2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const RANGE_OPTIONS = [
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
  { value: "12", label: "Last 12 months" },
  { value: "24", label: "Last 24 months" },
] as const;

export function StatementExport({ baseCurrency }: { baseCurrency: string }) {
  const [months, setMonths] = useState("12");
  const [pendingFmt, setPendingFmt] = useState<
    "xlsx" | "pdf" | "csv" | null
  >(null);
  const [, startTransition] = useTransition();

  function download(format: "xlsx" | "pdf" | "csv") {
    setPendingFmt(format);
    startTransition(async () => {
      try {
        const url = `/api/exports/statement.${format}?months=${months}&base=${baseCurrency}`;
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          throw new Error(`Export failed (${res.status}). ${body.slice(0, 200)}`);
        }
        const blob = await res.blob();
        const a = document.createElement("a");
        const objectUrl = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 10);
        a.href = objectUrl;
        a.download = `cairn-statement-${stamp}.${format}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(objectUrl);
        toast.success(
          format === "xlsx"
            ? "Excel statement downloaded."
            : format === "pdf"
              ? "PDF statement downloaded."
              : "CSV statement downloaded.",
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Export failed.");
      } finally {
        setPendingFmt(null);
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Download className="size-4 text-muted-foreground" />
          Statements
        </CardTitle>
        <CardDescription>
          Branded month-on-month export of your accounts, cashflow, and equity.
          Excel for spreadsheet drilling, PDF for sharing or archiving.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="export_range">Range</Label>
            <Select value={months} onValueChange={setMonths}>
              <SelectTrigger id="export_range">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Base currency</Label>
            <div className="h-9 inline-flex items-center px-3 rounded-md border border-input bg-secondary/40 text-sm font-mono text-muted-foreground">
              {baseCurrency}
              <span className="ml-2 text-[10px] text-muted-foreground/70">
                (change in General)
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2.5 pt-1">
          <Button
            type="button"
            onClick={() => download("pdf")}
            disabled={pendingFmt !== null}
            loading={pendingFmt === "pdf"}
          >
            <FileText className="size-4" />
            {pendingFmt === "pdf" ? "Building…" : "Export PDF"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download("xlsx")}
            disabled={pendingFmt !== null}
            loading={pendingFmt === "xlsx"}
          >
            <FileSpreadsheet className="size-4" />
            {pendingFmt === "xlsx" ? "Building…" : "Export Excel (.xlsx)"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => download("csv")}
            disabled={pendingFmt !== null}
            loading={pendingFmt === "csv"}
          >
            <FileCode2 className="size-4" />
            {pendingFmt === "csv" ? "Building…" : "Export CSV"}
          </Button>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          All three formats are generated on your machine — your data never
          leaves the server. PDF for sharing or archiving (cover, trends,
          categories, goals, budgets, accounts). Excel for spreadsheet
          drilling — same sections plus a full transactions sheet. CSV is a
          single multi-section file (one tab in Sheets / Numbers, splittable
          on{" "}
          <span className="font-mono">## SECTION</span> markers in scripts).
        </p>
      </CardContent>
    </Card>
  );
}
