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
import { GrantFields } from "@/components/app/grant-form-fields";
import { updateGrant } from "@/lib/actions/grants";
import type { GrantType } from "@/lib/grant-types";
import { useRole } from "@/components/app/role-context";

export function EditGrantDialog({
  grant,
}: {
  grant: {
    id: number;
    company: string;
    grantType: GrantType;
    totalShares: number;
    vestedShares: number;
    strikePrice: number | null;
    currency: string;
    fmvPerShare: number | null;
    exitPricePerShare: number | null;
    vestingStartDate: string | null;
    vestingMonths: number | null;
    cliffMonths: number | null;
    expectedExitMonths: number | null;
    taxRatePct: number | null;
    grantedAt: string | null;
    vestingNotes: string | null;
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
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit grant</DialogTitle>
        </DialogHeader>
        <form
          action={(fd) =>
            startTransition(async () => {
              await updateGrant(fd);
              setOpen(false);
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="id" value={grant.id} />
          <GrantFields defaults={grant} />
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
