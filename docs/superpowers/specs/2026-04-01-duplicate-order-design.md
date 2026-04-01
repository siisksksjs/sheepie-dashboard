# Duplicate Order Design

## Summary

Add a fast `Duplicate` action for existing orders so operators can recreate repeated sales without re-entering the same items, prices, and fees multiple times in a day.

The duplicate action should create a new order instantly on the server, keep the operator on the same page, and show a success popup with the new order ID.

## Problem

The current order workflow requires entering repeated sales manually even when the same order contents happen multiple times in a day. That adds avoidable operator work and increases the chance of input mistakes.

## Goals

1. Duplicate an existing order in one click.
2. Keep all copied sales data consistent with the original order.
3. Generate a fresh unique order ID for the new order.
4. Use `today` as the duplicated order date.
5. Force duplicated orders to default to status `paid`.
6. Keep downstream inventory, finance, and changelog behavior identical to a normal paid order.
7. Keep the operator on the same page and show the new order ID in a popup/toast.

## Non-Goals

1. Editing the duplicated order before save.
2. Supporting draft duplicates.
3. Duplicating cancelled or returned state as-is.
4. Bulk duplicate of multiple orders at once.

## Chosen Product Direction

Add a server-side duplicate action that reuses the existing order creation path.

Why:

- keeps business rules in one place
- avoids logic drift between normal create and duplicate
- preserves ledger, settlement, and changelog behavior
- delivers the fastest operator workflow

## Alternatives Considered

### 1. Open a prefilled create-order form

Rejected.

Pros:

- easy for operators who want to adjust values before saving

Cons:

- slower than the requested one-click workflow
- duplicates UI logic instead of reusing server-side order creation

### 2. Create duplicate instantly via server action

Chosen.

Pros:

- fastest workflow
- minimal operator effort
- strongest logic reuse

Cons:

- less flexible than a prefilled edit flow

### 3. Create a duplicate draft and confirm later

Rejected.

Pros:

- safer for very high-risk workflows

Cons:

- adds unnecessary steps
- not aligned with the stated need

## User Experience

### Where the action appears

- Orders list page
- Order detail page

### What the button does

When the operator clicks `Duplicate`:

1. Load the original order and its line items.
2. Generate a new unique order ID for `today`.
3. Create a new order instantly.
4. Stay on the current page.
5. Show a success popup/toast with the new order ID.
6. Refresh the current page data so the new order is visible in lists.

### Success behavior

Success popup example:

`Duplicated as SHOPEE-20260401-00X`

### Failure behavior

If duplication fails, show a failure popup/toast with the actual error returned by the server action.

## Data Copy Rules

### Fields copied exactly

- `channel`
- `channel_fees`
- `notes`
- each line item `sku`
- each line item `quantity`
- each line item `selling_price`

### Fields changed on the new order

- `order_id` = fresh generated next ID
- `order_date` = today
- `status` = `paid`

## Business Logic

The duplicated order must go through the same business path as a normal manually created paid order.

That means:

- order record is created
- line items are created
- cost snapshots are stored
- inventory ledger `OUT_SALE` entries are created
- marketplace settlement entry is created where applicable
- automatic changelog entry is created

The duplicate feature must not implement a separate reduced version of order creation logic.

## Safeguards

1. Duplicate only from an existing saved order.
2. Generate the new order ID on the server, never in the client only.
3. Fail if the source order has no line items.
4. Fail if any duplicated SKU no longer has valid product cost data for snapshot creation.
5. Disable the duplicate button while processing to reduce accidental double-submit.
6. Show the exact returned error to the operator when duplication fails.

## Implementation Direction

### Server action

Add `duplicateOrder(orderId: string)` in [lib/actions/orders.ts](/Users/tsth/Coding/sheepie/dashboard-sheepie/lib/actions/orders.ts).

Responsibilities:

1. Load the source order and line items.
2. Validate that the order exists and has at least one line item.
3. Generate the next order ID using the existing order ID generator for `today`.
4. Call the same create-order path with:
   - copied channel
   - copied channel fees
   - copied notes
   - copied line items
   - `order_date = today`
   - `status = paid`
5. Return the new order ID to the caller.

Preferred structure:

- extract shared internal creation logic if needed
- avoid duplicating the create-order implementation manually inside the duplicate action

### Orders list UI

Modify [app/(dashboard)/orders/page.tsx](/Users/tsth/Coding/sheepie/dashboard-sheepie/app/(dashboard)/orders/page.tsx) to add a `Duplicate` action in list rows/cards.

### Order detail UI

Modify [components/orders/order-detail-client.tsx](/Users/tsth/Coding/sheepie/dashboard-sheepie/components/orders/order-detail-client.tsx) to add a `Duplicate Order` button near existing order actions.

### Popup/toast

Use the project’s existing notification pattern if one exists. If not, add a minimal success/error popup approach local to the affected order UI.

## Testing

### Functional tests

1. Duplicate creates a new order with a different `order_id`.
2. Duplicate uses today’s date.
3. Duplicate forces status `paid`.
4. Duplicate copies line items, quantities, selling prices, channel fees, channel, and notes exactly.
5. Duplicate creates the same side effects as a normal paid order:
   - ledger stock-out
   - marketplace settlement where applicable
   - changelog entry

### Failure tests

1. Duplicate fails cleanly if the source order does not exist.
2. Duplicate fails cleanly if the source order has no line items.
3. Duplicate fails cleanly if product cost data needed for snapshot creation is missing.

## Rollout Notes

This feature should be low-risk because it builds on the existing order creation path. The main implementation risk is logic duplication; the design explicitly avoids that by routing duplication through the same create-order workflow.
