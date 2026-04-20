ALTER TABLE order_line_items
ADD COLUMN IF NOT EXISTS pack_size TEXT;

UPDATE order_line_items
SET pack_size = 'single'
WHERE pack_size IS NULL;

ALTER TABLE order_line_items
ALTER COLUMN pack_size SET NOT NULL;

ALTER TABLE order_line_items
DROP CONSTRAINT IF EXISTS order_line_items_pack_size_check;

ALTER TABLE order_line_items
ADD CONSTRAINT order_line_items_pack_size_check
CHECK (pack_size = ANY (ARRAY['single', 'bundle_2', 'bundle_3', 'bundle_4']));

CREATE TABLE IF NOT EXISTS product_pack_sizes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  pack_size TEXT NOT NULL CHECK (pack_size = ANY (ARRAY['single', 'bundle_2', 'bundle_3', 'bundle_4'])),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku, pack_size)
);

DROP TRIGGER IF EXISTS update_product_pack_sizes_updated_at ON product_pack_sizes;
CREATE TRIGGER update_product_pack_sizes_updated_at
BEFORE UPDATE ON product_pack_sizes
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE IF NOT EXISTS product_channel_pack_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL REFERENCES products(sku) ON DELETE CASCADE,
  pack_size TEXT NOT NULL CHECK (pack_size = ANY (ARRAY['single', 'bundle_2', 'bundle_3', 'bundle_4'])),
  channel TEXT NOT NULL CHECK (channel = ANY (ARRAY['shopee', 'tokopedia', 'tiktok', 'offline'])),
  default_selling_price DECIMAL(10, 2) NOT NULL CHECK (default_selling_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sku, pack_size, channel)
);

DROP TRIGGER IF EXISTS update_product_channel_pack_prices_updated_at ON product_channel_pack_prices;
CREATE TRIGGER update_product_channel_pack_prices_updated_at
BEFORE UPDATE ON product_channel_pack_prices
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_pack_sizes_sku ON product_pack_sizes(sku);
CREATE INDEX IF NOT EXISTS idx_product_pack_sizes_pack_size ON product_pack_sizes(pack_size);
CREATE INDEX IF NOT EXISTS idx_product_channel_pack_prices_sku_channel
  ON product_channel_pack_prices(sku, channel);

ALTER TABLE product_pack_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_channel_pack_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users full access to product_pack_sizes" ON product_pack_sizes;
CREATE POLICY "Allow authenticated users full access to product_pack_sizes"
ON product_pack_sizes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Allow authenticated users full access to product_channel_pack_prices" ON product_channel_pack_prices;
CREATE POLICY "Allow authenticated users full access to product_channel_pack_prices"
ON product_channel_pack_prices FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

INSERT INTO product_pack_sizes (sku, pack_size, is_enabled)
SELECT
  sku,
  pack_size,
  true AS is_enabled
FROM products
CROSS JOIN (
  VALUES ('single'), ('bundle_2'), ('bundle_3'), ('bundle_4')
) AS pack_sizes(pack_size)
WHERE is_bundle = false
ON CONFLICT (sku, pack_size) DO NOTHING;

INSERT INTO product_channel_pack_prices (sku, pack_size, channel, default_selling_price)
VALUES
  ('Cervi-001', 'single', 'shopee', 880000),
  ('Cervi-001', 'single', 'tokopedia', 870000),
  ('Cervi-001', 'single', 'offline', 880000),
  ('Cervi-001', 'single', 'tiktok', 870000),
  ('Cervi-002', 'single', 'shopee', 198000),
  ('Cervi-002', 'single', 'tokopedia', 198000),
  ('Cervi-002', 'single', 'offline', 198000),
  ('Cervi-002', 'single', 'tiktok', 198000),
  ('Lumi-001', 'single', 'shopee', 198000),
  ('Lumi-001', 'single', 'tokopedia', 193000),
  ('Lumi-001', 'single', 'offline', 180000),
  ('Lumi-001', 'single', 'tiktok', 175000),
  ('Calmi-001', 'single', 'shopee', 88000),
  ('Calmi-001', 'single', 'tokopedia', 80000),
  ('Calmi-001', 'single', 'offline', 80000),
  ('Calmi-001', 'single', 'tiktok', 80000)
ON CONFLICT (sku, pack_size, channel) DO UPDATE
SET default_selling_price = EXCLUDED.default_selling_price;

COMMENT ON COLUMN order_line_items.pack_size IS 'Commercial pack sold on the marketplace listing. Inventory remains tracked on the base SKU.';
COMMENT ON TABLE product_pack_sizes IS 'Per-product toggle for which shared pack sizes are valid for order entry.';
COMMENT ON TABLE product_channel_pack_prices IS 'Default selling prices keyed by base SKU, pack size, and sales channel.';
