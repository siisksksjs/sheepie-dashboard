ALTER TABLE inventory_purchase_batches
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS arrival_date DATE,
  ADD COLUMN IF NOT EXISTS restock_status TEXT CHECK (restock_status IN ('in_transit', 'arrived')),
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT CHECK (shipping_mode IN ('air', 'sea')),
  ADD COLUMN IF NOT EXISTS arrival_processed_at TIMESTAMPTZ;

UPDATE inventory_purchase_batches
SET
  order_date = COALESCE(order_date, entry_date),
  arrival_date = CASE
    WHEN arrival_date IS NULL AND finance_entry_id IS NOT NULL THEN entry_date
    ELSE arrival_date
  END,
  restock_status = COALESCE(restock_status, 'arrived')
WHERE order_date IS NULL
   OR restock_status IS NULL
   OR (arrival_date IS NULL AND finance_entry_id IS NOT NULL);

ALTER TABLE inventory_purchase_batches
  ALTER COLUMN order_date SET NOT NULL,
  ALTER COLUMN restock_status SET NOT NULL,
  ALTER COLUMN restock_status SET DEFAULT 'arrived';

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batches_status_date
  ON inventory_purchase_batches(restock_status, order_date DESC);

CREATE OR REPLACE FUNCTION sync_inventory_purchase_batch_restock_fields()
RETURNS TRIGGER
AS $$
BEGIN
  IF NEW.order_date IS NULL THEN
    NEW.order_date = NEW.entry_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sync_inventory_purchase_batch_restock_fields_trigger
ON inventory_purchase_batches;

CREATE TRIGGER sync_inventory_purchase_batch_restock_fields_trigger
BEFORE INSERT ON inventory_purchase_batches
FOR EACH ROW
EXECUTE FUNCTION sync_inventory_purchase_batch_restock_fields();

CREATE OR REPLACE FUNCTION process_inventory_purchase_arrival(
  target_batch_id UUID,
  target_arrival_date DATE
) RETURNS VOID
AS $$
DECLARE
  batch_record inventory_purchase_batches%ROWTYPE;
  batch_item RECORD;
BEGIN
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

  IF target_arrival_date < batch_record.order_date THEN
    RAISE EXCEPTION 'Arrival date cannot be earlier than order date';
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
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION process_inventory_purchase_arrival(UUID, DATE) TO authenticated;
