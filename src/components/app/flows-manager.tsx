"use client";

import { useMemo, useState, useTransition } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  ArrowDownRight,
  ArrowUpRight,
  Archive,
  ArchiveRestore,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/app/empty-state";
import {
  createFlow,
  deleteFlow,
  toggleFlowArchived,
  updateFlow,
} from "@/lib/actions/flows";
import {
  FLOW_CADENCE_LABEL,
  SUGGESTED_EXPENSE_CATEGORIES,
  SUGGESTED_INCOME_CATEGORIES,
  monthlyEquivalent,
} from "@/lib/flows";
import { SUPPORTED_CURRENCIES, formatMoney } from "@/lib/format";
import type { FlowCadence, FlowKind } from "@/lib/db/schema";
import { useRole } from "@/components/app/role-context";

export type FlowRow = {
  id: number;
  name: string;
  kind: FlowKind;
  category: string | null;
  amount: number;
  currency: string;
  cadence: FlowCadence;
  archived: boolean;
  notes: string | null;
};

function FlowFields({
  defaults,
  defaultKind,
}: {
  defaults?: FlowRow;
  defaultKind?: FlowKind;
}) {
  const kind = defaults?.kind ?? defaultKind ?? "expense";
  const categories =
    kind === "income"
      ? SUGGESTED_INCOME_CATEGORIES
      : SUGGESTED_EXPENSE_CATEGORIES;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            name="name"
            defaultValue={defaults?.name ?? ""}
            placeholder={kind === "income" ? "Founder salary" : "Lagos rent"}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="category">Category</Label>
          <Input
            id="category"
            name="category"
            defaultValue={defaults?.category ?? ""}
            placeholder={categories[0]}
            list={`${kind}-categories`}
          />
          <datalist id={`${kind}-categories`}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="amount">Amount</Label>
          <Input
            id="amount"
            name="amount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults?.amount ?? ""}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Currency</Label>
          <Select name="currency" defaultValue={defaults?.currency ?? "USD"}>
            <SelectTrigger id="currency">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cadence">Cadence</Label>
          <Select name="cadence" defaultValue={defaults?.cadence ?? "monthly"}>
            <SelectTrigger id="cadence">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["weekly", "monthly", "yearly"] as const).map((c) => (
                <SelectItem key={c} value={c}>
                  {FLOW_CADENCE_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <input type="hidden" name="kind" value={kind} />
      <div className="space-y-1.5">
        <Label htmlFor="notes">Notes (optional)</Label>
        <textarea
          id="notes"
          name="notes"
          rows={2}
          defaultValue={defaults?.notes ?? ""}
          placeholder="Vendor, contract end date, anything that matters."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
    </div>
  );
}

function AddFlowDialog({ defaultKind }: { defaultKind: FlowKind }) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={defaultKind === "income" ? "outline" : "default"}>
          <Plus className="size-4" />
          New {defaultKind}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            New recurring {defaultKind}
          </DialogTitle>
          <DialogDescription>
            Recurring {defaultKind === "income" ? "inflows feed" : "outflows reduce"} your
            monthly cash flow and the runway widget on the dashboard.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createFlow(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <FlowFields defaultKind={defaultKind} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditFlowDialog({
  flow,
  open,
  onOpenChange,
}: {
  flow: FlowRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit {flow.kind}</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateFlow(fd);
              onOpenChange(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={flow.id} />
          <FlowFields defaults={flow} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FlowRow({ flow }: { flow: FlowRow }) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [, startTransition] = useTransition();
  const monthly = monthlyEquivalent(flow.amount, flow.cadence);
  const readOnly = role === "viewer";

  function handleArchive() {
    const fd = new FormData();
    fd.set("id", String(flow.id));
    fd.set("archived", String(flow.archived));
    startTransition(async () => {
      await toggleFlowArchived(fd);
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(flow.id));
    startTransition(async () => {
      await deleteFlow(fd);
    });
  }

  const isIncome = flow.kind === "income";

  return (
    <div
      className={
        "flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border " +
        (flow.archived ? "opacity-50 " : "") +
        "hover:bg-secondary/40 transition-colors"
      }
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
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{flow.name}</span>
            {flow.category ? (
              <Badge variant="secondary" className="text-[10px]">
                {flow.category}
              </Badge>
            ) : null}
            <span className="text-[10px] font-mono text-muted-foreground">
              {FLOW_CADENCE_LABEL[flow.cadence].toLowerCase()}
            </span>
          </div>
          {flow.notes ? (
            <div className="text-xs text-muted-foreground truncate">{flow.notes}</div>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right">
          <div
            className={
              "font-mono tabular-nums text-sm " +
              (isIncome ? "text-emerald-300" : "")
            }
          >
            {isIncome ? "+" : "−"}
            {formatMoney(flow.amount, flow.currency)}
          </div>
          <div className="text-[10px] font-mono text-muted-foreground">
            ≈ {formatMoney(monthly, flow.currency)} / mo
          </div>
        </div>
        {readOnly ? null : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleArchive}>
                {flow.archived ? (
                  <>
                    <ArchiveRestore className="size-4" />
                    Unarchive
                  </>
                ) : (
                  <>
                    <Archive className="size-4" />
                    Archive
                  </>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this flow?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanent. Archive instead if you might need it again.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDelete}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <EditFlowDialog flow={flow} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  );
}

export function FlowsManager({
  flows,
  baseCurrency,
  monthlyIncomeInBase,
  monthlyExpensesInBase,
}: {
  flows: FlowRow[];
  baseCurrency: string;
  monthlyIncomeInBase: number;
  monthlyExpensesInBase: number;
}) {
  const [tab, setTab] = useState<"all" | "expense" | "income">("all");
  const filtered = useMemo(
    () => (tab === "all" ? flows : flows.filter((f) => f.kind === tab)),
    [flows, tab],
  );
  const expenses = filtered.filter((f) => f.kind === "expense");
  const incomes = filtered.filter((f) => f.kind === "income");

  return (
    <div className="space-y-6">
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly income</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-emerald-300">
              {formatMoney(monthlyIncomeInBase, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly expenses</CardDescription>
            <CardTitle className="text-2xl font-mono tabular-nums text-destructive">
              {formatMoney(monthlyExpensesInBase, baseCurrency)}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Net monthly</CardDescription>
            <CardTitle
              className={
                "text-2xl font-mono tabular-nums " +
                (monthlyIncomeInBase - monthlyExpensesInBase >= 0
                  ? "text-emerald-300"
                  : "text-destructive")
              }
            >
              {formatMoney(
                monthlyIncomeInBase - monthlyExpensesInBase,
                baseCurrency,
                { signed: true },
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as typeof tab)}
          className="w-auto"
        >
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="expense">Expenses</TabsTrigger>
            <TabsTrigger value="income">Income</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <AddFlowDialog defaultKind="income" />
          <AddFlowDialog defaultKind="expense" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={ArrowDownRight}
          title="No recurring flows yet"
          description="Add your fixed monthly outflows and inflows. The dashboard runway widget and projections will use these immediately."
          action={
            <div className="flex gap-2">
              <AddFlowDialog defaultKind="expense" />
              <AddFlowDialog defaultKind="income" />
            </div>
          }
        />
      ) : (
        <div className="space-y-6">
          {tab !== "income" && expenses.length > 0 ? (
            <div className="space-y-2">
              {tab === "all" ? (
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Expenses
                </h3>
              ) : null}
              <div className="space-y-2">
                {expenses.map((f) => (
                  <FlowRow key={f.id} flow={f} />
                ))}
              </div>
            </div>
          ) : null}
          {tab !== "expense" && incomes.length > 0 ? (
            <div className="space-y-2">
              {tab === "all" ? (
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Income
                </h3>
              ) : null}
              <div className="space-y-2">
                {incomes.map((f) => (
                  <FlowRow key={f.id} flow={f} />
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
