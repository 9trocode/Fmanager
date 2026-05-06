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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addSnapshot } from "@/lib/actions/accounts";
import { useRole } from "@/components/app/role-context";

export function AddSnapshotDialog({
  accountId,
  currency,
}: {
  accountId: number;
  currency: string;
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
          New snapshot
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New snapshot</DialogTitle>
          <DialogDescription>
            Record this account&apos;s balance as of a specific date. Latest snapshot is
            the current value.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await addSnapshot(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="account_id" value={accountId} />
          <input type="hidden" name="currency" value={currency} />
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="value">Balance ({currency})</Label>
              <Input
                id="value"
                name="value"
                type="number"
                step="0.01"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="as_of">As of</Label>
              <Input
                id="as_of"
                name="as_of"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save snapshot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
