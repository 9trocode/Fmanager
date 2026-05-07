/**
 * Decorative radial gradient backdrop for page hero areas. Pure CSS, no
 * client JS, no images. Two soft orbs blending into the page background to
 * give surfaces depth without being noisy.
 *
 * Place this once near the top of a page; it's `absolute` positioned and
 * pointer-events-none so it never intercepts clicks.
 */
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
