CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE sku_ad_setups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('shopee', 'tokopedia', 'tiktok', 'offline')),
  objective TEXT NOT NULL,
  daily_budget_cap NUMERIC(12, 2) NOT NULL CHECK (daily_budget_cap >= 0),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL CHECK (status IN ('active', 'paused', 'ended')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku, channel, start_date),
  CHECK (end_date IS NULL OR end_date >= start_date)
);

ALTER TABLE sku_ad_setups
ADD CONSTRAINT sku_ad_setups_no_overlap
EXCLUDE USING gist (
  sku WITH =,
  channel WITH =,
  daterange(start_date, COALESCE(end_date + 1, 'infinity'::date), '[)') WITH &&
);

CREATE TABLE monthly_ad_spend (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  channel TEXT NOT NULL CHECK (channel IN ('shopee', 'tokopedia', 'tiktok', 'offline')),
  actual_spend NUMERIC(12, 2) NOT NULL CHECK (actual_spend >= 0),
  notes TEXT,
  finance_entry_id UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, sku, channel),
  CHECK (month = date_trunc('month', month::timestamp)::date)
);

CREATE TABLE sku_sales_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  daily_target_units INTEGER NOT NULL CHECK (daily_target_units >= 0),
  effective_from DATE NOT NULL,
  effective_to DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

ALTER TABLE sku_sales_targets
ADD CONSTRAINT sku_sales_targets_no_overlap
EXCLUDE USING gist (
  sku WITH =,
  daterange(effective_from, COALESCE(effective_to + 1, 'infinity'::date), '[)') WITH &&
);

CREATE INDEX IF NOT EXISTS idx_sku_ad_setups_sku_channel
  ON sku_ad_setups(sku, channel);

CREATE INDEX IF NOT EXISTS idx_sku_ad_setups_status_start_date
  ON sku_ad_setups(status, start_date DESC);

CREATE INDEX IF NOT EXISTS idx_monthly_ad_spend_month_channel
  ON monthly_ad_spend(month DESC, channel);

CREATE INDEX IF NOT EXISTS idx_monthly_ad_spend_sku
  ON monthly_ad_spend(sku);

CREATE INDEX IF NOT EXISTS idx_monthly_ad_spend_finance_entry
  ON monthly_ad_spend(finance_entry_id);

CREATE INDEX IF NOT EXISTS idx_sku_sales_targets_sku_effective_from
  ON sku_sales_targets(sku, effective_from DESC);

DROP TRIGGER IF EXISTS update_sku_ad_setups_updated_at ON sku_ad_setups;
CREATE TRIGGER update_sku_ad_setups_updated_at
BEFORE UPDATE ON sku_ad_setups
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_monthly_ad_spend_updated_at ON monthly_ad_spend;
CREATE TRIGGER update_monthly_ad_spend_updated_at
BEFORE UPDATE ON monthly_ad_spend
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_sku_sales_targets_updated_at ON sku_sales_targets;
CREATE TRIGGER update_sku_sales_targets_updated_at
BEFORE UPDATE ON sku_sales_targets
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE sku_ad_setups ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_ad_spend ENABLE ROW LEVEL SECURITY;
ALTER TABLE sku_sales_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to sku_ad_setups" ON sku_ad_setups;
CREATE POLICY "Allow authenticated users full access to sku_ad_setups"
ON sku_ad_setups FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to monthly_ad_spend" ON monthly_ad_spend;
CREATE POLICY "Allow authenticated users full access to monthly_ad_spend"
ON monthly_ad_spend FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to sku_sales_targets" ON sku_sales_targets;
CREATE POLICY "Allow authenticated users full access to sku_sales_targets"
ON sku_sales_targets FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

COMMENT ON TABLE sku_ad_setups IS 'SKU and channel level ads configuration with daily budget caps.';
COMMENT ON TABLE monthly_ad_spend IS 'Month-end actual ad spend captured per SKU and sales channel.';
COMMENT ON TABLE sku_sales_targets IS 'Daily unit sales targets per SKU with effective date ranges.';
COMMENT ON COLUMN monthly_ad_spend.month IS 'Month bucket stored as the first day of the month.';
COMMENT ON COLUMN monthly_ad_spend.finance_entry_id IS 'Optional finance entry linked to the month-end ad spend posting.';
