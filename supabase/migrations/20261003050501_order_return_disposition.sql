-- Customer returns must explicitly distinguish saleable stock from dead stock.
-- Status and every ledger movement commit together, under the order row lock.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS return_disposition text
    CHECK (return_disposition IN ('restock', 'dead_stock')),
  ADD COLUMN IF NOT EXISTS return_note text;

CREATE OR REPLACE FUNCTION public.update_order_status_with_inventory(
  p_order_id uuid,
  p_new_status text,
  p_expected_status text,
  p_return_disposition text DEFAULT NULL,
  p_expected_disposition text DEFAULT NULL,
  p_return_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  current_order public.orders%ROWTYPE;
  item record;
  component record;
  affected_sku text;
  units integer;
  multiplier integer;
  next_disposition text;
  next_note text;
  was_active boolean;
  is_active boolean;
  old_disposition text;
  movement text;
  paired_damage boolean := false;
  rows_to_insert jsonb := '[]'::jsonb;
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
          'sku', affected_sku, 'movement_type', movement,
          'quantity', CASE WHEN movement = 'RETURN' THEN units ELSE -units END,
          'reference', reference_label || CASE WHEN item.is_bundle THEN ' (Bundle: ' || item.sku || ')' ELSE '' END
            || CASE WHEN multiplier > 1 THEN ' (' || item.pack_size || ')' ELSE '' END,
          'created_by', auth.uid()));
        IF paired_damage THEN
          rows_to_insert := rows_to_insert || jsonb_build_array(jsonb_build_object(
            'sku', affected_sku, 'movement_type', 'OUT_DAMAGE', 'quantity', -units,
            'reference', reference_label || ' · Not saleable' || CASE WHEN item.is_bundle THEN ' (Bundle: ' || item.sku || ')' ELSE '' END,
            'created_by', auth.uid()));
        END IF;
      END LOOP;
    END LOOP;
    IF jsonb_array_length(rows_to_insert) = 0 THEN RAISE EXCEPTION 'Order has no inventory items.'; END IF;
    INSERT INTO public.inventory_ledger (sku, movement_type, quantity, reference, created_by)
      SELECT x.sku, x.movement_type, x.quantity, x.reference, x.created_by
      FROM jsonb_to_recordset(rows_to_insert) AS x(sku text, movement_type text, quantity integer, reference text, created_by uuid);
    GET DIAGNOSTICS result_count = ROW_COUNT;
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
