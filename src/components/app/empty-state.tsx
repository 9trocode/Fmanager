import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "flex flex-col items-center justify-center text-center px-8 py-16 border-dashed",
        className,
      )}
    >
      {Icon ? (
        <div className="size-10 rounded-full bg-secondary grid place-items-center mb-4">
          <Icon className="size-5 text-muted-foreground" />
        </div>
      ) : null}
      <div className="text-base font-medium">{title}</div>
      {description ? (
        <p className="text-sm text-muted-foreground mt-1.5 max-w-sm">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </Card>
  );
}
