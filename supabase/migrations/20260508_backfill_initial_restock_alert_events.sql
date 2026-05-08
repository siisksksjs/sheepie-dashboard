INSERT INTO notification_events (
  event_type,
  idempotency_key,
  payload
)
SELECT
  'restock_alert',
  FORMAT(
    'restock_alert_initial:%s:%s:%s',
    routes.sku,
    routes.shipping_mode,
    threshold.threshold_units
  ),
  jsonb_build_object(
    'sku', routes.sku,
    'productName', routes.product_name,
    'shippingMode', routes.shipping_mode,
    'threshold', threshold.threshold_units,
    'previousStock', threshold.threshold_units + 1,
    'currentStock', COALESCE(stock.current_stock, 0),
    'leadTimeLabel', threshold.lead_time_label,
    'learnedLeadDays', threshold.learned_lead_days,
    'isFallback', threshold.is_fallback,
    'initialAlert', true,
    'entryDate', CURRENT_DATE
  )
FROM (
  SELECT * FROM get_restock_alert_routes('Cervi-001')
  UNION ALL SELECT * FROM get_restock_alert_routes('Lumi-001')
  UNION ALL SELECT * FROM get_restock_alert_routes('Calmi-001')
) routes
JOIN stock_on_hand stock ON stock.sku = routes.sku
CROSS JOIN LATERAL get_restock_route_threshold(
  routes.sku,
  routes.shipping_mode,
  routes.fallback_lead_min,
  routes.fallback_lead_max,
  routes.buffer_days
) threshold
WHERE threshold.threshold_units > 0
  AND COALESCE(stock.current_stock, 0) <= threshold.threshold_units
ON CONFLICT (idempotency_key) DO NOTHING;
