CREATE TABLE `user_settings` (
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`value` text,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_key_uniq` ON `user_settings` (`user_id`,`key`);