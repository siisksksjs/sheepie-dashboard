# Restock Tab And Learned Lead-Time Design

## Summary

Add a dedicated `Restock` tab to the dashboard for tracking China replenishment orders from placement through warehouse arrival in Indonesia. The tab becomes the operational source of truth for:

- restocks that are still in transit
- completed arrivals
- actual lead times by SKU and shipping mode
- reorder guidance inputs used by the dashboard

This design replaces the current fixed-only lead time assumptions with learned lead times from real completed restocks, while keeping manual buffer days under operator control.

## Problem

The current dashboard renders `Lead+Buffer` using hard-coded ranges in reorder guidance. That is not reliable enough for actual operations because each restock can be delayed by different issues such as red-line checks, holidays, freight disruptions, or other shipment-specific problems.

The app currently has no place to record:

- when a restock was ordered from China
- when it actually arrived at the Indonesia warehouse
- what shipping mode was used
- how long the shipment actually took

Because of that, reorder guidance cannot learn from real history, and stockouts are harder to prevent.

## Goals

1. Track each restock from China order date to Indonesia warehouse arrival date.
2. Keep stock logic correct by increasing stock only when the shipment physically arrives.
3. Learn actual lead days per `SKU + shipping mode` from historical completed restocks.
4. Preserve manual buffer control so ops can still protect against uncertainty.
5. Automatically write a changelog entry when a shipment arrives and stock is posted.

## Non-Goals

1. Multi-warehouse support.
2. Full freight-forwarder workflow with customs checkpoints, port stages, or milestone tracking.
3. Automatic supplier communication.
4. Purchase-order PDF generation.
5. Moving this workflow into the existing `Finance` tab.

## Chosen Product Direction

Create a new sidebar tab named `Restock`.

Why:

- `Orders` is for customer sales.
- `Ledger` is for inventory movement history.
- `Finance` is for cash and accounting records.
- `Restock` is a distinct supplier replenishment workflow.

This keeps the operational mental model clear:

- buy from supplier in `Restock`
- receive stock into `Ledger`
- review money in `Finance`
- monitor urgency in `Dashboard`

## Alternatives Considered

### 1. Extend Finance inventory purchases

Rejected as primary UX location.

Pros:

- reuses an existing purchase concept
- already linked to finance entries

Cons:

- users think about this as replenishment operations, not finance
- makes a high-frequency stock workflow harder to find

### 2. Separate restock tracker disconnected from purchases

Rejected.

Pros:

- flexible for future shipping complexity

Cons:

- duplicates operational truth
- increases drift risk between stock, finance, and restock history

### 3. Lightweight dashboard-only tracking

Rejected.

Pros:

- fastest to ship

Cons:

- weak connection to ledger truth
- harder to trust
- easy to create mismatched records

## Core Workflow

### 1. Create restock

User creates a restock record in the new `Restock` tab.

Required fields:

- `order_date`
- `shipping_mode`
- at least one SKU line item with quantity

Optional fields:

- vendor
- notes

Behavior at creation time:

- record the supplier purchase / cash-out on `order_date`
- create restock record in status `in_transit`
- do not create inventory ledger entries yet
- do not increase stock on hand yet
- do not create an automatic changelog entry yet

### 2. Mark restock as arrived

Later, user opens the same restock and marks it `arrived`.

Required at arrival time:

- `arrival_date`

Behavior at arrival time:

- create `IN_PURCHASE` ledger entries for the restock items
- increase stock on hand
- compute actual lead time as `arrival_date - order_date`
- create one automatic changelog entry for the arrival event
- keep the original finance outflow on the original `order_date`

## Shipment Grouping

The data model should allow one restock record to contain multiple SKU items under a shared shipment.

However, the UI and workflow should not assume most shipments are shared. The normal case should still feel SKU-first and simple, because most real restocks are not grouped in the same shipment.

Implication:

- one restock record may contain one SKU or multiple SKUs
- shipment metadata lives at the restock header level
- lead-time learning still happens per `SKU + shipping mode`

## Data Model Changes

Chosen implementation direction:

- extend the existing `inventory_purchase_batches` header model
- extend the existing `inventory_purchase_batch_items` line-item model
- surface that workflow from a new `Restock` tab instead of the current `Finance` purchase UI

Reason:

- keeps finance linkage and cost fields already present in the system
- avoids duplicating purchase and restock concepts into two separate record sets
- reduces migration complexity while still giving users a dedicated replenishment workspace

The required logical fields are:

### Restock header

- `id`
- `order_date`
- `arrival_date` nullable
- `restock_status` with values `in_transit | arrived`
- `shipping_mode` with values `air | sea`
- `vendor` nullable
- `notes` nullable
- `finance_entry_id`
- `arrival_processed_at` nullable
- `created_by`
- `created_at`
- `updated_at`

### Restock items

- `id`
- `restock_id`
- `sku`
- `quantity`
- `unit_cost` optional but recommended if the current purchase flow already uses it
- `total_cost` if cost accounting remains part of the same workflow
- `created_at`

### Derived field

`lead_time_days` is not a manually entered field. It is computed for completed restocks as the calendar day difference between `arrival_date` and `order_date`.

## Inventory Behavior

Inventory must remain ledger-first.

Rules:

1. Creating an `in_transit` restock must not change stock.
2. Only marking a restock as `arrived` can create the `IN_PURCHASE` ledger entries.
3. Stock on hand must increase only after those arrival ledger entries are written.
4. Arrival processing must be idempotent in practice: a restock cannot be processed into stock twice.

