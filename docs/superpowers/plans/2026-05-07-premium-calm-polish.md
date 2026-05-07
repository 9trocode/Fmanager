# Premium & Calm Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the project's visual identity into a "Premium & Calm" experience using translucency, soft shadows, and precise typography, while preserving the existing layout.

**Architecture:** We will surgically update the global CSS variables and base UI components to propagate a "Glass House" aesthetic across the entire application. We'll also update key data components to use Geist Mono for a high-end fintech feel.

**Tech Stack:** Tailwind CSS 4 (OKLCH), Radix UI, Geist Sans/Mono, Lucide React.

---

### Task 1: Global Theme & Base Utilities

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Update OKLCH variables and add glass utilities**
Update the theme variables to use softer colors and add the `.glass` and `.shadow-pillow` utilities.

```css
@theme inline {
  /* ... existing colors ... */
  --color-glass-border: oklch(1 0 0 / 10%);
  --color-glass-bg: oklch(1 0 0 / 40%);
  --shadow-pillow: 0 8px 32px 0 oklch(0 0 0 / 4%);
  --shadow-pillow-hover: 0 12px 48px 0 oklch(0 0 0 / 8%);
}

.glass {
  background: var(--color-glass-bg);
  backdrop-filter: blur(12px);
  border: 1px solid var(--color-glass-border);
}

.dark .glass {
  --color-glass-bg: oklch(0.205 0 0 / 40%);
  --color-glass-border: oklch(1 0 0 / 5%);
}
```

- [ ] **Step 2: Commit changes**
```bash
git add src/app/globals.css
git commit -m "style: update global theme variables and add glass utilities"
```

---

### Task 2: Aurora Background Upgrade

**Files:**
- Modify: `src/components/app/hero-background.tsx`

- [ ] **Step 1: Implement drifting and pulsing orbs**
Update the `HeroBackground` to use the new animation and color strategy.

```tsx
export function HeroBackground({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={
        "pointer-events-none absolute inset-x-0 top-0 -z-10 overflow-hidden " +
        (className ?? "")
      }
    >
      <div
        className="absolute -top-32 left-[15%] size-[600px] rounded-full opacity-20 blur-3xl animate-pulse"
        style={{
          background: "radial-gradient(circle, oklch(0.6 0.2 260), transparent 70%)",
          animationDuration: '10s'
        }}
      />
      <div
        className="absolute -top-24 right-[10%] size-[500px] rounded-full opacity-15 blur-3xl animate-pulse"
        style={{
          background: "radial-gradient(circle, oklch(0.7 0.15 190), transparent 70%)",
          animationDuration: '15s',
          animationDelay: '2s'
        }}
      />
      <div
        className="absolute top-1/4 left-1/3 size-[400px] rounded-full opacity-10 blur-3xl animate-pulse"
        style={{
          background: "radial-gradient(circle, oklch(0.8 0.1 320), transparent 70%)",
          animationDuration: '12s',
          animationDelay: '5s'
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Commit changes**
```bash
git add src/components/app/hero-background.tsx
git commit -m "style: upgrade hero background with animated aurora orbs"
```

---

### Task 3: Global Component Refresh (Cards)

**Files:**
- Modify: `src/components/ui/card.tsx`

- [ ] **Step 1: Apply glass and pillow shadow to Card component**
Update the `Card` component to use `rounded-2xl`, `glass`, and `shadow-pillow`.

```tsx
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card flex flex-col gap-4 overflow-hidden rounded-2xl glass shadow-pillow transition-all duration-300 hover:-translate-y-0.5 hover:shadow-pillow-hover py-4 text-sm text-card-foreground has-data-[slot=card-footer]:pb-0 has-[>img:first-child]:pt-0 data-[size=sm]:gap-3 data-[size=sm]:py-3 data-[size=sm]:has-data-[slot=card-footer]:pb-0 *:[img:first-child]:rounded-t-2xl *:[img:last-child]:rounded-b-2xl",
        className
      )}
      {...props}
    />
  )
}
```

- [ ] **Step 2: Commit changes**
```bash
git add src/components/ui/card.tsx
git commit -m "style: global refresh of Card component with glass and pillow shadows"
```

---

### Task 4: Global Component Refresh (Buttons & Inputs)

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/ui/input.tsx`

- [ ] **Step 1: Update Button variants**
Add a glass-like feel to the primary and ghost buttons.

- [ ] **Step 2: Update Input styles**
Make inputs translucent with soft focus rings.

- [ ] **Step 3: Commit changes**
```bash
git add src/components/ui/button.tsx src/components/ui/input.tsx
git commit -m "style: update Button and Input components for glass aesthetic"
```

---

### Task 5: Sidebar & Header Polish

**Files:**
- Modify: `src/components/app/sidebar.tsx`
- Modify: `src/components/app/page-header.tsx`

- [ ] **Step 1: Make sidebar and header translucent**
Update `Sidebar` and `PageHeader` to use `bg-card/40` and `backdrop-blur-md`.

- [ ] **Step 2: Commit changes**
```bash
git add src/components/app/sidebar.tsx src/components/app/page-header.tsx
git commit -m "style: polish sidebar and header with translucency"
```

---

### Task 6: Precision Typography for Data

**Files:**
- Modify: `src/components/app/month-stats-row.tsx`
- Modify: `src/components/app/runway-card.tsx`
- Modify: `src/components/app/networth-mini-card.tsx`

- [ ] **Step 1: Switch numbers to Geist Mono**
Wrap all currency and number values in a span with `font-mono`.

- [ ] **Step 2: Commit changes**
```bash
git add src/components/app/month-stats-row.tsx src/components/app/runway-card.tsx src/components/app/networth-mini-card.tsx
git commit -m "style: apply precision typography (Geist Mono) to data points"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run typecheck**
Run: `npm run typecheck`

- [ ] **Step 2: Run lint**
Run: `npm run lint`

- [ ] **Step 3: Verify build**
Run: `npm run build`
