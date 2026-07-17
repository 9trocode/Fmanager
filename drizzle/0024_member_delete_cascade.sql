-- Migration 0014 added owner_user_id with SQLite's default ON DELETE NO ACTION,
-- even though the Drizzle schema declares ON DELETE CASCADE. Keep member
-- removal atomic for existing databases by deleting those owned rows in a
-- BEFORE DELETE trigger. Child tables retain their existing cascade/set-null
-- behavior as each owned parent is removed.
CREATE TRIGGER `users_delete_owned_data`
BEFORE DELETE ON `users`
FOR EACH ROW
BEGIN
  -- Account snapshots and source-account transactions use ON DELETE CASCADE.
  -- Fail closed if legacy/corrupt data points another owner at this member's
  -- account; deleting that row would otherwise erase the other owner's data.
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
    THEN RAISE(ABORT, 'cross-owner reference prevents member deletion')
  END;

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
