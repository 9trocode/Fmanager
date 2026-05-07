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
import { AccountFields } from "@/components/app/account-form-fields";
import { updateAccount } from "@/lib/actions/accounts";
import type { AccountType } from "@/lib/db/schema";
import { useRole } from "@/components/app/role-context";

export function EditAccountDialog({
  account,
}: {
  account: {
    id: number;
    name: string;
    type: AccountType;
    currency: string;
    institution: string | null;
    notes: string | null;
    accountNumber: string | null;
    routingOrIban: string | null;
    swiftBic: string | null;
    holderName: string | null;
    branch: string | null;
    loginUrl: string | null;
    contactPhone: string | null;
    statementsUrl: string | null;
  };
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
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateAccount(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={account.id} />
          <AccountFields defaults={account} />
          <DialogFooter>
            <Button type="submit" disabled={pending} loading={pending}>
              {pending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
