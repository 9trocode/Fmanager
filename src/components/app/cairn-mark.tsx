/**
 * Brand mark for Cairn — three stacked stones marking a path.
 *
 * Pure SVG so it scales cleanly at any size; renders inside the
 * existing rounded-square gradient avatars used across the sidebar,
 * login page, advisor chat avatar, etc. Pass `withFrame` for the
 * full bordered container, or render bare for inline use inside an
 * already-styled wrapper.
 */
export function CairnMark({
  size = 32,
  className = "",
  bare = false,
}: {
  size?: number;
  className?: string;
  /**
   * When true, render only the stones (no gradient background +
   * rounded-square frame). Use this when the parent already supplies
   * a styled box (e.g. the gradient avatar circles in the sidebar).
   */
  bare?: boolean;
}) {
  if (bare) {
    return (
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        className={className}
        fill="currentColor"
        aria-hidden
      >
        <ellipse cx="16" cy="24" rx="9" ry="3" />
        <ellipse cx="16.5" cy="18.5" rx="6.5" ry="2.6" />
        <ellipse
          cx="16"
          cy="13.5"
          rx="4.2"
          ry="2.3"
          transform="rotate(-6 16 13.5)"
        />
      </svg>
    );
  }
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <linearGradient id="cairn-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--primary)" />
          <stop offset="100%" stopColor="color-mix(in oklab, var(--primary) 70%, transparent)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#cairn-bg)" />
      <ellipse cx="16" cy="24" rx="9" ry="3" fill="currentColor" />
      <ellipse cx="16.5" cy="18.5" rx="6.5" ry="2.6" fill="currentColor" />
      <ellipse
        cx="16"
        cy="13.5"
        rx="4.2"
        ry="2.3"
        fill="currentColor"
        transform="rotate(-6 16 13.5)"
      />
    </svg>
  );
}
