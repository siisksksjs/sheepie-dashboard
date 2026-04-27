ALTER TABLE inventory_purchase_batches
ALTER COLUMN account_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION create_inventory_purchase_restock(
  target_order_date DATE,
  target_shipping_mode TEXT,
  target_account_id UUID,
  target_vendor TEXT,
  target_notes TEXT,
  target_created_by UUID,
  target_items JSONB
) RETURNS UUID
AS $$
DECLARE
  batch_id UUID;
  created_finance_entry_id UUID;
  purchase_category_id UUID;
  item JSONB;
  item_sku TEXT;
  item_quantity NUMERIC;
  item_unit_cost NUMERIC;
  total_amount NUMERIC := 0;
BEGIN
  IF target_order_date IS NULL THEN
    RAISE EXCEPTION 'Order date is required';
  END IF;

  IF target_shipping_mode IS NULL OR target_shipping_mode NOT IN ('air', 'sea') THEN
    RAISE EXCEPTION 'Shipping mode must be air or sea';
  END IF;

  IF target_items IS NULL OR jsonb_typeof(target_items) <> 'array' OR jsonb_array_length(target_items) = 0 THEN
    RAISE EXCEPTION 'At least one restock item is required';
  END IF;

  IF target_account_id IS NOT NULL THEN
    PERFORM 1
    FROM finance_accounts
    WHERE id = target_account_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Cash account not found';
    END IF;

    SELECT id
    INTO purchase_category_id
    FROM finance_categories
    WHERE kind = 'inventory_purchase'
      AND is_active = true
    ORDER BY sort_order ASC, created_at ASC
    LIMIT 1;

    IF purchase_category_id IS NULL THEN
      RAISE EXCEPTION 'Inventory purchase setup is incomplete';
    END IF;
  END IF;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(target_items)
  LOOP
    item_sku := NULLIF(BTRIM(item->>'sku'), '');
    item_quantity := COALESCE((item->>'quantity')::NUMERIC, 0);
    item_unit_cost := COALESCE((item->>'unit_cost')::NUMERIC, -1);

    IF item_sku IS NULL OR item_quantity <= 0 OR item_unit_cost < 0 THEN
      RAISE EXCEPTION 'Invalid restock item payload';
    END IF;

    total_amount := total_amount + (item_quantity * item_unit_cost);
  END LOOP;

  IF total_amount <= 0 THEN
    RAISE EXCEPTION 'Restock total amount must be greater than zero';
  END IF;

  INSERT INTO inventory_purchase_batches (
    entry_date,
    order_date,
    shipping_mode,
    restock_status,
    vendor,
    account_id,
    total_amount,
    notes,
    created_by
  )
  VALUES (
    target_order_date,
    target_order_date,
    target_shipping_mode,
    'in_transit',
    NULLIF(BTRIM(target_vendor), ''),
    target_account_id,
    total_amount,
    NULLIF(BTRIM(target_notes), ''),
    target_created_by
  )
  RETURNING id INTO batch_id;

  FOR item IN
    SELECT value
    FROM jsonb_array_elements(target_items)
  LOOP
    INSERT INTO inventory_purchase_batch_items (
      batch_id,
      sku,
      quantity,
      unit_cost,
      total_cost
    )
    VALUES (
      batch_id,
      NULLIF(BTRIM(item->>'sku'), ''),
      (item->>'quantity')::NUMERIC,
      (item->>'unit_cost')::NUMERIC,
      ((item->>'quantity')::NUMERIC * (item->>'unit_cost')::NUMERIC)
    );
  END LOOP;

  IF target_account_id IS NOT NULL THEN
    INSERT INTO finance_entries (
      entry_date,
      account_id,
      category_id,
      direction,
      amount,
      source,
      reference_type,
      reference_id,
      vendor,
      notes,
      created_by
    )
    VALUES (
      target_order_date,
      target_account_id,
      purchase_category_id,
      'out',
      total_amount,
      'automatic',
      'inventory_purchase_batch',
      batch_id,
      NULLIF(BTRIM(target_vendor), ''),
      NULLIF(BTRIM(target_notes), ''),
      target_created_by
    )
    RETURNING id INTO created_finance_entry_id;

    UPDATE inventory_purchase_batches
    SET finance_entry_id = created_finance_entry_id
    WHERE id = batch_id;
  END IF;

  RETURN batch_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION create_inventory_purchase_restock(DATE, TEXT, UUID, TEXT, TEXT, UUID, JSONB) TO authenticated;
