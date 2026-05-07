import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  size = "default",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /** Visual prominence. "lg" is for top-of-page hero headers; "default" for everything else. */
  size?: "default" | "lg";
}) {
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 pb-6 mb-6",
        size === "lg" ? "border-b-0 pt-2" : "border-b border-border bg-card/40 backdrop-blur-md -mx-4 px-4 py-4 rounded-xl",
        className,
      )}
    >
      <div className="space-y-1.5 min-w-0">
        <h1
          className={cn(
            "font-semibold tracking-tight text-balance",
            size === "lg" ? "text-3xl md:text-4xl" : "text-2xl",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "text-muted-foreground max-w-2xl leading-relaxed",
              size === "lg" ? "text-base" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      ) : null}
    </div>
  );
}
