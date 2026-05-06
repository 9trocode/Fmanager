"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SavingsGoalFields } from "@/components/app/savings-form-fields";
import { createSavingsGoal } from "@/lib/actions/savings";
import { useRole } from "@/components/app/role-context";

export function AddSavingsGoalDialog({
  accountOptions,
}: {
  accountOptions: Array<{ id: number; name: string; currency: string }>;
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New goal
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
          <DialogDescription>
            Set a target, a monthly contribution, and a length. The detail page
            shows your projected balance over time and your net worth at the end.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createSavingsGoal(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <SavingsGoalFields accountOptions={accountOptions} />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
