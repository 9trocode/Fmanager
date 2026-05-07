-- Drop any existing duplicates from the pre-fix accruer that crashed
-- mid-loop and rerun, posting the same flow period twice. Keep the
-- earliest id per group so user-edited notes/amounts on the original
-- row are preserved.
DELETE FROM `transactions`
WHERE `flow_id` IS NOT NULL
  AND `id` NOT IN (
    SELECT MIN(`id`)
    FROM `transactions`
    WHERE `flow_id` IS NOT NULL
    GROUP BY `flow_id`, `occurred_at`
  );
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_flow_occurred_uniq` ON `transactions` (`flow_id`,`occurred_at`) WHERE "transactions"."flow_id" IS NOT NULL;