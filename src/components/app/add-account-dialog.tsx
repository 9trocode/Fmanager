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
import { AccountFields } from "@/components/app/account-form-fields";
import { createAccount } from "@/lib/actions/accounts";
import { useRole } from "@/components/app/role-context";

export function AddAccountDialog({
  trigger,
  size = "sm",
}: {
  trigger?: React.ReactNode;
  size?: "sm" | "default" | "lg";
}) {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size={size}>
            <Plus className="size-4" />
            New account
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            One account = one currency. Use snapshots to track changes over time.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createAccount(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <AccountFields showOpening />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
