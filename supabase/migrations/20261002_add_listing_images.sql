-- Listing thumbnails: one image per product × pack size, shown wherever orders and stock are picked or scanned.
ALTER TABLE product_pack_sizes ADD COLUMN IF NOT EXISTS image_url text;
COMMENT ON COLUMN product_pack_sizes.image_url IS 'Listing thumbnail for this SKU + pack size. Static /listings/* path or a Storage public URL.';

UPDATE product_pack_sizes pps
SET image_url = v.image_url
FROM (VALUES
  ('Calmi-001', 'bundle_2', '/listings/calmi-001--bundle_2.webp'),
  ('Calmi-001', 'bundle_3', '/listings/calmi-001--bundle_3.webp'),
  ('Calmi-001', 'bundle_4', '/listings/calmi-001--bundle_4.webp'),
  ('Calmi-001', 'single', '/listings/calmi-001--single.webp'),
  ('Cervi-001', 'bundle_2', '/listings/cervi-001--bundle_2.webp'),
  ('Cervi-001', 'bundle_3', '/listings/cervi-001--bundle_3.webp'),
  ('Cervi-001', 'bundle_4', '/listings/cervi-001--bundle_4.webp'),
  ('Cervi-001', 'single', '/listings/cervi-001--single.webp'),
  ('DeepSleep-Kit', 'single', '/listings/deepsleep-kit--single.webp'),
  ('DeepSleep-Kit-Apricot', 'single', '/listings/deepsleep-kit-apricot--single.webp'),
  ('Lumi-001', 'bundle_2', '/listings/lumi-001--bundle_2.webp'),
  ('Lumi-001', 'bundle_3', '/listings/lumi-001--bundle_3.webp'),
  ('Lumi-001', 'bundle_4', '/listings/lumi-001--bundle_4.webp'),
  ('Lumi-001', 'single', '/listings/lumi-001--single.webp'),
  ('Lumi-002', 'bundle_2', '/listings/lumi-002--bundle_2.webp'),
  ('Lumi-002', 'bundle_3', '/listings/lumi-002--bundle_3.webp'),
  ('Lumi-002', 'bundle_4', '/listings/lumi-002--bundle_4.webp'),
  ('Lumi-002', 'single', '/listings/lumi-002--single.webp'),
  ('Night-Comfort-Kit', 'single', '/listings/night-comfort-kit--single.webp'),
  ('Night-Comfort-Kit-Apricot', 'single', '/listings/night-comfort-kit-apricot--single.webp'),
  ('Silence-&-Darkness-Kit', 'single', '/listings/silence-darkness-kit--single.webp'),
  ('Silence-&-Darkness-Kit-Apricot', 'single', '/listings/silence-darkness-kit-apricot--single.webp'),
  ('Silent-Comfort-Kit', 'single', '/listings/silent-comfort-kit--single.webp')
) AS v(sku, pack_size, image_url)
WHERE pps.sku = v.sku AND pps.pack_size = v.pack_size AND pps.image_url IS NULL;

-- Bucket for thumbnails uploaded from the Products screen.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('listing-images', 'listing-images', true, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users upload listing images" ON storage.objects;
CREATE POLICY "Authenticated users upload listing images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'listing-images');

DROP POLICY IF EXISTS "Authenticated users replace listing images" ON storage.objects;
CREATE POLICY "Authenticated users replace listing images"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'listing-images')
WITH CHECK (bucket_id = 'listing-images');
