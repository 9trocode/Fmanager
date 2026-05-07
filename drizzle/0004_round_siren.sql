CREATE INDEX `chat_messages_session_created_idx` ON `chat_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `chat_messages_session_client_idx` ON `chat_messages` (`session_id`,`client_id`);--> statement-breakpoint
CREATE INDEX `recurring_flows_account_idx` ON `recurring_flows` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_occurred_at_idx` ON `transactions` (`occurred_at`);--> statement-breakpoint
CREATE INDEX `transactions_account_idx` ON `transactions` (`account_id`);--> statement-breakpoint
CREATE INDEX `transactions_dest_account_idx` ON `transactions` (`dest_account_id`);--> statement-breakpoint
CREATE INDEX `transactions_category_idx` ON `transactions` (`category`);--> statement-breakpoint
CREATE INDEX `transactions_flow_idx` ON `transactions` (`flow_id`);--> statement-breakpoint
CREATE INDEX `transactions_account_occurred_idx` ON `transactions` (`account_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `value_snapshots_account_as_of_idx` ON `value_snapshots` (`account_id`,`as_of`);