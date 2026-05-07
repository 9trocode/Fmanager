CREATE INDEX `accounts_archived_idx` ON `accounts` (`archived`);--> statement-breakpoint
CREATE INDEX `budgets_account_idx` ON `budgets` (`account_id`);--> statement-breakpoint
CREATE INDEX `decisions_status_idx` ON `decisions` (`status`);--> statement-breakpoint
CREATE INDEX `equity_grants_account_idx` ON `equity_grants` (`account_id`);--> statement-breakpoint
CREATE INDEX `fx_rates_pair_fetched_idx` ON `fx_rates` (`base`,`quote`,`fetched_at`);--> statement-breakpoint
CREATE INDEX `recurring_flows_archived_idx` ON `recurring_flows` (`archived`);--> statement-breakpoint
CREATE INDEX `savings_goals_archived_idx` ON `savings_goals` (`archived`);--> statement-breakpoint
CREATE INDEX `savings_goals_account_idx` ON `savings_goals` (`account_id`);