CREATE TABLE IF NOT EXISTS finance_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('bank', 'cash', 'ewallet')),
  currency TEXT NOT NULL DEFAULT 'IDR',
  opening_balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_finance_accounts_updated_at ON finance_accounts;
CREATE TRIGGER update_finance_accounts_updated_at
BEFORE UPDATE ON finance_accounts
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS finance_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('operating_expense', 'other_income', 'inventory_purchase', 'transfer', 'adjustment')),
  group_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS update_finance_categories_updated_at ON finance_categories;
CREATE TRIGGER update_finance_categories_updated_at
BEFORE UPDATE ON finance_categories
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS finance_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  category_id UUID NOT NULL REFERENCES finance_categories(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automatic')),
  reference_type TEXT,
  reference_id TEXT,
  vendor TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_finance_entries_date ON finance_entries(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_account_date ON finance_entries(account_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_entries_category_date ON finance_entries(category_id, entry_date DESC);

DROP TRIGGER IF EXISTS update_finance_entries_updated_at ON finance_entries;
CREATE TRIGGER update_finance_entries_updated_at
BEFORE UPDATE ON finance_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS finance_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  from_account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  to_account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_account_id <> to_account_id)
);

CREATE INDEX IF NOT EXISTS idx_finance_transfers_date ON finance_transfers(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_from_account_date ON finance_transfers(from_account_id, entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_finance_transfers_to_account_date ON finance_transfers(to_account_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS inventory_purchase_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date DATE NOT NULL,
  vendor TEXT,
  account_id UUID NOT NULL REFERENCES finance_accounts(id) ON DELETE RESTRICT,
  finance_entry_id UUID REFERENCES finance_entries(id) ON DELETE SET NULL,
  total_amount DECIMAL(12, 2) NOT NULL CHECK (total_amount > 0),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batches_date ON inventory_purchase_batches(entry_date DESC);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batches_account_date ON inventory_purchase_batches(account_id, entry_date DESC);

CREATE TABLE IF NOT EXISTS inventory_purchase_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id UUID NOT NULL REFERENCES inventory_purchase_batches(id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost DECIMAL(12, 2) NOT NULL CHECK (unit_cost >= 0),
  total_cost DECIMAL(12, 2) NOT NULL CHECK (total_cost >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batch_items_batch ON inventory_purchase_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batch_items_sku ON inventory_purchase_batch_items(sku);

ALTER TABLE finance_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchase_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_purchase_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to finance_accounts" ON finance_accounts;
CREATE POLICY "Allow authenticated users full access to finance_accounts"
ON finance_accounts FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to finance_categories" ON finance_categories;
CREATE POLICY "Allow authenticated users full access to finance_categories"
ON finance_categories FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to finance_entries" ON finance_entries;
CREATE POLICY "Allow authenticated users full access to finance_entries"
ON finance_entries FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to finance_transfers" ON finance_transfers;
CREATE POLICY "Allow authenticated users full access to finance_transfers"
ON finance_transfers FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to inventory_purchase_batches" ON inventory_purchase_batches;
CREATE POLICY "Allow authenticated users full access to inventory_purchase_batches"
ON inventory_purchase_batches FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to inventory_purchase_batch_items" ON inventory_purchase_batch_items;
CREATE POLICY "Allow authenticated users full access to inventory_purchase_batch_items"
ON inventory_purchase_batch_items FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

INSERT INTO finance_categories (name, kind, group_name, sort_order)
VALUES
  ('Advertising', 'operating_expense', 'ads', 10),
  ('Salary', 'operating_expense', 'payroll', 20),
  ('Rent', 'operating_expense', 'facility', 30),
  ('Software', 'operating_expense', 'software', 40),
  ('Packaging', 'operating_expense', 'fulfillment', 50),
  ('Shipping Expense', 'operating_expense', 'fulfillment', 60),
  ('Tax', 'operating_expense', 'tax', 70),
  ('Misc Expense', 'operating_expense', 'misc', 80),
  ('Other Income', 'other_income', 'other_income', 90),
  ('Inventory Purchase', 'inventory_purchase', 'procurement', 100),
  ('Balance Adjustment', 'adjustment', 'adjustment', 110),
  ('Transfer', 'transfer', 'transfer', 120)
ON CONFLICT (name) DO NOTHING;

COMMENT ON TABLE finance_accounts IS 'Cash and bank accounts used for operating cash flow tracking.';
COMMENT ON TABLE finance_categories IS 'Categories for operating expenses, other income, inventory purchases, transfers, and adjustments.';
COMMENT ON TABLE finance_entries IS 'Manual and automatic finance entries that move cash in or out of an account.';
COMMENT ON TABLE finance_transfers IS 'Internal transfers between finance accounts; excluded from P&L.';
COMMENT ON TABLE inventory_purchase_batches IS 'Stock procurement batches that link finance cash-out with inventory purchase ledger entries.';
COMMENT ON TABLE inventory_purchase_batch_items IS 'Individual products and quantities purchased in an inventory procurement batch.';
