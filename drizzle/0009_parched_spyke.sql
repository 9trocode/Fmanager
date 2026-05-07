CREATE TABLE `advisor_alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`action_url` text,
	`context_json` text,
	`dedup_key` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`dismissed_at` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `advisor_alerts_dedup_uniq` ON `advisor_alerts` (`dedup_key`);--> statement-breakpoint
CREATE INDEX `advisor_alerts_active_idx` ON `advisor_alerts` (`dismissed_at`,`resolved_at`,`created_at`);