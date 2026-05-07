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
        // Stack title above actions on phones; side-by-side at sm+ so the
        // CTA isn't squashed into the title's gutter on a 375px screen.
        "flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-6 mb-6",
        size === "lg"
          ? "border-b-0 pt-2"
          : "border-b border-border bg-card/40 backdrop-blur-md -mx-4 px-4 py-4 rounded-xl",
        className,
      )}
    >
      <div className="space-y-1.5 min-w-0">
        <h1
          className={cn(
            "font-semibold tracking-tight text-balance",
            size === "lg" ? "text-2xl sm:text-3xl md:text-4xl" : "text-xl sm:text-2xl",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p
            className={cn(
              "text-muted-foreground max-w-2xl leading-relaxed",
              size === "lg" ? "text-sm sm:text-base" : "text-sm",
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-wrap sm:shrink-0 sm:flex-nowrap">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
