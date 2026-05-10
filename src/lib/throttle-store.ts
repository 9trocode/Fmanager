/**
 * Per-tenant throttle store with a hard cap on entry count.
 *
 * The flow-accrual + advisor-checks throttles both key by tenant
 * ("host" or "u<id>") and would otherwise be plain `Map<string, number>`s
 * that grow forever. At 10K tenants × 50 bytes/entry that's only
 * ~500KB — small in absolute terms, but it's a leak: process restarts
 * are the only thing that ever shrinks it.
 *
 * Capping at MAX_ENTRIES (default 5000) gives an LRU-ish bound: when
 * we'd exceed the cap, the oldest entry by insertion order is dropped.
 * Map iteration in JS is insertion order, so `Array.from(map.keys())[0]`
 * is the LRU. The downside of the dropped tenant is that they'll get
 * one un-throttled run on next request — fine, the throttle is a
 * cost optimization not a correctness gate.
 */

const DEFAULT_MAX = 5000;

export class ThrottleStore {
  private readonly map = new Map<string, number>();
  private readonly maxEntries: number;

  constructor(maxEntries = DEFAULT_MAX) {
    this.maxEntries = maxEntries;
  }

  /** Last-fired timestamp (ms epoch) for the key, or 0 if never. */
  get(key: string): number {
    return this.map.get(key) ?? 0;
  }

  /** Stamp key=now, evict oldest if we'd cross the cap. */
  set(key: string, value: number): void {
    if (!this.map.has(key) && this.map.size >= this.maxEntries) {
      // Evict oldest (insertion order). Map iterators yield keys in
      // insertion order, so .keys().next() is the first inserted.
      const oldest = this.map.keys().next().value;
      if (oldest != null) this.map.delete(oldest);
    }
    // Re-insert refreshes order, keeping recently-touched entries young.
    this.map.delete(key);
    this.map.set(key, value);
  }
}
