-- Edit and delete support for in-transit restock batches.
--
-- Both operations are strictly guarded to batches that are still `in_transit`.
-- Once a batch is marked `arrived` it has posted immutable IN_PURCHASE rows to
-- the inventory ledger, so it must never be edited or deleted here. Corrections
-- to arrived stock are made with ledger ADJUSTMENT entries instead.
--
-- Both RPCs keep the linked finance cash-out entry consistent with the batch:
--   * update recomputes the total and syncs the finance entry (creating,
--     updating, or removing it to match the new account/total).
--   * delete removes the finance entry along with the batch and its items.

CREATE OR REPLACE FUNCTION update_inventory_purchase_restock(
  target_batch_id UUID,
  target_order_date DATE,
  target_shipping_mode TEXT,
  target_account_id UUID,
  target_vendor TEXT,
  target_notes TEXT,
  target_items JSONB
) RETURNS UUID
AS $$
DECLARE
  batch_record inventory_purchase_batches%ROWTYPE;
  purchase_category_id UUID;
  created_finance_entry_id UUID;
  item JSONB;
  item_sku TEXT;
  item_quantity NUMERIC;
  item_unit_cost NUMERIC;
  computed_total NUMERIC := 0;
  trimmed_vendor TEXT;
  trimmed_notes TEXT;
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

  SELECT *
  INTO batch_record
  FROM inventory_purchase_batches
  WHERE id = target_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF batch_record.restock_status <> 'in_transit' OR batch_record.arrival_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only in-transit restocks can be edited';
  END IF;

  trimmed_vendor := NULLIF(BTRIM(target_vendor), '');
  trimmed_notes := NULLIF(BTRIM(target_notes), '');

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

    computed_total := computed_total + (item_quantity * item_unit_cost);
  END LOOP;

  IF computed_total <= 0 THEN
    RAISE EXCEPTION 'Restock total amount must be greater than zero';
  END IF;

  UPDATE inventory_purchase_batches
  SET
    entry_date = target_order_date,
    order_date = target_order_date,
    shipping_mode = target_shipping_mode,
    vendor = trimmed_vendor,
    account_id = target_account_id,
    total_amount = computed_total,
    notes = trimmed_notes
  WHERE id = target_batch_id;

  DELETE FROM inventory_purchase_batch_items
  WHERE batch_id = target_batch_id;

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
      target_batch_id,
      NULLIF(BTRIM(item->>'sku'), ''),
      (item->>'quantity')::NUMERIC,
      (item->>'unit_cost')::NUMERIC,
      ((item->>'quantity')::NUMERIC * (item->>'unit_cost')::NUMERIC)
    );
  END LOOP;

  -- Reconcile the linked finance cash-out entry with the new state.
  IF target_account_id IS NOT NULL THEN
    IF batch_record.finance_entry_id IS NOT NULL THEN
      UPDATE finance_entries
      SET
        entry_date = target_order_date,
        account_id = target_account_id,
        category_id = purchase_category_id,
        amount = computed_total,
        vendor = trimmed_vendor,
        notes = trimmed_notes
      WHERE id = batch_record.finance_entry_id;
    ELSE
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
        computed_total,
        'automatic',
        'inventory_purchase_batch',
        target_batch_id,
        trimmed_vendor,
        trimmed_notes,
        batch_record.created_by
      )
      RETURNING id INTO created_finance_entry_id;

      UPDATE inventory_purchase_batches
      SET finance_entry_id = created_finance_entry_id
      WHERE id = target_batch_id;
    END IF;
  ELSE
    -- No account selected: drop any previously linked finance entry.
    IF batch_record.finance_entry_id IS NOT NULL THEN
      UPDATE inventory_purchase_batches
      SET finance_entry_id = NULL
      WHERE id = target_batch_id;

      DELETE FROM finance_entries
      WHERE id = batch_record.finance_entry_id;
    END IF;
  END IF;

  RETURN target_batch_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION delete_inventory_purchase_restock(
  target_batch_id UUID
) RETURNS VOID
AS $$
DECLARE
  batch_record inventory_purchase_batches%ROWTYPE;
BEGIN
  SELECT *
  INTO batch_record
  FROM inventory_purchase_batches
  WHERE id = target_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF batch_record.restock_status <> 'in_transit' OR batch_record.arrival_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Only in-transit restocks can be removed';
  END IF;

  -- Defense in depth: never delete a batch that already posted to the ledger.
  IF EXISTS (
    SELECT 1
    FROM inventory_ledger
    WHERE movement_type = 'IN_PURCHASE'
      AND reference = 'Inventory purchase ' || target_batch_id
  ) THEN
    RAISE EXCEPTION 'Cannot remove a restock that has posted inventory to the ledger';
  END IF;

  DELETE FROM inventory_purchase_batch_items
  WHERE batch_id = target_batch_id;

  -- Unlink before deleting the finance entry to satisfy the FK reference.
  IF batch_record.finance_entry_id IS NOT NULL THEN
    UPDATE inventory_purchase_batches
    SET finance_entry_id = NULL
    WHERE id = target_batch_id;

    DELETE FROM finance_entries
    WHERE id = batch_record.finance_entry_id;
  END IF;

  DELETE FROM inventory_purchase_batches
  WHERE id = target_batch_id;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION update_inventory_purchase_restock(UUID, DATE, TEXT, UUID, TEXT, TEXT, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_inventory_purchase_restock(UUID) TO authenticated;
