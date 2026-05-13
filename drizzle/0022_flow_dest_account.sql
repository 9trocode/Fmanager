-- Optional destination account on recurring flows. When set on an
-- expense flow, the flow represents an internal transfer (e.g. monthly
-- savings contribution: leaves checking, lands in a savings account
-- tied to a goal). Auto-accrual posts a `transfer` transaction so the
-- destination's balance grows automatically, and monthly cash-flow
-- math skips it from burn since it's not money leaving the user's
-- wealth — just moving between their own accounts.

ALTER TABLE `recurring_flows`
  ADD COLUMN `dest_account_id` integer REFERENCES `accounts`(`id`) ON DELETE SET NULL;
