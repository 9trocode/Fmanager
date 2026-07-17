CREATE TABLE `debt_plans` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `loan_account_id` integer NOT NULL,
  `source_account_id` integer NOT NULL,
  `monthly_payment` real NOT NULL,
  `currency` text NOT NULL,
  `next_payment_date` text NOT NULL,
  `active` integer DEFAULT true NOT NULL,
  `notes` text,
  `owner_user_id` integer,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  `updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (`loan_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`source_account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE UNIQUE INDEX `debt_plans_loan_account_uniq` ON `debt_plans` (`loan_account_id`);--> statement-breakpoint
CREATE INDEX `debt_plans_owner_idx` ON `debt_plans` (`owner_user_id`);--> statement-breakpoint
CREATE INDEX `debt_plans_owner_active_due_idx` ON `debt_plans` (`owner_user_id`, `active`, `next_payment_date`);--> statement-breakpoint

CREATE TABLE `debt_payments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `plan_id` integer NOT NULL,
  `paid_at` text NOT NULL,
  `total_amount` real NOT NULL,
  `principal_amount` real NOT NULL,
  `interest_amount` real NOT NULL,
  `remaining_balance` real NOT NULL,
  `currency` text NOT NULL,
  `previous_next_payment_date` text NOT NULL,
  `owner_user_id` integer,
  `created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
  FOREIGN KEY (`plan_id`) REFERENCES `debt_plans`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `debt_payments_plan_paid_idx` ON `debt_payments` (`plan_id`, `paid_at`);--> statement-breakpoint
CREATE INDEX `debt_payments_owner_idx` ON `debt_payments` (`owner_user_id`);--> statement-breakpoint

ALTER TABLE `transactions` ADD `debt_payment_id` integer;--> statement-breakpoint
CREATE INDEX `transactions_debt_payment_idx` ON `transactions` (`debt_payment_id`);--> statement-breakpoint

-- Debt plans can restrict deletion of their funding account. Replace the
-- member-cleanup trigger so owned plans are removed before owned accounts,
-- while malformed cross-owner references still fail closed.
DROP TRIGGER `users_delete_owned_data`;--> statement-breakpoint
CREATE TRIGGER `users_delete_owned_data`
BEFORE DELETE ON `users`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN
    EXISTS (
      SELECT 1
      FROM `value_snapshots` AS `snapshot`
      JOIN `accounts` AS `account` ON `account`.`id` = `snapshot`.`account_id`
      WHERE `account`.`owner_user_id` = OLD.`id`
        AND `snapshot`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `transactions` AS `transaction`
      JOIN `accounts` AS `account` ON `account`.`id` = `transaction`.`account_id`
      WHERE `account`.`owner_user_id` = OLD.`id`
        AND `transaction`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `recurring_flow_overrides` AS `override`
      JOIN `recurring_flows` AS `flow` ON `flow`.`id` = `override`.`flow_id`
      WHERE `flow`.`owner_user_id` = OLD.`id`
        AND `override`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `budget_overrides` AS `override`
      JOIN `budgets` AS `budget` ON `budget`.`id` = `override`.`budget_id`
      WHERE `budget`.`owner_user_id` = OLD.`id`
        AND `override`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `debt_plans` AS `plan`
      JOIN `accounts` AS `account` ON `account`.`id` = `plan`.`loan_account_id`
      WHERE `account`.`owner_user_id` = OLD.`id`
        AND `plan`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `debt_plans` AS `plan`
      JOIN `accounts` AS `account` ON `account`.`id` = `plan`.`source_account_id`
      WHERE `account`.`owner_user_id` = OLD.`id`
        AND `plan`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `debt_payments` AS `payment`
      JOIN `debt_plans` AS `plan` ON `plan`.`id` = `payment`.`plan_id`
      WHERE `plan`.`owner_user_id` = OLD.`id`
        AND `payment`.`owner_user_id` IS NOT OLD.`id`
    )
    OR EXISTS (
      SELECT 1
      FROM `transactions` AS `transaction`
      JOIN `debt_payments` AS `payment` ON `payment`.`id` = `transaction`.`debt_payment_id`
      WHERE `payment`.`owner_user_id` = OLD.`id`
        AND `transaction`.`owner_user_id` IS NOT OLD.`id`
    )
    THEN RAISE(ABORT, 'cross-owner reference prevents member deletion')
  END;

  DELETE FROM `debt_plans` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `advisor_alerts` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `saved_scenarios` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `transactions` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `value_snapshots` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `equity_grants` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `recurring_flows` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `budgets` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `decisions` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `prediction_sessions` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `chat_sessions` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `savings_goals` WHERE `owner_user_id` = OLD.`id`;
  DELETE FROM `accounts` WHERE `owner_user_id` = OLD.`id`;
END;
