CREATE TABLE `saved_scenarios` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`rationale` text,
	`inputs_json` text NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`goal_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`goal_id`) REFERENCES `savings_goals`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `saved_scenarios_created_idx` ON `saved_scenarios` (`created_at`);--> statement-breakpoint
CREATE INDEX `saved_scenarios_goal_idx` ON `saved_scenarios` (`goal_id`);