This preserves the operational truth that stock only exists when it physically reaches the Indonesia warehouse.

## Finance Behavior

Finance outflow remains tied to the supplier order date.

Rules:

1. Supplier purchase / cash-out is created on `order_date`.
2. Arrival does not create a second cash-out.
3. Finance and inventory timing are intentionally different:
   - money leaves on `order_date`
   - stock lands on `arrival_date`

This matches the actual business sequence and avoids distorting cash timing.

## Changelog Behavior

Automatic changelog entry should be created only when the restock arrives.

No automatic changelog entry is needed when a restock is first created as `in_transit`.

### Arrival changelog content

The automatic arrival changelog entry should include:

- SKU list and quantities received
- shipping mode
- China order date
- Indonesia warehouse arrival date
- actual lead days
- vendor if present
- notes if present

The changelog entry should reflect the arrival event as the operational milestone that caused stock to become available.

## Dashboard Restock Guidance

The existing dashboard `Restock Guidance` section should be updated to use learned lead days instead of only fixed lead ranges.

### Lead-time learning rule

For each `SKU + shipping mode`:

1. look up completed restocks with both `order_date` and `arrival_date`
2. sort by most recent completed arrival
3. take the latest 3 completed restocks
4. average their actual lead days

Chosen rule:

- use the average of the last 3 completed shipments

### Buffer rule

Buffer remains manual.

The system should keep operator-controlled buffer days per `SKU + shipping mode`.

### Lead+Buffer calculation

`Lead+Buffer = learned_lead_days + manual_buffer_days`

`Reorder Point = avg_daily_sales * (learned_lead_days + manual_buffer_days)`

### Fallback rule

If there is insufficient history:

- if 0 completed restocks exist for that `SKU + mode`, use the current fallback defaults
- if 1 completed restock exists, use that one
- if 2 completed restocks exist, average those two
- if 3 or more completed restocks exist, average only the latest three

### Dashboard display

The dashboard should make it clear whether the value is learned or fallback-based.

Examples:

- `Lead 19d + Buffer 7d = 26d`
- `Fallback 7-10d + Buffer 7d`

## Manual Buffer Storage

Manual buffer values should be configurable by `SKU + shipping mode`.

Initial implementation can use a simple configuration source if needed, as long as:

- the values are explicit
- they are easy to update
- the code does not hide magic assumptions

Longer-term, these values may move into a database-backed settings table if operators need self-service editing in the UI.

## UI Design

### Sidebar

Add a new top-level navigation item:

- `Restock`

### Restock tab responsibilities

The new page should support:

- creating new in-transit restocks
- viewing current in-transit restocks
- marking restocks as arrived
- reviewing recent arrived restocks
- showing enough shipment detail to understand lead-time history

### Suggested page sections

1. `Create Restock`
   - form for new supplier order

2. `In Transit`
   - list of restocks waiting to arrive
   - quick action to mark arrived

3. `Arrived History`
   - recent completed restocks with actual lead days

The page should optimize for speed of ops use, not accounting detail.

## Validation Rules

1. `order_date` is required when creating a restock.
2. `shipping_mode` is required when creating a restock.
3. At least one valid SKU item is required.
4. `arrival_date` is required before status can change to `arrived`.
5. `arrival_date` cannot be earlier than `order_date`.
6. An already arrived restock cannot be processed into stock a second time.
7. Arrival processing should fail safely if any ledger insert or changelog write fails in a way that would leave the record in a half-finished state.

## Transaction And Consistency Expectations

Arrival is a high-integrity operation. The system should treat it as a single state transition.

Chosen implementation direction:

- perform arrival processing in one database-backed transactional unit, preferably via a Postgres function / RPC that updates status, writes ledger entries, and records the arrival changelog together

Desired all-or-nothing outcome:

1. mark restock as arrived
2. create all inventory ledger entries
3. post stock increase
4. create automatic changelog entry

If any critical step fails, the user should see an error and the system should avoid a partially completed arrival.

## Reporting Impact

This feature changes how reorder guidance is generated but should not change historical sales reporting logic.

Primary reporting impact:

- dashboard reorder guidance becomes shipment-history-aware
- low-stock reasoning becomes more trustworthy
- changelog gains arrival milestones with actual timing context

## Testing Scope

Implementation should cover at least:

1. creating an in-transit restock does not create stock ledger entries
2. marking a restock as arrived creates stock ledger entries exactly once
3. stock on hand increases only after arrival
4. arrival changelog entry includes order date, arrival date, mode, quantities, and lead days
5. lead-time calculation uses the latest 3 completed restocks for each `SKU + mode`
6. fallback logic works for 0, 1, and 2 completed restocks
7. invalid arrival dates are rejected

## Open Questions Resolved

1. Shared shipment metadata is allowed, but should not be the default assumption because most SKUs are not shipped together.
2. Stock must be added on warehouse arrival, not on supplier order date.
3. Learned lead time uses the average of the last 3 completed shipments.
4. Changelog automation happens on arrival only, not on restock creation.
5. The workflow belongs in a new `Restock` tab, not `Finance`.

## Recommended Implementation Sequence

1. add schema support for restock tracking and arrival state
2. add restock actions for create and mark arrived
3. update arrival flow to create ledger entries and changelog
4. add new `Restock` page and sidebar navigation
5. update dashboard reorder guidance to use learned lead times plus manual buffer
6. add tests for arrival processing and lead-time calculation
