ALTER TABLE notification_events
DROP CONSTRAINT IF EXISTS notification_events_event_type_check;

ALTER TABLE notification_events
ADD CONSTRAINT notification_events_event_type_check
CHECK (event_type IN (
  'restock_alert',
  'weekly_sales_report',
  'monthly_sales_report',
  'daily_kpi_report'
));
