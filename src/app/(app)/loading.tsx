/**
 * Route-level loading UI for every (app) page.
 *
 * Why this matters for perceived speed: every page in this segment is
 * `force-dynamic` and reads from SQLite (accounts, transactions, FX,
 * settings, …). On a Link click Next streams the new HTML, but until
 * the server finishes the round-trip the user sees nothing change. With
 * a `loading.tsx` in this segment, the sidebar stays mounted (the
 * (app) layout doesn't unmount) and only the main column swaps to this
 * skeleton instantly — feels snappy even when the actual server render
 * takes ~150–300ms.
 *
 * The skeleton mirrors the most common page shape: PageHeader strip,
 * then a 3-card summary grid, then a list. Pages with custom layouts
 * (welcome, advisor) override this with their own `loading.tsx` if they
 * need to.
 */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-6 animate-pulse">
      {/* PageHeader skeleton */}
      <div className="border-b border-border bg-card/40 backdrop-blur-md -mx-4 px-4 py-4 rounded-xl flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 pb-6">
        <div className="space-y-2 min-w-0">
          <div className="h-7 w-48 max-w-full rounded bg-muted/70" />
          <div className="h-4 w-72 max-w-full rounded bg-muted/40" />
        </div>
        <div className="flex items-center gap-2">
          <div className="h-9 w-24 rounded-md bg-muted/60" />
        </div>
      </div>

      {/* Summary cards (matches the dashboard / budgets / savings layout) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="rounded-xl border border-border bg-card/40 p-5 space-y-3"
          >
            <div className="h-3 w-24 rounded bg-muted/50" />
            <div className="h-8 w-32 rounded bg-muted/70" />
          </div>
        ))}
      </div>

      {/* Row list */}
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="size-8 rounded-md bg-muted/60 shrink-0" />
              <div className="space-y-1.5 min-w-0">
                <div className="h-4 w-40 max-w-[40vw] rounded bg-muted/60" />
                <div className="h-3 w-24 rounded bg-muted/40" />
              </div>
            </div>
            <div className="h-5 w-20 rounded bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
