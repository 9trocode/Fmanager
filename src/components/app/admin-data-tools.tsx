"use client";

import { useTransition } from "react";
import { Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { seedSampleData, wipeAllData } from "@/lib/actions/seed";

export function AdminDataTools() {
  const [pending, startTransition] = useTransition();

  function handleSeed() {
    startTransition(async () => {
      try {
        const r = await seedSampleData();
        toast.success(
          `Seeded ${r.accounts} accounts, ${r.grants} grants, ${r.flows} flows, ${r.transactions} transactions, ${r.budgets} budgets, ${r.decisions} decisions.`,
        );
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Seed failed.");
      }
    });
  }

  function handleWipe() {
    startTransition(async () => {
      try {
        await wipeAllData();
        toast.success("All data wiped.");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Wipe failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={pending} loading={pending}>
            <Sparkles className="size-4" />
            {pending ? "Working…" : "Seed sample data"}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Seed sample founder data?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span className="block">
                This wipes accounts, snapshots, grants, decisions, and FX cache,
                then inserts a realistic multi-currency founder dataset:
              </span>
              <span className="block text-xs font-mono">
                · 8 accounts (USD/NGN/EUR cash, brokerage, crypto, real estate, mortgage)
                <br />· 3 equity grants (founder, ISO, public RSU)
                <br />· 3 active decisions
                <br />· base currency reset to USD
              </span>
              <span className="block">
                Your Anthropic API key is preserved.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSeed}>Seed</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={pending} loading={pending}
            className="text-destructive"
          >
            <Trash2 className="size-4" />
            Wipe all data
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Wipe all data?</AlertDialogTitle>
            <AlertDialogDescription>
              Permanent. Removes accounts, snapshots, grants, decisions, FX cache,
              and settings. There is no undo. Use this to reset to first-run.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleWipe}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Wipe everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
