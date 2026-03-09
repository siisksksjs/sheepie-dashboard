ALTER TABLE order_line_items
ADD COLUMN IF NOT EXISTS cost_per_unit_snapshot DECIMAL(10, 2);

UPDATE order_line_items AS oli
SET cost_per_unit_snapshot = p.cost_per_unit
FROM products AS p
WHERE p.sku = oli.sku
  AND oli.cost_per_unit_snapshot IS NULL;
