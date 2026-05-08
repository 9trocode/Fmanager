CREATE TABLE `prediction_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`client_id` text NOT NULL,
	`role` text NOT NULL,
	`payload_json` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `prediction_sessions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `prediction_messages_session_created_idx` ON `prediction_messages` (`session_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `prediction_messages_session_client_idx` ON `prediction_messages` (`session_id`,`client_id`);--> statement-breakpoint
CREATE TABLE `prediction_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text DEFAULT 'New prediction' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
