ALTER TABLE `invites` ADD `data_scope` text DEFAULT 'shared' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `data_scope` text DEFAULT 'shared' NOT NULL;