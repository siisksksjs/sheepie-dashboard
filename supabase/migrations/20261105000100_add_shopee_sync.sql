-- Shopee order sync, part 1: connection/mapping/review tables, order provenance
-- columns, and the shared inventory expansion helper.

-- One row per marketplace (only Shopee for now). Holds OAuth tokens, so it is
-- reachable only through the service role: RLS is on and there is no policy.
CREATE TABLE marketplace_connections (
  channel TEXT PRIMARY KEY CHECK (channel = 'shopee'),
  shop_id BIGINT,
  access_token TEXT,
  refresh_token TEXT,
  access_expires_at TIMESTAMPTZ,
  refresh_expires_at TIMESTAMPTZ,
  sync_start_at TIMESTAMPTZ,
  last_synced_until TIMESTAMPTZ,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_sync_error TEXT,
  last_alert_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_marketplace_connections_updated_at
BEFORE UPDATE ON marketplace_connections
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE marketplace_connections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON marketplace_connections FROM PUBLIC, anon, authenticated;
GRANT ALL ON marketplace_connections TO service_role;

-- Shopee item/model -> our SKU and pack size. Edited from the dashboard.
CREATE TABLE shopee_listing_map (
  item_id BIGINT NOT NULL,
  model_id BIGINT NOT NULL,
  item_name TEXT,
  model_name TEXT,
  sku TEXT REFERENCES products(sku),
  pack_size TEXT CHECK (pack_size IN ('single', 'bundle_2', 'bundle_3', 'bundle_4')),
  PRIMARY KEY (item_id, model_id)
);

ALTER TABLE shopee_listing_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to shopee_listing_map"
ON shopee_listing_map FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to shopee_listing_map"
ON shopee_listing_map FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON shopee_listing_map FROM PUBLIC, anon;
GRANT ALL ON shopee_listing_map TO authenticated, service_role;

-- Orders the sync could not apply on its own (unmapped item, return that needs
-- a stock-condition decision, or an error). Staff read it and mark it resolved.
CREATE TABLE shopee_sync_queue (
  order_sn TEXT PRIMARY KEY,
  reason TEXT CHECK (reason IN ('unmapped_item', 'return_review', 'error')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  order_id UUID REFERENCES orders(id),
  first_seen_at TIMESTAMPTZ DEFAULT now(),
  last_seen_at TIMESTAMPTZ DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

ALTER TABLE shopee_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read shopee_sync_queue"
ON shopee_sync_queue FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users to resolve shopee_sync_queue"
ON shopee_sync_queue FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to shopee_sync_queue"
ON shopee_sync_queue FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Staff may only read rows and stamp resolved_at; everything else is the sync's.
REVOKE ALL ON shopee_sync_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON shopee_sync_queue TO authenticated;
GRANT UPDATE (resolved_at) ON shopee_sync_queue TO authenticated;
GRANT ALL ON shopee_sync_queue TO service_role;

-- Where an order came from and what Shopee last said about it.
ALTER TABLE orders
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'shopee_api')),
  ADD COLUMN external_status TEXT,
  ADD COLUMN external_created_at TIMESTAMPTZ,
  ADD COLUMN external_updated_at TIMESTAMPTZ,
  ADD COLUMN synced_via TEXT CHECK (synced_via IN ('push', 'poll'));

-- Expands an order's line items (bundles into components, times pack size) into
-- inventory_ledger rows for one movement type and returns how many were written.
-- Shared by update_order_status_with_inventory and the Shopee order sync, so the
-- stock arithmetic exists in exactly one place. Callers own locking and status.
CREATE OR REPLACE FUNCTION public._apply_order_inventory(
  p_order_id uuid,
  p_movement text,
  p_reference_label text,
  p_paired_damage boolean,
  p_created_by uuid
) RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  item record;
  component record;
  affected_sku text;
  units integer;
  multiplier integer;
  rows_to_insert jsonb := '[]'::jsonb;
  result_count integer := 0;
BEGIN
  FOR item IN
    SELECT li.*, p.is_bundle FROM public.order_line_items li
    JOIN public.products p ON p.sku = li.sku WHERE li.order_id = p_order_id
  LOOP
    IF item.quantity <= 0 THEN RAISE EXCEPTION 'Invalid order item quantity.'; END IF;
    multiplier := CASE coalesce(item.pack_size, 'single')
      WHEN 'single' THEN 1 WHEN 'bundle_2' THEN 2 WHEN 'bundle_3' THEN 3 WHEN 'bundle_4' THEN 4 ELSE NULL END;
    IF multiplier IS NULL THEN RAISE EXCEPTION 'Invalid order pack size.'; END IF;
    IF item.is_bundle AND NOT EXISTS (SELECT 1 FROM public.bundle_compositions WHERE bundle_sku = item.sku) THEN
      RAISE EXCEPTION 'Bundle % has no component composition.', item.sku;
    END IF;
    FOR component IN
      SELECT component_sku AS sku, quantity FROM public.bundle_compositions WHERE item.is_bundle AND bundle_sku = item.sku
      UNION ALL SELECT item.sku, 1 WHERE NOT item.is_bundle
    LOOP
      IF component.quantity <= 0 THEN RAISE EXCEPTION 'Invalid bundle component quantity.'; END IF;
      affected_sku := component.sku;
      units := item.quantity * multiplier * component.quantity;
      rows_to_insert := rows_to_insert || jsonb_build_array(jsonb_build_object(
        'sku', affected_sku, 'movement_type', p_movement,
        'quantity', CASE WHEN p_movement = 'RETURN' THEN units ELSE -units END,
        'reference', p_reference_label || CASE WHEN item.is_bundle THEN ' (Bundle: ' || item.sku || ')' ELSE '' END
          || CASE WHEN multiplier > 1 THEN ' (' || item.pack_size || ')' ELSE '' END,
        'created_by', p_created_by));
      IF p_paired_damage THEN
        rows_to_insert := rows_to_insert || jsonb_build_array(jsonb_build_object(
          'sku', affected_sku, 'movement_type', 'OUT_DAMAGE', 'quantity', -units,
          'reference', p_reference_label || ' · Not saleable' || CASE WHEN item.is_bundle THEN ' (Bundle: ' || item.sku || ')' ELSE '' END,
          'created_by', p_created_by));
      END IF;
    END LOOP;
  END LOOP;
  IF jsonb_array_length(rows_to_insert) = 0 THEN RAISE EXCEPTION 'Order has no inventory items.'; END IF;
  INSERT INTO public.inventory_ledger (sku, movement_type, quantity, reference, created_by)
    SELECT x.sku, x.movement_type, x.quantity, x.reference, x.created_by
    FROM jsonb_to_recordset(rows_to_insert) AS x(sku text, movement_type text, quantity integer, reference text, created_by uuid);
  GET DIAGNOSTICS result_count = ROW_COUNT;
  RETURN result_count;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_order_inventory(uuid, text, text, boolean, uuid) FROM PUBLIC, anon, authenticated;

-- Same signature and behaviour as 20261003050501; only the ledger expansion is
-- delegated to _apply_order_inventory.
-- SECURITY DEFINER: the helper above is not executable by authenticated, and
-- Postgres checks EXECUTE against the calling role, so an INVOKER wrapper could
-- not call it. Access is still gated by the auth.uid() check below, which reads
-- the request's JWT claim and is unaffected by definer rights.
CREATE OR REPLACE FUNCTION public.update_order_status_with_inventory(
  p_order_id uuid,
  p_new_status text,
  p_expected_status text,
  p_return_disposition text DEFAULT NULL,
  p_expected_disposition text DEFAULT NULL,
  p_return_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  next_disposition text;
  next_note text;
  was_active boolean;
  is_active boolean;
  old_disposition text;
  movement text;
  paired_damage boolean := false;
  reference_label text;
  result_count integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in before updating an order.';
  END IF;
  IF p_new_status IS NULL OR p_new_status NOT IN ('paid', 'shipped', 'cancelled', 'returned')
    OR p_expected_status IS NULL OR p_expected_status NOT IN ('paid', 'shipped', 'cancelled', 'returned') THEN
    RAISE EXCEPTION 'Invalid order status.';
  END IF;
  IF p_return_disposition IS NOT NULL AND p_return_disposition NOT IN ('restock', 'dead_stock') THEN
    RAISE EXCEPTION 'Invalid return stock condition.';
  END IF;
  IF length(coalesce(p_return_note, '')) > 500 THEN
    RAISE EXCEPTION 'Keep the return note within 500 characters.';
  END IF;

  SELECT * INTO current_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found.'; END IF;
  was_active := current_order.status IN ('paid', 'shipped');
  is_active := p_new_status IN ('paid', 'shipped');
  old_disposition := CASE WHEN was_active THEN NULL ELSE coalesce(current_order.return_disposition, 'restock') END;
  next_disposition := CASE WHEN is_active THEN NULL ELSE p_return_disposition END;
  IF NOT is_active AND next_disposition IS NULL THEN
    IF p_new_status = 'returned' THEN
      RAISE EXCEPTION 'Choose whether the returned goods can be resold or are dead stock.';
    END IF;
    next_disposition := coalesce(old_disposition, 'restock');
  END IF;
  next_note := CASE WHEN is_active THEN NULL ELSE nullif(btrim(coalesce(p_return_note, current_order.return_note, '')), '') END;

  -- An identical retry is a no-op, even if its expected state predates the first call.
  IF current_order.status = p_new_status AND old_disposition IS NOT DISTINCT FROM next_disposition THEN
    RETURN jsonb_build_object('changed', false, 'status', current_order.status,
      'return_disposition', current_order.return_disposition, 'return_note', current_order.return_note, 'ledger_entries', 0);
  END IF;
  IF current_order.status IS DISTINCT FROM p_expected_status
    OR current_order.return_disposition IS DISTINCT FROM p_expected_disposition THEN
    RAISE EXCEPTION 'This order changed in another window. Refresh it before trying again.';
  END IF;
  IF old_disposition = 'dead_stock' AND (is_active OR next_disposition = 'restock') THEN
    RAISE EXCEPTION 'Dead stock cannot be restored as saleable stock. Use a reviewed stock adjustment if this was a mistake.';
  END IF;

  IF was_active AND NOT is_active THEN
    movement := 'RETURN';
    paired_damage := next_disposition = 'dead_stock';
  ELSIF NOT was_active AND is_active THEN
    movement := 'OUT_SALE';
  ELSIF old_disposition = 'restock' AND next_disposition = 'dead_stock' THEN
    movement := 'OUT_DAMAGE';
    -- Legacy imported closed orders may never have restored stock. Do not deduct blindly.
    IF current_order.return_disposition IS NULL AND NOT EXISTS (
      SELECT 1 FROM public.inventory_ledger
      WHERE movement_type = 'RETURN' AND quantity > 0
        AND starts_with(reference, 'Order ' || current_order.order_id || ' - ')
    ) THEN
      RAISE EXCEPTION 'No stock restoration was found for this legacy order. Review its ledger before writing stock off.';
    END IF;
  END IF;

  reference_label := 'Order ' || current_order.order_id || ' - ' || initcap(p_new_status);
  IF next_disposition = 'dead_stock' THEN reference_label := reference_label || ' · Dead stock'; END IF;
  IF next_note IS NOT NULL THEN reference_label := reference_label || ' · ' || next_note; END IF;

  IF movement IS NOT NULL THEN
    result_count := public._apply_order_inventory(
      p_order_id, movement, reference_label, paired_damage, auth.uid());
  END IF;

  UPDATE public.orders SET status = p_new_status, return_disposition = next_disposition, return_note = next_note WHERE id = p_order_id;
  RETURN jsonb_build_object('changed', true, 'status', p_new_status, 'return_disposition', next_disposition,
    'return_note', next_note, 'previous_status', current_order.status, 'ledger_entries', result_count,
    'stock_effect', CASE WHEN paired_damage THEN 'Damaged return recorded and written off. Saleable stock unchanged.'
      WHEN movement = 'RETURN' THEN 'Saleable stock restored.' WHEN movement = 'OUT_DAMAGE' THEN 'Previously restored stock written off as dead stock.'
      WHEN movement = 'OUT_SALE' THEN 'Saleable stock deducted.' ELSE 'Saleable stock unchanged.' END);
END;
$$;

REVOKE ALL ON FUNCTION public.update_order_status_with_inventory(uuid, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_order_status_with_inventory(uuid, text, text, text, text, text) TO authenticated;

-- The only write path for Shopee orders, used by both push and the poller, so
-- the same order may arrive twice or at the same moment. Everything happens in
-- one transaction under the order row lock; an update no newer than the stored
-- external_updated_at is ignored, which makes retries and overlaps harmless.
-- SECURITY DEFINER: it calls _apply_order_inventory, which no API role may
-- execute directly. Only service_role may execute this function.
CREATE OR REPLACE FUNCTION public.apply_shopee_order(p_order jsonb, p_via text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  sn text := p_order->>'order_sn';
  next_status text := p_order->>'status';
  external_updated timestamptz := (p_order->>'external_updated_at')::timestamptz;
  order_label text;
  current_order public.orders%ROWTYPE;
  new_order_id uuid;
  was_active boolean;
  is_active boolean;
  movement text;
  result_count integer := 0;
  changelog_id uuid;
BEGIN
  IF nullif(btrim(coalesce(sn, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Shopee order is missing order_sn.';
  END IF;
  IF next_status IS NULL OR next_status NOT IN ('paid', 'shipped', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid Shopee order status.';
  END IF;
  IF p_via IS NULL OR p_via NOT IN ('push', 'poll') THEN
    RAISE EXCEPTION 'Invalid Shopee sync source.';
  END IF;
  IF external_updated IS NULL THEN
    RAISE EXCEPTION 'Shopee order is missing external_updated_at.';
  END IF;
  order_label := 'Order ' || sn;

  SELECT * INTO current_order FROM public.orders WHERE order_id = sn FOR UPDATE;

  IF NOT FOUND THEN
    IF next_status = 'cancelled' THEN
      RETURN jsonb_build_object('action', 'skipped', 'order_id', NULL, 'ledger_entries', 0);
    END IF;

    INSERT INTO public.orders (
      order_id, channel, order_date, status, source,
      external_status, external_created_at, external_updated_at, synced_via
    ) VALUES (
      sn, 'shopee', ((p_order->>'order_date')::date)::timestamp AT TIME ZONE 'UTC', next_status, 'shopee_api',
      p_order->>'external_status', (p_order->>'external_created_at')::timestamptz, external_updated, p_via
    )
    ON CONFLICT (order_id) DO NOTHING
    RETURNING id INTO new_order_id;

    IF new_order_id IS NOT NULL THEN
      INSERT INTO public.order_line_items (order_id, sku, quantity, pack_size, selling_price, cost_per_unit_snapshot)
      SELECT new_order_id, line.sku, line.quantity, line.pack_size, line.selling_price,
        (SELECT p.cost_per_unit FROM public.products p WHERE p.sku = line.sku)
      FROM jsonb_to_recordset(coalesce(p_order->'lines', '[]'::jsonb))
        AS line(sku text, pack_size text, quantity integer, selling_price numeric);

      result_count := public._apply_order_inventory(
        new_order_id, 'OUT_SALE', 'Order ' || sn || ' - Paid (Shopee sync)', false, NULL);

      INSERT INTO public.changelog_entries (area, source, action_summary, entity_type, entity_id, entity_label)
      VALUES ('orders', 'automatic', 'Synced from Shopee', 'order', new_order_id::text, order_label)
      RETURNING id INTO changelog_id;
      INSERT INTO public.changelog_items (entry_id, field_name, old_value, new_value, display_order)
      VALUES (changelog_id, 'Status', NULL, next_status, 0);

      RETURN jsonb_build_object('action', 'created', 'order_id', new_order_id, 'ledger_entries', result_count);
    END IF;

    -- Another request created it between our lookup and insert. Its insert has
    -- committed by now (ON CONFLICT waited for it), so lock it and treat it as
    -- an existing order.
    SELECT * INTO current_order FROM public.orders WHERE order_id = sn FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Order % vanished during Shopee sync.', sn; END IF;
  END IF;

  IF current_order.external_updated_at IS NOT NULL AND external_updated <= current_order.external_updated_at THEN
    RETURN jsonb_build_object('action', 'unchanged', 'order_id', current_order.id, 'ledger_entries', 0);
  END IF;

  UPDATE public.orders
  SET external_status = p_order->>'external_status', external_updated_at = external_updated
  WHERE id = current_order.id;

  -- A return is a staff decision about stock condition; Shopee never overrides it.
  IF current_order.status = 'returned' OR current_order.status = next_status THEN
    RETURN jsonb_build_object('action', 'updated', 'order_id', current_order.id, 'ledger_entries', 0);
  END IF;

  -- Same stock rules as update_order_status_with_inventory, with a cancellation
  -- always treated as saleable stock coming back ('restock').
  was_active := current_order.status IN ('paid', 'shipped');
  is_active := next_status IN ('paid', 'shipped');
  IF was_active AND NOT is_active THEN
    movement := 'RETURN';
  ELSIF NOT was_active AND is_active THEN
    IF current_order.return_disposition = 'dead_stock' THEN
      RAISE EXCEPTION 'Dead stock cannot be restored as saleable stock. Use a reviewed stock adjustment if this was a mistake.';
    END IF;
    movement := 'OUT_SALE';
  END IF;

  IF movement IS NOT NULL THEN
    result_count := public._apply_order_inventory(
      current_order.id, movement, 'Order ' || sn || ' - ' || initcap(next_status) || ' (Shopee sync)', false, NULL);
  END IF;

  UPDATE public.orders
  SET status = next_status,
    return_disposition = CASE WHEN is_active THEN NULL ELSE coalesce(current_order.return_disposition, 'restock') END,
    return_note = CASE WHEN is_active THEN NULL ELSE current_order.return_note END
  WHERE id = current_order.id;

  INSERT INTO public.changelog_entries (area, source, action_summary, entity_type, entity_id, entity_label)
  VALUES ('orders', 'automatic', 'Updated order status (Shopee sync)', 'order', current_order.id::text, order_label)
  RETURNING id INTO changelog_id;
  INSERT INTO public.changelog_items (entry_id, field_name, old_value, new_value, display_order)
  VALUES (changelog_id, 'Status', current_order.status, next_status, 0);

  RETURN jsonb_build_object('action', 'updated', 'order_id', current_order.id, 'ledger_entries', result_count);
END;
$$;

REVOKE ALL ON FUNCTION public.apply_shopee_order(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_shopee_order(jsonb, text) TO service_role;

-- What the settings page may know about the connection: everything except the
-- tokens. Always one row; connected is false when nothing is stored yet.
-- SECURITY DEFINER: marketplace_connections is closed to authenticated.
CREATE OR REPLACE FUNCTION public.get_shopee_connection_status()
RETURNS TABLE (
  connected boolean,
  shop_id bigint,
  refresh_expires_at timestamptz,
  sync_start_at timestamptz,
  last_synced_until timestamptz,
  consecutive_failures integer,
  last_sync_error text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    c.shop_id IS NOT NULL AND c.access_token IS NOT NULL,
    c.shop_id,
    c.refresh_expires_at,
    c.sync_start_at,
    c.last_synced_until,
    coalesce(c.consecutive_failures, 0),
    c.last_sync_error
  FROM (SELECT 1) AS one
  LEFT JOIN public.marketplace_connections c ON c.channel = 'shopee';
$$;

REVOKE ALL ON FUNCTION public.get_shopee_connection_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_shopee_connection_status() TO authenticated;

-- The go-live switch: from sync_start_at on, Shopee orders sync instead of
-- being logged by hand. Set once and never moved; returns the stored value.
-- SECURITY DEFINER: marketplace_connections is closed to authenticated.
CREATE OR REPLACE FUNCTION public.start_shopee_sync()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  started_at timestamptz;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Please sign in before starting the Shopee sync.';
  END IF;

  UPDATE public.marketplace_connections
  SET sync_start_at = now()
  WHERE channel = 'shopee' AND sync_start_at IS NULL
    AND shop_id IS NOT NULL AND access_token IS NOT NULL;

  SELECT c.sync_start_at INTO started_at
  FROM public.marketplace_connections c
  WHERE c.channel = 'shopee' AND c.shop_id IS NOT NULL AND c.access_token IS NOT NULL;

  IF started_at IS NULL THEN
    RAISE EXCEPTION 'Shopee is not connected.';
  END IF;
  RETURN started_at;
END;
$$;

REVOKE ALL ON FUNCTION public.start_shopee_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_shopee_sync() TO authenticated;
