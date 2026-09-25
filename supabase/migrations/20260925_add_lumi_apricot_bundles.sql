-- Apricot versions of every bundle that contains LumiCloud Blue (Lumi-001).
-- Each copies its Blue bundle's pack sizes and channel prices, swaps Lumi-001
-- for Lumi-002 in the composition, and adjusts the bundle cost by the
-- difference between the two eye masks' current costs.

WITH source_bundles(source_sku, apricot_sku) AS (
  VALUES
    ('DeepSleep-Kit', 'DeepSleep-Kit-Apricot'),
    ('Night-Comfort-Kit', 'Night-Comfort-Kit-Apricot'),
    ('Silence-&-Darkness-Kit', 'Silence-&-Darkness-Kit-Apricot')
),
lumi_cost_delta AS (
  SELECT
    (SELECT cost_per_unit FROM products WHERE sku = 'Lumi-002')
    - (SELECT cost_per_unit FROM products WHERE sku = 'Lumi-001') AS delta
)
INSERT INTO products (sku, name, variant, cost_per_unit, reorder_point, is_bundle, status)
SELECT
  sb.apricot_sku,
  p.name || ' Apricot',
  p.variant || ' Apricot',
  p.cost_per_unit + d.delta,
  p.reorder_point,
  true,
  p.status
FROM source_bundles sb
JOIN products p ON p.sku = sb.source_sku
CROSS JOIN lumi_cost_delta d
ON CONFLICT (sku) DO NOTHING;

WITH source_bundles(source_sku, apricot_sku) AS (
  VALUES
    ('DeepSleep-Kit', 'DeepSleep-Kit-Apricot'),
    ('Night-Comfort-Kit', 'Night-Comfort-Kit-Apricot'),
    ('Silence-&-Darkness-Kit', 'Silence-&-Darkness-Kit-Apricot')
)
INSERT INTO bundle_compositions (bundle_sku, component_sku, quantity)
SELECT
  sb.apricot_sku,
  CASE WHEN bc.component_sku = 'Lumi-001' THEN 'Lumi-002' ELSE bc.component_sku END,
  bc.quantity
FROM source_bundles sb
JOIN bundle_compositions bc ON bc.bundle_sku = sb.source_sku
WHERE NOT EXISTS (
  SELECT 1 FROM bundle_compositions existing WHERE existing.bundle_sku = sb.apricot_sku
);

WITH source_bundles(source_sku, apricot_sku) AS (
  VALUES
    ('DeepSleep-Kit', 'DeepSleep-Kit-Apricot'),
    ('Night-Comfort-Kit', 'Night-Comfort-Kit-Apricot'),
    ('Silence-&-Darkness-Kit', 'Silence-&-Darkness-Kit-Apricot')
)
INSERT INTO product_pack_sizes (sku, pack_size, is_enabled)
SELECT sb.apricot_sku, pps.pack_size, pps.is_enabled
FROM source_bundles sb
JOIN product_pack_sizes pps ON pps.sku = sb.source_sku
ON CONFLICT (sku, pack_size) DO NOTHING;

WITH source_bundles(source_sku, apricot_sku) AS (
  VALUES
    ('DeepSleep-Kit', 'DeepSleep-Kit-Apricot'),
    ('Night-Comfort-Kit', 'Night-Comfort-Kit-Apricot'),
    ('Silence-&-Darkness-Kit', 'Silence-&-Darkness-Kit-Apricot')
)
INSERT INTO product_channel_pack_prices (sku, pack_size, channel, default_selling_price)
SELECT sb.apricot_sku, pcp.pack_size, pcp.channel, pcp.default_selling_price
FROM source_bundles sb
JOIN product_channel_pack_prices pcp ON pcp.sku = sb.source_sku
ON CONFLICT (sku, channel, pack_size) DO NOTHING;
