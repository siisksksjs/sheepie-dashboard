ALTER TABLE sku_ad_setups
ADD COLUMN channels TEXT[],
ADD COLUMN channel_scope_key TEXT;

UPDATE sku_ad_setups
SET
  channels = ARRAY[channel],
  channel_scope_key = channel
WHERE channels IS NULL OR channel_scope_key IS NULL;

ALTER TABLE sku_ad_setups
ALTER COLUMN channels SET NOT NULL,
ALTER COLUMN channel_scope_key SET NOT NULL;

ALTER TABLE sku_ad_setups
ADD CONSTRAINT sku_ad_setups_channels_check
CHECK (
  cardinality(channels) > 0
  AND channels <@ ARRAY['shopee', 'tokopedia', 'tiktok', 'offline']::text[]
);

ALTER TABLE sku_ad_setups
DROP CONSTRAINT IF EXISTS sku_ad_setups_no_overlap,
DROP CONSTRAINT IF EXISTS sku_ad_setups_sku_channel_start_date_key;

DROP INDEX IF EXISTS idx_sku_ad_setups_sku_channel;

ALTER TABLE sku_ad_setups
ADD CONSTRAINT sku_ad_setups_sku_scope_start_date_key
UNIQUE (sku, channel_scope_key, start_date);

ALTER TABLE sku_ad_setups
ADD CONSTRAINT sku_ad_setups_no_scope_overlap
EXCLUDE USING gist (
  sku WITH =,
  channel_scope_key WITH =,
  daterange(start_date, COALESCE(end_date + 1, 'infinity'::date), '[)') WITH &&
);

CREATE INDEX IF NOT EXISTS idx_sku_ad_setups_sku_scope
  ON sku_ad_setups(sku, channel_scope_key);

ALTER TABLE sku_ad_setups
DROP COLUMN channel;

ALTER TABLE monthly_ad_spend
ADD COLUMN channels TEXT[],
ADD COLUMN channel_scope_key TEXT;

UPDATE monthly_ad_spend
SET
  channels = ARRAY[channel],
  channel_scope_key = channel
WHERE channels IS NULL OR channel_scope_key IS NULL;

ALTER TABLE monthly_ad_spend
ALTER COLUMN channels SET NOT NULL,
ALTER COLUMN channel_scope_key SET NOT NULL;

ALTER TABLE monthly_ad_spend
ADD CONSTRAINT monthly_ad_spend_channels_check
CHECK (
  cardinality(channels) > 0
  AND channels <@ ARRAY['shopee', 'tokopedia', 'tiktok', 'offline']::text[]
);

ALTER TABLE monthly_ad_spend
DROP CONSTRAINT IF EXISTS monthly_ad_spend_month_sku_channel_key;

DROP INDEX IF EXISTS idx_monthly_ad_spend_month_channel;

ALTER TABLE monthly_ad_spend
ADD CONSTRAINT monthly_ad_spend_month_sku_scope_key
UNIQUE (month, sku, channel_scope_key);

CREATE INDEX IF NOT EXISTS idx_monthly_ad_spend_month_scope
  ON monthly_ad_spend(month DESC, channel_scope_key);

ALTER TABLE monthly_ad_spend
DROP COLUMN channel;

COMMENT ON COLUMN sku_ad_setups.channels IS 'Selected sales channels covered by the shared ads setup.';
COMMENT ON COLUMN sku_ad_setups.channel_scope_key IS 'Canonical sorted channel key used for uniqueness and overlap protection.';
COMMENT ON COLUMN monthly_ad_spend.channels IS 'Selected sales channels covered by the shared monthly spend row.';
COMMENT ON COLUMN monthly_ad_spend.channel_scope_key IS 'Canonical sorted channel key used for unique month+SKU spend rows.';
