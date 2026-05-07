/**
 * Date helpers that always operate in the SERVER's local timezone.
 *
 * Transactions, snapshots, and goal start dates are stored as date-only
 * `YYYY-MM-DD` strings — those are the same shape an `<input type="date">`
 * emits, which is local-time by design.
 *
 * If we use `new Date().toISOString().slice(0, 10)` instead, we get UTC.
 * That breaks for users in non-UTC timezones near midnight: an 11:30 PM
 * Lagos (UTC+1) transaction lands on the *next* day in UTC, gets logged
 * with tomorrow's date, and disappears from the current month's budget.
 *
 * Self-hosted Docker images respect the `TZ` env var (set on the host or
 * in the container) — picking a sensible TZ once is enough.
 */

/**
 * `YYYY-MM-DD` of *today*, in the server's local timezone.
 * Drop-in replacement for `new Date().toISOString().slice(0, 10)`.
 */
export function localToday(): string {
  return localYmd(new Date());
}

/**
 * `YYYY-MM-DD` of any Date, in local time. Equivalent to the way the
 * native `<input type="date">` serialises its value.
 */
export function localYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
