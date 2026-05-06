import { Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/page-header";
import { EmptyState } from "@/components/app/empty-state";

export default function AccountsPage() {
  return (
    <>
      <PageHeader
        title="Accounts"
        description="Cash, brokerage, crypto, real estate. One row per account, snapshots optional."
        actions={
          <Button size="sm">
            <Plus className="size-4" />
            New account
          </Button>
        }
      />
      <EmptyState
        icon={Wallet}
        title="No accounts yet"
        description="Each account holds a current balance in a single currency. Snapshots track changes over time."
        action={
          <Button>
            <Plus className="size-4" />
            Add your first account
          </Button>
        }
      />
    </>
  );
}
