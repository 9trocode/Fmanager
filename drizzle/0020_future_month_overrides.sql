-- Per-month overrides for recurring flow amounts and budget caps.
-- Written when the user edits a flow/budget while filtered to a FUTURE
-- month, so projections for that month change without retroactively
-- bumping past/current month values. Projection-only — auto-accrual
-- still uses the base row when the month arrives.

CREATE TABLE `recurring_flow_overrides` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `flow_id` integer NOT NULL,
  `month_key` text NOT NULL,
  `amount` real NOT NULL,
  `currency` text NOT NULL,
  `owner_user_id` integer,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (`flow_id`) REFERENCES `recurring_flows`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE INDEX `recurring_flow_overrides_flow_idx`
  ON `recurring_flow_overrides` (`flow_id`);--> statement-breakpoint
CREATE INDEX `recurring_flow_overrides_month_idx`
  ON `recurring_flow_overrides` (`month_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `recurring_flow_overrides_flow_month_uniq`
  ON `recurring_flow_overrides` (`flow_id`, `month_key`);--> statement-breakpoint

CREATE TABLE `budget_overrides` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `budget_id` integer NOT NULL,
  `month_key` text NOT NULL,
  `monthly_limit` real NOT NULL,
  `currency` text NOT NULL,
  `owner_user_id` integer,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (`budget_id`) REFERENCES `budgets`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

CREATE INDEX `budget_overrides_budget_idx`
  ON `budget_overrides` (`budget_id`);--> statement-breakpoint
CREATE INDEX `budget_overrides_month_idx`
  ON `budget_overrides` (`month_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `budget_overrides_budget_month_uniq`
  ON `budget_overrides` (`budget_id`, `month_key`);
