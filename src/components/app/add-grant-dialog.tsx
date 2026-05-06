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
import { GrantFields } from "@/components/app/grant-form-fields";
import { createGrant } from "@/lib/actions/grants";
import { useRole } from "@/components/app/role-context";

export function AddGrantDialog() {
  const role = useRole();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  if (role === "viewer") return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          New grant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New equity grant</DialogTitle>
          <DialogDescription>
            Strike, FMV (current 409A), and expected exit drive Floor / Expected /
            Liquid. Leave fields empty if you don&apos;t know — they default to zero.
          </DialogDescription>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await createGrant(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <GrantFields />
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Add grant"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
