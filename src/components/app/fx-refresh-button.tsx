"use client";

import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshFxRates } from "@/lib/actions/fx";

export function FxRefreshButton({ base }: { base: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          try {
            const r = await refreshFxRates(base);
            toast.success(`FX refreshed — ${r.count} pairs updated.`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "FX refresh failed.");
          }
        });
      }}
    >
      <RefreshCw className={"size-4 " + (pending ? "animate-spin" : "")} />
      {pending ? "Fetching…" : "Refresh FX rates"}
    </Button>
  );
}
