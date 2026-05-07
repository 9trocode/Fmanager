"use client";

import { useState, useTransition } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SavingsGoalFields } from "@/components/app/savings-form-fields";
import { updateSavingsGoal } from "@/lib/actions/savings";
import { useRole } from "@/components/app/role-context";

type Goal = {
  id: number;
  kind: "savings" | "net_worth" | "fire" | "debt_payoff";
  name: string;
  category: string | null;
  targetAmount: number | null;
  currentAmount: number;
  currency: string;
  monthlyContribution: number;
  expectedReturnPct: number;
  horizonMonths: number;
  targetDate: string | null;
  fireMultiplier: number | null;
  startedAt: string;
  accountId: number | null;
  notes: string | null;
};

export function EditSavingsGoalDialog({
  goal,
  accountOptions,
}: {
  goal: Goal;
  accountOptions: Array<{
    id: number;
    name: string;
    currency: string;
    type?: string;
  }>;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Pencil className="size-4" />
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit goal</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateSavingsGoal(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={goal.id} />
          <SavingsGoalFields defaults={goal} accountOptions={accountOptions} />
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
