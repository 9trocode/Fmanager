"use client";

import { useState, useTransition } from "react";
import {
  Plus,
  MoreHorizontal,
  Pencil,
  CheckCircle2,
  Clock,
  Trash2,
  RotateCcw,
  Sparkles,
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
import { EmptyState } from "@/components/app/empty-state";
import {
  createDecision,
  deleteDecision,
  seedStarterDecisions,
  setDecisionStatus,
  updateDecision,
} from "@/lib/actions/decisions";
import { useRole } from "@/components/app/role-context";

type Decision = {
  id: number;
  question: string;
  context: string | null;
  status: "open" | "decided" | "deferred";
  outcome: string | null;
  decidedAt: string | null;
};

function StatusBadge({ status }: { status: Decision["status"] }) {
  if (status === "open") return <Badge variant="secondary">Open</Badge>;
  if (status === "decided")
    return (
      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20">
        Decided
      </Badge>
    );
  return <Badge variant="outline">Deferred</Badge>;
}

function DecisionForm({
  decision,
  onSubmit,
  submitLabel,
}: {
  decision?: Decision;
  onSubmit: (fd: FormData) => Promise<void>;
  submitLabel: string;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => {
        startTransition(async () => {
          await onSubmit(fd);
        });
      }}
      className="space-y-4"
    >
      {decision ? (
        <input type="hidden" name="id" value={decision.id} />
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="question">Question</Label>
        <Input
          id="question"
          name="question"
          defaultValue={decision?.question ?? ""}
          placeholder="Should I…"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="context">Context (optional)</Label>
        <textarea
          id="context"
          name="context"
          defaultValue={decision?.context ?? ""}
          rows={4}
          placeholder="Numbers, deadlines, what you're really weighing."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
        />
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddDecisionDialog() {
  const role = useRole();
  const [open, setOpen] = useState(false);
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New decision
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New decision</DialogTitle>
          <DialogDescription>
            The advisor anchors on these. Be concrete — numbers, dates, real tradeoffs.
          </DialogDescription>
        </DialogHeader>
        <DecisionForm
          submitLabel="Add"
          onSubmit={async (fd) => {
            await createDecision(fd);
            setOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditDecisionDialog({
  decision,
  open,
  onOpenChange,
}: {
  decision: Decision;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit decision</DialogTitle>
        </DialogHeader>
        <DecisionForm
          decision={decision}
          submitLabel="Save"
          onSubmit={async (fd) => {
            await updateDecision(fd);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function MarkDecidedDialog({
  decision,
  open,
  onOpenChange,
}: {
  decision: Decision;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark as decided</DialogTitle>
          <DialogDescription className="text-balance">
            What did you decide and why? This is the most useful field — record it now
            so future-you can audit.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) => {
            startTransition(async () => {
              await setDecisionStatus(fd);
              onOpenChange(false);
            });
          }}
          className="space-y-4"
        >
          <input type="hidden" name="id" value={decision.id} />
          <input type="hidden" name="status" value="decided" />
          <div className="space-y-1.5">
            <Label htmlFor="outcome">Outcome</Label>
            <textarea
              id="outcome"
              name="outcome"
              rows={4}
              defaultValue={decision.outcome ?? ""}
              placeholder="What did you choose, and what tipped it?"
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring resize-y"
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              <CheckCircle2 className="size-4" />
              Mark decided
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DecisionRow({ decision }: { decision: Decision }) {
  const role = useRole();
  const [editOpen, setEditOpen] = useState(false);
  const [decideOpen, setDecideOpen] = useState(false);
  const [, startTransition] = useTransition();
  const readOnly = role === "viewer";

  function quickStatus(status: "open" | "deferred") {
    const fd = new FormData();
    fd.set("id", String(decision.id));
    fd.set("status", status);
    startTransition(async () => {
      await setDecisionStatus(fd);
    });
  }

  function handleDelete() {
    const fd = new FormData();
    fd.set("id", String(decision.id));
    startTransition(async () => {
      await deleteDecision(fd);
    });
  }

  const clickable = !readOnly;

  return (
    <Card
      className={clickable ? "cursor-pointer hover:bg-secondary/30 transition-colors" : undefined}
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => {
        if (clickable) setEditOpen(true);
      }}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          setEditOpen(true);
        }
      }}
    >
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <StatusBadge status={decision.status} />
            {decision.decidedAt ? (
              <span className="text-[11px] text-muted-foreground font-mono">
                {new Date(decision.decidedAt).toLocaleDateString()}
              </span>
            ) : null}
          </div>
          <CardTitle className="text-base leading-snug">{decision.question}</CardTitle>
          {decision.context ? (
            <CardDescription className="leading-relaxed">
              {decision.context}
            </CardDescription>
          ) : null}
        </div>
        {readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Edit
            </DropdownMenuItem>
            {decision.status !== "decided" ? (
              <DropdownMenuItem onSelect={() => setDecideOpen(true)}>
                <CheckCircle2 className="size-4" />
                Mark decided
              </DropdownMenuItem>
            ) : null}
            {decision.status === "open" ? (
              <DropdownMenuItem onSelect={() => quickStatus("deferred")}>
                <Clock className="size-4" />
                Defer
              </DropdownMenuItem>
            ) : null}
            {decision.status !== "open" ? (
              <DropdownMenuItem onSelect={() => quickStatus("open")}>
                <RotateCcw className="size-4" />
                Re-open
              </DropdownMenuItem>
            ) : null}
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
                  <AlertDialogTitle>Delete decision?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This is permanent. Deferring keeps it in your history; deleting
                    removes it.
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
      </CardHeader>
      {decision.outcome ? (
        <CardContent className="pt-0 border-t border-border">
          <div className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5 mt-3">
            Outcome
          </div>
          <p className="text-sm leading-relaxed">{decision.outcome}</p>
        </CardContent>
      ) : null}

      <EditDecisionDialog
        decision={decision}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <MarkDecidedDialog
        decision={decision}
        open={decideOpen}
        onOpenChange={setDecideOpen}
      />
    </Card>
  );
}

function SeedButton() {
  const role = useRole();
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Button
      variant="outline"
      onClick={() => startTransition(() => seedStarterDecisions().then(() => {}))}
      disabled={pending}
    >
      <Sparkles className="size-4" />
      {pending ? "Seeding…" : "Use suggested starter decisions"}
    </Button>
  );
}

export function DecisionsManager({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <h2 className="text-base font-medium">Decisions</h2>
            <p className="text-sm text-muted-foreground">
              The advisor anchors on these. Add 3 to start.
            </p>
          </div>
          <AddDecisionDialog />
        </div>
        <EmptyState
          icon={Sparkles}
          title="No decisions yet"
          description="Add your own, or seed three illustrative ones to get started. You can edit or delete any of them."
          action={
            <div className="flex gap-2">
              <SeedButton />
              <AddDecisionDialog />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-base font-medium">Decisions</h2>
          <p className="text-sm text-muted-foreground">
            {decisions.filter((d) => d.status === "open").length} open ·{" "}
            {decisions.length} total
          </p>
        </div>
        <AddDecisionDialog />
      </div>
      <div className="space-y-3">
        {decisions.map((d) => (
          <DecisionRow key={d.id} decision={d} />
        ))}
      </div>
    </div>
  );
}
