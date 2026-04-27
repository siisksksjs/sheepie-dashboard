INSERT INTO product_pack_sizes (sku, pack_size, is_enabled)
SELECT
  products.sku,
  pack_sizes.pack_size,
  pack_sizes.pack_size = 'single' AS is_enabled
FROM products
CROSS JOIN (
  VALUES ('single'), ('bundle_2'), ('bundle_3'), ('bundle_4')
) AS pack_sizes(pack_size)
WHERE products.is_bundle = true
ON CONFLICT (sku, pack_size) DO NOTHING;
