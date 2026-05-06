import { Plus, Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";

export default function EquityPage() {
  return (
    <>
      <PageHeader
        title="Equity grants"
        description="Founder shares, options, RSUs, SAFEs. Each grant has a Floor / Expected / Liquid value, computed from vested shares × scenario price."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New grant
          </Button>
        }
      />
      <EmptyState
        icon={Briefcase}
        title="No equity grants yet"
        description="Track each grant separately. Strike, FMV (current 409A), and expected exit price drive the three scenarios."
        action={
          <Button>
            <Plus className="size-4" />
            Add first grant
          </Button>
        }
      />
    </>
  );
}
