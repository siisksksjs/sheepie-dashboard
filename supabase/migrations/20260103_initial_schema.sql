-- Phase 1: Core Inventory Schema

-- Products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  variant TEXT,
  cost_per_unit DECIMAL(10, 2) NOT NULL,
  reorder_point INTEGER NOT NULL DEFAULT 0,
  is_bundle BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discontinued')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent SKU updates (SKU is immutable)
CREATE OR REPLACE FUNCTION prevent_sku_update()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.sku IS DISTINCT FROM NEW.sku THEN
    RAISE EXCEPTION 'SKU cannot be modified';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_sku_update_trigger
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION prevent_sku_update();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Inventory ledger (append-only)
CREATE TABLE IF NOT EXISTS inventory_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL CHECK (movement_type IN ('IN_PURCHASE', 'OUT_SALE', 'OUT_PROMO', 'OUT_DAMAGE', 'RETURN', 'ADJUSTMENT')),
  quantity INTEGER NOT NULL,
  reference TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Prevent ledger deletes (immutable ledger)
CREATE OR REPLACE FUNCTION prevent_ledger_delete()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Ledger entries cannot be deleted. Use ADJUSTMENT entries to correct mistakes.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_ledger_delete_trigger
BEFORE DELETE ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_delete();

-- Allow updates only to non-critical fields (reference notes)
CREATE OR REPLACE FUNCTION prevent_ledger_critical_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow updates to reference field only
  IF OLD.sku IS DISTINCT FROM NEW.sku OR
     OLD.movement_type IS DISTINCT FROM NEW.movement_type OR
     OLD.quantity IS DISTINCT FROM NEW.quantity OR
     OLD.entry_date IS DISTINCT FROM NEW.entry_date THEN
    RAISE EXCEPTION 'Cannot modify critical ledger fields (sku, movement_type, quantity, entry_date). Use ADJUSTMENT entries to correct mistakes.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_ledger_critical_update_trigger
BEFORE UPDATE ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION prevent_ledger_critical_update();

-- Stock on hand view (computed from ledger)
CREATE OR REPLACE VIEW stock_on_hand AS
SELECT
  p.id,
  p.sku,
  p.name,
  p.variant,
  p.cost_per_unit,
  COALESCE(SUM(l.quantity), 0) AS current_stock,
  p.reorder_point,
  p.status,
  p.is_bundle,
  COALESCE(SUM(l.quantity), 0) <= p.reorder_point AS is_low_stock,
  p.created_at,
  p.updated_at
FROM products p
LEFT JOIN inventory_ledger l ON p.sku = l.sku
GROUP BY p.id, p.sku, p.name, p.variant, p.cost_per_unit, p.reorder_point, p.status, p.is_bundle, p.created_at, p.updated_at;

-- Indexes for performance
CREATE INDEX idx_ledger_sku ON inventory_ledger(sku);
CREATE INDEX idx_ledger_date ON inventory_ledger(entry_date DESC);
CREATE INDEX idx_ledger_movement_type ON inventory_ledger(movement_type);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);

-- Enable Row Level Security
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_ledger ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow authenticated users full access
CREATE POLICY "Allow authenticated users full access to products"
ON products FOR ALL
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access to ledger"
ON inventory_ledger FOR ALL
USING (auth.role() = 'authenticated');

-- Phase 2: Orders Schema (structure only, will be populated in Phase 2)
CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id TEXT UNIQUE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('shopee', 'tokopedia', 'tiktok', 'offline')),
  order_date TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('paid', 'shipped', 'cancelled', 'returned')),
  channel_fees DECIMAL(10, 2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TRIGGER update_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS order_line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  selling_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for orders
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_date ON orders(order_date DESC);
CREATE INDEX idx_orders_channel ON orders(channel);
CREATE INDEX idx_order_line_items_order_id ON order_line_items(order_id);
CREATE INDEX idx_order_line_items_sku ON order_line_items(sku);

-- Enable RLS for orders
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to orders"
ON orders FOR ALL
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access to order_line_items"
ON order_line_items FOR ALL
USING (auth.role() = 'authenticated');

-- Phase 3: Bundles Schema (structure only, will be populated in Phase 3)
CREATE TABLE IF NOT EXISTS bundle_compositions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  component_sku TEXT NOT NULL REFERENCES products(sku) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(bundle_sku, component_sku)
);

-- Index for bundles
CREATE INDEX idx_bundle_compositions_bundle_sku ON bundle_compositions(bundle_sku);
CREATE INDEX idx_bundle_compositions_component_sku ON bundle_compositions(component_sku);

-- Enable RLS for bundles
ALTER TABLE bundle_compositions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to bundle_compositions"
ON bundle_compositions FOR ALL
USING (auth.role() = 'authenticated');
