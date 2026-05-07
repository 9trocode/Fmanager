# Design Spec: Premium & Calm "Glass-Light" Polish

## Overview
This design performs a surgical visual upgrade to the Founder Finance project, transforming its "clean but standard" look into a "Premium & Calm" experience. The core layout (sidebar, grid, navigation) remains unchanged to preserve familiarity and reliability, while every surface, font, and interaction is elevated.

## Visual Language: "The Glass House"
The aesthetic is defined by depth, translucency, and soft edges. It aims to feel like a high-end private wealth management tool—sophisticated, quiet, and trustworthy.

### 1. Foundations: Palette & Depth
- **Backgrounds:** Shifting from pure white/black to soft off-white and charcoal using OKLCH.
- **Translucency:** Surfaces will use `backdrop-blur-md` (12px) and semi-transparent backgrounds (`bg-card/40`) to create a sense of layering.
- **The Aurora:** The `HeroBackground` will be updated with 3-4 oversized, low-opacity colored orbs that use subtle `animate-pulse` and `blur-3xl` to create a "living" canvas behind the UI.

### 2. Surface & Components
- **Cards:**
  - **Radius:** Increase from `rounded-xl` to `rounded-2xl` for a softer feel.
  - **Borders:** Replace harsh borders with ultra-thin `1px` rim-lights (`border-white/10` in light mode).
  - **Shadows:** Multi-layered "Pillow" shadows (e.g., `0 8px 32px rgba(0,0,0,0.04)`) to create depth without noise.
  - **Interactions:** Subtle hover elevation (lift 1-2px) with deepened shadows.
- **Inputs & Buttons:**
  - Translucent glass backgrounds.
  - Focus states using a soft glow rather than a hard ring.

### 3. Typography
- **Geist Sans:** Primary font for all text, optimized with `tracking-tight`.
- **Geist Mono:** Reserved for all **monetary values, percentages, and dates**. This provides a precise, mathematical "fintech" contrast to the soft UI.

## Implementation Strategy
1. **Global CSS Update (`src/app/globals.css`):**
   - Redefine OKLCH variables for surfaces.
   - Add custom "glass" and "pillow shadow" utilities.
2. **Component Refresh (`src/components/ui/`):**
   - Update `Card`, `Button`, `Input`, and `Badge` to adopt the glass aesthetic globally.
3. **Background Update (`src/components/app/hero-background.tsx`):**
   - Implement the "Aurora" drift and pulse effects.
4. **Data Presentation:**
   - Update `MonthStatsRow`, `RunwayCard`, and other data-heavy components to use `Geist Mono` for numbers.

## Success Criteria
- The app feels "expensive" and calm.
- All functional layouts remain intact.
- High accessibility is maintained through careful contrast on translucent surfaces.
