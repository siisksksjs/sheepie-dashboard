CREATE TABLE notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('restock_alert', 'weekly_sales_report', 'monthly_sales_report')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_events_status_created_at
  ON notification_events(status, created_at);

CREATE TRIGGER update_notification_events_updated_at
BEFORE UPDATE ON notification_events
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read notification_events"
ON notification_events FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to notification_events"
ON notification_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION get_restock_alert_routes(target_sku TEXT)
RETURNS TABLE (
  sku TEXT,
  shipping_mode TEXT,
  product_name TEXT,
  fallback_lead_min INTEGER,
  fallback_lead_max INTEGER,
  buffer_days INTEGER
)
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (VALUES
    ('Cervi-001'::TEXT, 'sea'::TEXT, 'CerviCloud Pillow'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER),
    ('Lumi-001'::TEXT, 'air'::TEXT, 'LumiCloud Eye Mask'::TEXT, 7::INTEGER, 10::INTEGER, 7::INTEGER),
    ('Lumi-001'::TEXT, 'sea'::TEXT, 'LumiCloud Eye Mask'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER),
    ('Calmi-001'::TEXT, 'air'::TEXT, 'CalmiCloud Ear Plug'::TEXT, 7::INTEGER, 10::INTEGER, 7::INTEGER),
    ('Calmi-001'::TEXT, 'sea'::TEXT, 'CalmiCloud Ear Plug'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER)
  ) AS routes(sku, shipping_mode, product_name, fallback_lead_min, fallback_lead_max, buffer_days)
  WHERE routes.sku = target_sku;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_restock_route_threshold(
  target_sku TEXT,
  target_shipping_mode TEXT,
  fallback_lead_min INTEGER,
  fallback_lead_max INTEGER,
  buffer_days INTEGER
)
RETURNS TABLE (
  threshold_units INTEGER,
  lead_time_label TEXT,
  learned_lead_days INTEGER,
  is_fallback BOOLEAN
)
AS $$
DECLARE
  start_date DATE := DATE '2025-12-27';
  end_date DATE := CURRENT_DATE;
  units_consumed NUMERIC := 0;
  elapsed_days INTEGER;
  avg_daily NUMERIC := 0;
  avg_lead INTEGER;
BEGIN
  elapsed_days := GREATEST(1, end_date - start_date + 1);

  SELECT COALESCE(SUM(ABS(quantity)), 0)
  INTO units_consumed
  FROM inventory_ledger
  WHERE sku = target_sku
    AND movement_type = 'OUT_SALE'
    AND quantity < 0
    AND entry_date >= start_date
    AND entry_date <= end_date;

  avg_daily := units_consumed / elapsed_days;

  SELECT ROUND(AVG(lead_days))::INTEGER
  INTO avg_lead
  FROM (
    SELECT (b.arrival_date - b.order_date) AS lead_days
    FROM inventory_purchase_batches b
    JOIN inventory_purchase_batch_items i ON i.batch_id = b.id
    WHERE i.sku = target_sku
      AND b.shipping_mode = target_shipping_mode
      AND b.restock_status = 'arrived'
      AND b.arrival_date IS NOT NULL
      AND b.arrival_date >= b.order_date
    ORDER BY b.arrival_date DESC
    LIMIT 3
  ) latest;

  IF avg_lead IS NOT NULL THEN
    RETURN QUERY SELECT
      CEIL(avg_daily * (avg_lead + buffer_days))::INTEGER,
      FORMAT('Lead %sd + Buffer %sd = %sd', avg_lead, buffer_days, avg_lead + buffer_days),
      avg_lead,
      FALSE;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CEIL(avg_daily * (fallback_lead_max + buffer_days))::INTEGER,
    FORMAT('Fallback %s-%sd + Buffer %sd', fallback_lead_min, fallback_lead_max, buffer_days),
    NULL::INTEGER,
    TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION enqueue_restock_alert_events()
RETURNS TRIGGER
AS $$
DECLARE
  route_record RECORD;
  threshold_record RECORD;
  current_stock_value INTEGER;
  previous_stock_value INTEGER;
  event_key TEXT;
BEGIN
  FOR route_record IN
    SELECT * FROM get_restock_alert_routes(NEW.sku)
  LOOP
    SELECT current_stock
    INTO current_stock_value
    FROM stock_on_hand
    WHERE sku = NEW.sku;

    current_stock_value := COALESCE(current_stock_value, 0);
    previous_stock_value := current_stock_value - NEW.quantity;

    SELECT *
    INTO threshold_record
    FROM get_restock_route_threshold(
      route_record.sku,
      route_record.shipping_mode,
      route_record.fallback_lead_min,
      route_record.fallback_lead_max,
      route_record.buffer_days
    );

    IF threshold_record.threshold_units IS NULL OR threshold_record.threshold_units <= 0 THEN
      CONTINUE;
    END IF;

    IF previous_stock_value > threshold_record.threshold_units
      AND current_stock_value <= threshold_record.threshold_units
    THEN
      event_key := FORMAT(
        'restock_alert:%s:%s:%s:%s',
        route_record.sku,
        route_record.shipping_mode,
        threshold_record.threshold_units,
        NEW.id
      );

      INSERT INTO notification_events (
        event_type,
        idempotency_key,
        payload
      )
      VALUES (
        'restock_alert',
        event_key,
        jsonb_build_object(
          'sku', route_record.sku,
          'productName', route_record.product_name,
          'shippingMode', route_record.shipping_mode,
          'threshold', threshold_record.threshold_units,
          'previousStock', previous_stock_value,
          'currentStock', current_stock_value,
          'leadTimeLabel', threshold_record.lead_time_label,
          'learnedLeadDays', threshold_record.learned_lead_days,
          'isFallback', threshold_record.is_fallback,
          'ledgerEntryId', NEW.id,
          'entryDate', NEW.entry_date
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enqueue_restock_alert_events_after_insert
AFTER INSERT ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION enqueue_restock_alert_events();
