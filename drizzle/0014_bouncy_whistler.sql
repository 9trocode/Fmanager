DROP INDEX `budgets_category_currency`;--> statement-breakpoint
ALTER TABLE `budgets` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `budgets_owner_idx` ON `budgets` (`owner_user_id`);--> statement-breakpoint
DROP INDEX `advisor_alerts_dedup_uniq`;--> statement-breakpoint
ALTER TABLE `advisor_alerts` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `advisor_alerts_owner_idx` ON `advisor_alerts` (`owner_user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `advisor_alerts_dedup_uniq` ON `advisor_alerts` (`owner_user_id`,`dedup_key`);--> statement-breakpoint
ALTER TABLE `accounts` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `accounts_owner_idx` ON `accounts` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `chat_sessions` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `chat_sessions_owner_idx` ON `chat_sessions` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `decisions` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `decisions_owner_idx` ON `decisions` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `equity_grants` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `equity_grants_owner_idx` ON `equity_grants` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `prediction_sessions` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `prediction_sessions_owner_idx` ON `prediction_sessions` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `recurring_flows` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `recurring_flows_owner_idx` ON `recurring_flows` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `saved_scenarios` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `saved_scenarios_owner_idx` ON `saved_scenarios` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `savings_goals` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `savings_goals_owner_idx` ON `savings_goals` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `transactions` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `transactions_owner_idx` ON `transactions` (`owner_user_id`);--> statement-breakpoint
ALTER TABLE `value_snapshots` ADD `owner_user_id` integer REFERENCES users(id);--> statement-breakpoint
CREATE INDEX `value_snapshots_owner_idx` ON `value_snapshots` (`owner_user_id`);