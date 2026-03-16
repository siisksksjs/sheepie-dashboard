ALTER TABLE finance_categories
DROP CONSTRAINT IF EXISTS finance_categories_kind_check;

ALTER TABLE finance_categories
ADD CONSTRAINT finance_categories_kind_check
CHECK (kind IN (
  'operating_expense',
  'other_income',
  'inventory_purchase',
  'marketplace_settlement',
  'transfer',
  'adjustment'
));

INSERT INTO finance_categories (name, kind, group_name, sort_order)
VALUES ('Marketplace Settlement', 'marketplace_settlement', 'marketplace', 95)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS marketplace_channel_accounts (
  channel TEXT PRIMARY KEY CHECK (channel IN ('shopee', 'tokopedia', 'tiktok', 'offline')),
  finance_account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_reference
ON finance_entries(reference_type, reference_id);

DROP TRIGGER IF EXISTS update_marketplace_channel_accounts_updated_at ON marketplace_channel_accounts;
CREATE TRIGGER update_marketplace_channel_accounts_updated_at
BEFORE UPDATE ON marketplace_channel_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE marketplace_channel_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to marketplace_channel_accounts" ON marketplace_channel_accounts;
CREATE POLICY "Allow authenticated users full access to marketplace_channel_accounts"
ON marketplace_channel_accounts FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

COMMENT ON TABLE marketplace_channel_accounts IS 'Maps sales channels to finance accounts so marketplace orders can update the correct balance automatically.';
