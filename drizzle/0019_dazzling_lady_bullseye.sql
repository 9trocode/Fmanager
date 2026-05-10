-- Drop the broken composite unique that let host (NULL owner_user_id)
-- accumulate dupes: SQLite treats NULLs as DISTINCT in UNIQUE
-- constraints, so `(NULL, "runway_critical_…")` matched no row and
-- every advisor check inserted a fresh copy.
DROP INDEX `advisor_alerts_dedup_uniq`;--> statement-breakpoint

-- One-time cleanup: any ACTIVE rows that share (owner_user_id,
-- dedup_key) get all-but-the-most-recent flagged as resolved-via-
-- dedup-cleanup. Without this the partial unique below would fail
-- to create on a DB that already has dupes (the prod state we're
-- patching).
--
-- Uses datetime('now') instead of CURRENT_TIMESTAMP to match the
-- ISO-8601 string the runtime writes via `new Date().toISOString()`,
-- so the `recently resolved/dismissed` UI surface keeps its sort
-- ordering consistent.
UPDATE `advisor_alerts`
SET `resolved_at` = datetime('now')
WHERE `dismissed_at` IS NULL
  AND `resolved_at` IS NULL
  AND `id` NOT IN (
    SELECT MAX(`id`) FROM `advisor_alerts`
    WHERE `dismissed_at` IS NULL
      AND `resolved_at` IS NULL
    GROUP BY `owner_user_id`, `dedup_key`
  );--> statement-breakpoint

-- Partial unique indexes — only over ACTIVE rows. Once an alert is
-- dismissed or resolved, its dedup slot frees up so the next legit
-- occurrence (next day's runway check, next month's budget alert)
-- fires fresh. Split host vs tenant to dodge SQLite's NULL-distinct
-- behavior in unique constraints.
CREATE UNIQUE INDEX `advisor_alerts_dedup_host_uniq`
  ON `advisor_alerts` (`dedup_key`)
  WHERE "advisor_alerts"."owner_user_id" IS NULL
    AND "advisor_alerts"."dismissed_at" IS NULL
    AND "advisor_alerts"."resolved_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `advisor_alerts_dedup_tenant_uniq`
  ON `advisor_alerts` (`owner_user_id`, `dedup_key`)
  WHERE "advisor_alerts"."owner_user_id" IS NOT NULL
    AND "advisor_alerts"."dismissed_at" IS NULL
    AND "advisor_alerts"."resolved_at" IS NULL;
