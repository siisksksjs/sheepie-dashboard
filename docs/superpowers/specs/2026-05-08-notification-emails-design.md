# Notification Emails Design

## Goal

Add automated email notifications for restock reorder events and recurring sales reports. Emails should be readable on mobile, sent as HTML, and delivered to every Supabase Auth user email.

## Scope

### Restock Alerts

Monitor route-specific reorder points for these SKU and shipment method pairs:

- `Cervi-001` by sea only
- `Lumi-001` by air and sea
- `Calmi-001` by air and sea

`Cervi-002` is intentionally excluded from restock notification emails.

### Sales Reports

Send HTML sales reports to every Supabase Auth user:

- Weekly report at the end of each week
- Monthly report at the end of each month

Reports should summarize sales performance directly in the email body. CSV attachments are out of scope for the first version because mobile readability is the priority.

## Architecture

Use Supabase as the automation and data layer, and Resend as the email delivery provider.

- Postgres stores notification events and send attempts.
- Postgres triggers detect stock crossings from inventory ledger inserts.
- Supabase Edge Functions render HTML emails and send them through Resend.
- Supabase scheduled jobs invoke report functions and a notification sender backup.

This keeps operational rules close to the source of truth while keeping provider-specific email delivery isolated in Edge Functions.

## Data Sources

### Inventory and Stock

- `inventory_ledger` is the source of stock movements.
- `stock_on_hand` provides current stock per SKU.
- Active restock alert scope is fixed to the three requested SKUs and five SKU/mode routes.

### Lead Times

Lead time should be calculated from real restock data:

- Use arrived `inventory_purchase_batches` joined to `inventory_purchase_batch_items`.
- Group samples by `sku + shipping_mode`.
- Calculate actual lead days from `order_date` to `arrival_date`.
- Prefer the average of the latest completed samples, matching the existing restock guidance behavior.

If a route has created restocks but no arrived samples yet, use fallback values until the first shipment is marked arrived:

- Air: fallback air lead window plus buffer
- Sea: fallback sea lead window plus buffer

When fallback creates a min/max reorder range, use the conservative max threshold for alerting.

### Recipients

Fetch recipients from Supabase Auth users. All restock alerts, weekly reports, and monthly reports go to every user with an email address.

## Restock Alert Flow

1. A row is inserted into `inventory_ledger`.
2. A database trigger checks whether the affected SKU is in alert scope.
3. For each shipment method configured for that SKU, calculate the route reorder threshold.
4. Compare previous stock to new stock:
   - previous stock above threshold
   - new stock at or below threshold
5. If the route crossed down, insert a `notification_events` row.
6. A sender function sends pending notification events by email through Resend.
7. Sent events are marked with `sent_at`; failures retain error details for retry.

The trigger should avoid repeat emails while stock remains below threshold. When stock rises above the threshold after a return, adjustment, or restock arrival, the route becomes eligible to alert again on the next downward crossing.

## Notification Event Model

Add a table such as `notification_events` with fields for:

- event type: restock alert, weekly report, monthly report
- SKU and shipment mode for restock events
- threshold, previous stock, current stock
- period start and period end for reports
- idempotency key
- status: pending, sending, sent, failed
- error message
- sent timestamp
- created timestamp

Use idempotency keys to prevent duplicate events for the same route crossing or report period.

## Email Delivery

Add a Supabase Edge Function, tentatively `send-notification-events`.

Responsibilities:

- Load pending notification events.
- Fetch all Supabase Auth user emails.
- Render mobile-friendly HTML email.
- Send through Resend using `RESEND_API_KEY`.
- Mark events sent or failed.

Required environment/secrets:

- `RESEND_API_KEY`
- `EMAIL_FROM`, for example `Sheepie Dashboard <alerts@yourdomain.com>`

The Resend key should be stored as a local env var for development and as a Supabase Edge Function secret in production.

## Immediate Behavior

Restock alerts should be sent immediately after stock crosses a route reorder point.

To achieve this without relying only on polling:

- The database trigger creates the event synchronously with the ledger insert.
- App workflows that insert ledger rows should invoke `send-notification-events` after the stock-changing operation completes.
- A scheduled backup can invoke the sender every few minutes to recover from failed app invocations.

This covers order creation, order status changes, manual ledger entries, imports, and restock arrivals because all of those workflows write to `inventory_ledger`.

## Report Flow

Add a Supabase Edge Function, tentatively `send-sales-report`.

Weekly report:

- Scheduled at the end of the week in the business timezone.
- Uses the completed week as the reporting period.

Monthly report:

- Scheduled at the end of the month in the business timezone.
- Uses the completed month as the reporting period.

Report emails should include:

- total orders
- units sold
- revenue
- COGS
- profit
- returns
- sales by SKU
- sales by channel
- channel/SKU breakdown if compact enough
- current low-stock/restock alert summary

Reports should reuse the existing report aggregation logic where possible, or extract the shared aggregation into a server-safe module that both the dashboard and Edge Function can use.

## Error Handling

- Failed email sends should be recorded with the provider response or error message.
- Pending and failed events should be retryable.
- The sender should be idempotent so a retry does not send duplicate emails after an event was marked sent.
- Missing recipient emails should be skipped.
- If there are no recipients, keep the event failed with a clear message.

## Testing

Add focused tests for:

- route scope excludes `Cervi-002`
- `Cervi-001` only includes sea
- `Lumi-001` and `Calmi-001` include air and sea
- fallback reorder threshold uses the conservative max value
- real arrived restock data overrides fallback lead times
- crossing detection only fires from above threshold to at/below threshold
- repeated stock reductions below threshold do not create duplicate alert events
- report period calculation for weekly and monthly emails
- email HTML rendering includes required report and restock fields

## Out of Scope

- CSV attachments
- user-level notification preferences
- SMS, WhatsApp, or push notifications
- alerts for `Cervi-002`
- marketing emails
