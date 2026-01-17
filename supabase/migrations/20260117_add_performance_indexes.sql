-- Performance indexes for dashboard queries
-- Run this migration to speed up common queries

-- Index for faster order queries by status and date (used by sales reports)
CREATE INDEX IF NOT EXISTS idx_orders_status_date
ON orders(status, order_date DESC);

-- Index for order line items by SKU (used by product reports)
CREATE INDEX IF NOT EXISTS idx_order_line_items_sku
ON order_line_items(sku);

-- Index for order line items by order_id (used by order details)
CREATE INDEX IF NOT EXISTS idx_order_line_items_order_id
ON order_line_items(order_id);

-- Index for inventory ledger by SKU and date (used by stock calculations)
CREATE INDEX IF NOT EXISTS idx_inventory_ledger_sku_date
ON inventory_ledger(sku, entry_date DESC);

-- Index for bundle compositions by bundle SKU
CREATE INDEX IF NOT EXISTS idx_bundle_compositions_bundle_sku
ON bundle_compositions(bundle_sku);

-- Index for bundle compositions by component SKU
CREATE INDEX IF NOT EXISTS idx_bundle_compositions_component_sku
ON bundle_compositions(component_sku);

-- Index for products by status (used by dashboard)
CREATE INDEX IF NOT EXISTS idx_products_status
ON products(status);

-- Index for ad spend entries by campaign and date
CREATE INDEX IF NOT EXISTS idx_ad_spend_campaign_date
ON ad_spend_entries(campaign_id, entry_date DESC);
