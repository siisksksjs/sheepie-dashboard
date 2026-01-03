-- Seed data for development/testing
-- Run this AFTER running the initial schema migration

-- Sample Products
INSERT INTO products (sku, name, variant, cost_per_unit, reorder_point, is_bundle, status) VALUES
  ('PILLOW-001', 'Ergonomic Pillow', 'Standard', 150000, 10, false, 'active'),
  ('PILLOW-002', 'Ergonomic Pillow', 'Premium', 200000, 10, false, 'active'),
  ('MASK-001', 'Blackout Sleep Mask', NULL, 75000, 20, false, 'active'),
  ('EARPLUG-001', 'Moldable Earplugs', 'Pair', 50000, 30, false, 'active'),
  ('BUNDLE-SLEEP', 'Complete Sleep Kit', NULL, 400000, 5, true, 'active');

-- Sample Ledger Entries (Initial stock)
INSERT INTO inventory_ledger (sku, movement_type, quantity, reference) VALUES
  -- Initial stock purchase
  ('PILLOW-001', 'IN_PURCHASE', 50, 'Initial stock - Supplier A'),
  ('PILLOW-002', 'IN_PURCHASE', 30, 'Initial stock - Supplier A'),
  ('MASK-001', 'IN_PURCHASE', 100, 'Initial stock - Supplier B'),
  ('EARPLUG-001', 'IN_PURCHASE', 150, 'Initial stock - Supplier C'),

  -- Some sales
  ('PILLOW-001', 'OUT_SALE', -15, 'Order #1001'),
  ('PILLOW-002', 'OUT_SALE', -8, 'Order #1002'),
  ('MASK-001', 'OUT_SALE', -25, 'Order #1003'),
  ('EARPLUG-001', 'OUT_SALE', -40, 'Order #1004'),

  -- Promotional giveaway
  ('MASK-001', 'OUT_PROMO', -10, 'Marketing event - Dec 2025'),

  -- Damage adjustment
  ('PILLOW-001', 'OUT_DAMAGE', -2, 'Damaged during warehouse move'),

  -- Customer return
  ('PILLOW-002', 'RETURN', 1, 'Customer return - Order #1002');

-- Verify stock levels
-- This should show:
-- PILLOW-001: 33 units (50 - 15 - 2)
-- PILLOW-002: 23 units (30 - 8 + 1)
-- MASK-001: 65 units (100 - 25 - 10)
-- EARPLUG-001: 110 units (150 - 40)
-- BUNDLE-SLEEP: 0 units (no stock yet)

SELECT
  sku,
  name,
  variant,
  current_stock,
  reorder_point,
  CASE WHEN is_low_stock THEN 'LOW' ELSE 'OK' END as stock_status
FROM stock_on_hand
ORDER BY sku;
