CREATE TABLE IF NOT EXISTS monthly_kpi_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month DATE NOT NULL,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  target_units INTEGER NOT NULL DEFAULT 0 CHECK (target_units >= 0),
  target_revenue DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (target_revenue >= 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(month, sku)
);

CREATE TRIGGER update_monthly_kpi_targets_updated_at
BEFORE UPDATE ON monthly_kpi_targets
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_monthly_kpi_targets_month
ON monthly_kpi_targets(month);

CREATE INDEX IF NOT EXISTS idx_monthly_kpi_targets_sku
ON monthly_kpi_targets(sku);

ALTER TABLE monthly_kpi_targets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to monthly_kpi_targets"
ON monthly_kpi_targets FOR ALL
USING (auth.role() = 'authenticated');
