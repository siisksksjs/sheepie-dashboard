CREATE OR REPLACE FUNCTION process_inventory_purchase_arrival(
  target_batch_id UUID,
  target_arrival_date DATE
) RETURNS VOID
AS $$
DECLARE
  batch_record inventory_purchase_batches%ROWTYPE;
  batch_item RECORD;
  existing_purchase_posted BOOLEAN;
  has_batch_items BOOLEAN;
  changelog_entry_id UUID;
  received_items_text TEXT;
  trimmed_vendor TEXT;
BEGIN
  IF target_arrival_date IS NULL THEN
    RAISE EXCEPTION 'Arrival date is required';
  END IF;

  SELECT *
  INTO batch_record
  FROM inventory_purchase_batches
  WHERE id = target_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF batch_record.restock_status = 'arrived' OR batch_record.arrival_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Arrival already processed';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM inventory_ledger
    WHERE movement_type = 'IN_PURCHASE'
      AND reference = 'Inventory purchase ' || target_batch_id
  )
  INTO existing_purchase_posted;

  IF existing_purchase_posted THEN
    RAISE EXCEPTION 'Purchase inventory already posted for this batch';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM inventory_purchase_batch_items
    WHERE batch_id = target_batch_id
  )
  INTO has_batch_items;

  IF NOT has_batch_items THEN
    RAISE EXCEPTION 'At least one restock item is required';
  END IF;

  IF target_arrival_date < batch_record.order_date THEN
    RAISE EXCEPTION 'Arrival date cannot be earlier than order date';
  END IF;

  IF batch_record.shipping_mode IS NULL THEN
    RAISE EXCEPTION 'Shipping mode is required before arrival';
  END IF;

  UPDATE inventory_purchase_batches
  SET
    arrival_date = target_arrival_date,
    restock_status = 'arrived',
    arrival_processed_at = now()
  WHERE id = target_batch_id;

  FOR batch_item IN
    SELECT sku, quantity
    FROM inventory_purchase_batch_items
    WHERE batch_id = target_batch_id
  LOOP
    INSERT INTO inventory_ledger (
      entry_date,
      sku,
      movement_type,
      quantity,
      reference,
      created_by
    )
    VALUES (
      target_arrival_date,
      batch_item.sku,
      'IN_PURCHASE',
      batch_item.quantity,
      'Inventory purchase ' || target_batch_id,
      batch_record.created_by
    );
  END LOOP;

  SELECT string_agg(format('%s x%s', sku, quantity), ', ' ORDER BY sku, quantity)
  INTO received_items_text
  FROM inventory_purchase_batch_items
  WHERE batch_id = target_batch_id;

  trimmed_vendor := NULLIF(BTRIM(batch_record.vendor), '');

  INSERT INTO changelog_entries (
    logged_at,
    area,
    source,
    action_summary,
    entity_type,
    entity_id,
    entity_label,
    notes,
    created_by
  )
  VALUES (
    (target_arrival_date::text || 'T00:00:00.000Z')::timestamptz,
    'inventory',
    'automatic',
    'Restock arrived from China',
    'inventory_purchase_batch',
    target_batch_id::text,
    COALESCE(trimmed_vendor, 'Restock ' || target_batch_id::text),
    batch_record.notes,
    batch_record.created_by
  )
  RETURNING id INTO changelog_entry_id;

  INSERT INTO changelog_items (
    entry_id,
    field_name,
    old_value,
    new_value,
    display_order
  )
  VALUES
    (changelog_entry_id, 'Shipping mode', NULL, batch_record.shipping_mode, 0),
    (changelog_entry_id, 'China order date', NULL, batch_record.order_date::text, 1),
    (changelog_entry_id, 'Warehouse arrival date', NULL, target_arrival_date::text, 2),
    (changelog_entry_id, 'Actual lead days', NULL, (target_arrival_date - batch_record.order_date)::text, 3),
    (changelog_entry_id, 'Received items', NULL, received_items_text, 4);

  IF trimmed_vendor IS NOT NULL THEN
    INSERT INTO changelog_items (
      entry_id,
      field_name,
      old_value,
      new_value,
      display_order
    )
    VALUES (
      changelog_entry_id,
      'Vendor',
      NULL,
      trimmed_vendor,
      5
    );
  END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION process_inventory_purchase_arrival(UUID, DATE) TO authenticated;
