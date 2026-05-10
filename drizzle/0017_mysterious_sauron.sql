CREATE INDEX `accounts_owner_archived_idx` ON `accounts` (`owner_user_id`,`archived`);--> statement-breakpoint
CREATE INDEX `advisor_alerts_owner_active_idx` ON `advisor_alerts` (`owner_user_id`,`dismissed_at`,`resolved_at`);--> statement-breakpoint
CREATE INDEX `recurring_flows_owner_archived_idx` ON `recurring_flows` (`owner_user_id`,`archived`);--> statement-breakpoint
CREATE INDEX `savings_goals_owner_archived_idx` ON `savings_goals` (`owner_user_id`,`archived`);--> statement-breakpoint
CREATE INDEX `transactions_owner_category_occurred_idx` ON `transactions` (`owner_user_id`,`category`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_owner_kind_occurred_idx` ON `transactions` (`owner_user_id`,`kind`,`occurred_at`);