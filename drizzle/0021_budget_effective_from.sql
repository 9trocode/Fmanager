-- Per-budget "starts existing in this month" marker. When set,
-- budget rows with effective_from > the viewed month are filtered
-- out of computeBudgetStatus — they don't appear in past/current
-- months when the user added them on a future-month view.

ALTER TABLE `budgets` ADD COLUMN `effective_from` text;
