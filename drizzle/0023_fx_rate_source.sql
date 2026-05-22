-- Adds a `source` column to fx_rates so the host can override individual
-- pairs when the upstream provider disagrees with reality (e.g. parallel
-- NGN markets vs the API's official rate). Existing rows are "api";
-- manually entered overrides land as "manual" and beat any fetched rate
-- regardless of fetched_at age in getRate().

ALTER TABLE `fx_rates`
  ADD COLUMN `source` text NOT NULL DEFAULT 'api';

-- Lets getRate() find "latest manual for pair" in one b-tree walk.
CREATE INDEX `fx_rates_pair_source_fetched_idx`
  ON `fx_rates` (`base`, `quote`, `source`, `fetched_at`);
