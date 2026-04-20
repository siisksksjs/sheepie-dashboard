# Pricing, Pack Size, COGS History, Finance Cleanup, and Restock Guidance Design

## Summary

This change set aligns the public site and dashboard with the current Sheepie operating model:

- CalmiCloud public price changes from `IDR 80.000 / 99.000` to `IDR 88.000 / 108.000`.
- Dashboard order entry must support marketplace-style pack variants on a single base SKU.
- Inventory must continue to be tracked against base SKUs, not synthetic bundle SKUs.
- Reporting must show both rolled-up SKU totals and pack-size splits.
- Product detail must expose COGS history from restock data and direct product cost edits.
- Finance is being phased out in two steps: UI removal now, DB cleanup later.
- Restock Guidance `Avg/Day` must exclude out-of-stock days from the denominator.

The user confirmed the sales model is one listing with marketplace variants, not separate marketplace SKUs, and that bundles now exist for all major sellable SKUs, not only CalmiCloud.

## Goals

- Update CalmiCloud public pricing to the new sell and normal prices.
- Replace hard-coded single-price order defaults with a proper price matrix keyed by SKU, pack size, and channel.
- Support shared pack sizes across products while allowing per-product enable/disable.
- Keep stock and COGS tracked on one base SKU per product.
- Surface trustworthy historical COGS changes in product detail.
- Remove Finance from the active dashboard UX without risking breakage in dependent flows.
- Make Restock Guidance use sellable days instead of elapsed calendar days.

## Non-Goals

- No public website bundle pricing UI in this phase.
- No speculative backfill of old bundle pack sizes from price heuristics.
- No immediate DB table drops for finance in this phase.
- No migration to separate inventory SKUs for pack variants.

## Current Constraints

- Public site pricing is stored in `sheepie/data/products.json`.
- Dashboard order defaults are currently hard-coded by SKU and channel in `components/orders/new-order-form.tsx`.
- Existing inventory and reporting use `products`, `orders`, `order_line_items`, `inventory_ledger`, and `inventory_purchase_*`.
- `bundle_compositions` exists today, but it models separate bundle SKUs. That does not match the confirmed marketplace flow for new packs.
- `products` changelog history is not currently present in the database.
- Existing restock batch history in the current DB is partial, so COGS backfill must tolerate gaps.
- Finance is wired into UI and some cash-linked flows, so removing tables immediately is higher risk than removing the UI first.

## Chosen Approach

Use a normalized pack-size model on order lines while keeping inventory, product cost, and restock logic anchored to the base SKU.

This means:

- Each product keeps one base inventory SKU.
- Order lines carry a `pack_size` field.
- Pack size implies a pack multiplier.
- Inventory deduction uses `order quantity x pack multiplier`.
- Channel defaults are resolved from a dedicated price matrix.
- Reporting can aggregate either by base SKU or by base SKU plus pack size.

This matches the confirmed operational model and avoids SKU sprawl.

## Alternatives Considered

### 1. Minimal patch only

Change public price and Shopee default price only, leave bundle behavior implicit in quantity, hide Finance UI.

Rejected because:

- It does not correctly distinguish `single` versus `bundle_2/3/4`.
- Reporting stays lossy.
- Default pricing remains brittle and hard-coded.
- COGS history would still be incomplete in product detail.

### 2. Separate SKU per pack

Create synthetic SKUs like `Calmi-2`, `Lumi-3`, `Cervi-4`.

Rejected because:

- The marketplace flow is variant-based under one listing, not separate selling SKUs.
- Inventory and reporting become more complex than necessary.
- Catalog maintenance and pricing setup become noisier.

## Data Model

### Public site pricing

No new schema is needed for the public site in this phase.

- Update CalmiCloud displayed `price` to `IDR 88.000`.
- Update CalmiCloud displayed `originalPrice` to `IDR 108.000`.

### Dashboard pack size model

Add a shared pack-size concept for order lines.

Expected values:

- `single`
- `bundle_2`
- `bundle_3`
- `bundle_4`

Each pack size maps to a multiplier:

- `single = 1`
- `bundle_2 = 2`
- `bundle_3 = 3`
- `bundle_4 = 4`

Existing order rows should backfill to `single`.

### Product pack availability

Add a product-level availability table so valid pack sizes can be enabled or disabled per SKU.

Intent:

- Shared global vocabulary of pack sizes
- Product-level control over which packs are sellable

Recommended table:

- `product_pack_sizes`
  - `id`
  - `sku`
  - `pack_size`
  - `is_enabled`
  - `created_at`
  - `updated_at`

This keeps pack availability explicit and editable from product detail.

### Channel default pricing matrix

Add a dedicated pricing table for order-entry defaults.

Recommended table:

- `product_channel_pack_prices`
  - `id`
  - `sku`
  - `pack_size`
  - `channel`
  - `default_selling_price`
  - `created_at`
  - `updated_at`

This replaces hard-coded maps in the UI and allows the user to maintain prices safely over time.

### COGS history

Do not create a second source of truth for current cost.

Keep:

- `products.cost_per_unit` as the current working product cost

Derive history from:

- `inventory_purchase_batches`
- `inventory_purchase_batch_items`
- direct product cost edits recorded in changelog

If needed for the UI, expose a derived timeline service instead of duplicating batch data into a new ledger table.

## Behavior Design

### Public site

- Update CalmiCloud displayed price to `IDR 88.000`.
- Update CalmiCloud displayed normal/original price to `IDR 108.000`.
- Do not add pack-size selectors or bundle pricing UI on the public site in this phase.

### Order entry

Each order line should include:

- Base SKU
- Pack size
- Quantity
- Selling price

Behavior:

- When SKU changes, available pack sizes should be filtered to enabled pack sizes for that SKU.
- When pack size or channel changes, the form should load the matching default price if one exists.
- If no matrix row exists, the form should show `0` or preserve manual entry rather than guessing.

### Inventory deduction

Order line stock effect must be:

- `line quantity x pack multiplier`

Examples:

- `Calmi-001 + single + quantity 1` deducts `1`
- `Calmi-001 + bundle_2 + quantity 1` deducts `2`
- `Lumi-001 + bundle_4 + quantity 3` deducts `12`

This should apply consistently in:

- order creation
- order status transitions that affect stock
- order duplication logic
- any reversal or return path

### Reporting

Reporting should support two perspectives:

- rolled-up base SKU totals
- pack-size split within each SKU

This affects:

- dashboard overview where sales are summarized
- reports pages where product-level sales appear
- restock guidance sales velocity inputs

The roll-up should remain base-SKU-centric for inventory planning, while the split view should preserve commercial visibility into `single` versus bundles.

### Product detail and product edit

Product detail should gain:

- enabled pack sizes
- channel default price matrix editor
- COGS history timeline

Direct edits to `products.cost_per_unit` must:

- update the current product cost
- automatically add changelog records with previous and new cost

### COGS history UI

The COGS history section should show both:

- direct product cost edits
- restock-derived cost events

Suggested event presentation:

- date
- event type (`restock`, `manual edit`, `system backfill`)
- old cost
- new cost or restock unit cost
- vendor, quantity, shipping mode where available
- note if data is derived from historical batch records

Gaps should be shown as missing history, not inferred values.

## Backfill Strategy

### Order lines

Backfill existing order lines as:

- `pack_size = single`

Rationale:

- Existing data does not reliably encode old pack size
- Price-based guessing would create silent data corruption

### Price defaults

Seed the matrix with current known defaults, including:

- Calmi Shopee single = `88.000`

Other rows should be added from current hard-coded defaults where they still apply, then extended manually for bundle packs.

### COGS history

Backfill from current DB where possible:

- restock batches and batch items can seed historical COGS events for affected SKUs
- current DB snapshot includes restock-derived history for some SKUs
- current DB snapshot does not appear to contain full historical Calmi restock data, so Calmi history may be partial until more source data exists

Backfilled events should be clearly labeled as derived history.

## Changelog Design

Future automatic logging should cover:

- product cost changed
- pack availability changed
- channel price matrix changed

For product cost edits, changelog items should include:

- cost per unit old value
- cost per unit new value

For pack-size changes, changelog items should include:

- pack size enabled or disabled

For channel price changes, changelog items should include:

- SKU
- pack size
- channel
- old default price
- new default price

Historical backfill entries should be distinguishable from user-driven edits.

## Finance Phase-Out

### Phase 1 in this change set

Remove Finance from active product usage:

- remove Finance route from sidebar navigation
- remove Finance-linked dashboard entry points where no longer needed
- stop exposing Finance UI as part of the normal workflow

Keep for now:

- finance tables
- finance actions
- existing linked data

Reason:

- restock and ads currently have finance-related wiring
- hybrid removal lowers regression risk

### Phase 2 later

After the app runs cleanly without Finance dependencies:

- delete unused UI/actions
- remove dead references from ads/restock code where appropriate
- optionally drop finance tables in a separate migration set

This second pass should be separate so rollback is simple if a hidden dependency is found.

## Restock Guidance Correction

### Problem

Current guidance divides units sold by all calendar days since `2025-12-27`, even when the SKU was out of stock.

This underestimates real sales velocity for SKUs that stocked out.

### Required behavior

`Avg/Day` should only count days when the SKU was sellable.

Interpretation:

- if stock is `0`, that day should not count in the denominator
- when stock returns above `0`, counting resumes

### Source of truth

Reconstruct sellable days from `inventory_ledger`.

This is the correct source because it tracks:

- purchases
- sales
- adjustments
- returns

The algorithm should walk stock levels across the analysis window and count only in-stock days.

### Guidance output

The UI copy should be updated so it no longer says only:

- `Based on average daily sales since 2025-12-27`

It should make clear that:

- the velocity is based on in-stock selling days within the analysis window

## Affected Areas

### Public site repo

- `sheepie/data/products.json`

### Dashboard repo

- order entry UI
- order actions and stock deduction logic
- reporting queries and aggregations
- product edit/detail UI
- changelog actions
- sidebar/navigation
- restock guidance calculation
- Supabase migrations and generated types

## Testing and Verification

### Required verification

- public site shows Calmi at `88.000 / 108.000`
- new order form loads correct default prices for `SKU + pack size + channel`
- inventory deduction reflects pack multiplier
- old orders still render correctly after backfill to `single`
- reports can show both SKU totals and pack-size splits
- product cost edit writes changelog entry automatically
- restock-derived COGS history renders for SKUs with batch records
- missing historical data is shown as missing, not fabricated
- Finance no longer appears in navigation/UI in phase 1
- restock `Avg/Day` excludes out-of-stock days

### Regression focus

- stock deduction and reversal logic
- duplicate order workflow
- any reporting that currently assumes one price/default per SKU
- any restock guidance logic that currently hard-codes Bundle-Cervi assumptions

## Risks

### 1. Hidden assumptions about one price per SKU

Current code has hard-coded SKU-to-price maps. Multiple reporting and order paths may assume SKU alone is enough.

Mitigation:

- audit all order creation, order detail, duplicate order, and reports logic

### 2. Legacy bundle logic conflicts with pack-size model

`Bundle-Cervi` exists as a discontinued bundle SKU. New pack-size logic should not break old historical handling.

Mitigation:

- preserve legacy rows
- keep old bundle composition logic functional for historical bundle SKUs
- treat new pack-size behavior as the forward model

### 3. Partial historical COGS data

Not all products have reconstructable restock history in the current DB snapshot.

Mitigation:

- backfill only what is provable
- label gaps explicitly

### 4. Finance dependency leaks

UI removal may expose hidden usage if finance assumptions remain in ads or restock flows.

Mitigation:

- do phase 1 as UI removal plus dependency audit, not table deletion

## Implementation Notes

- Prefer one migration set that introduces pack-size support and price matrix support together.
- Backfill existing order lines in the same migration or immediately after.
- Regenerate Supabase types after schema changes.
- Keep the implementation modular so phase-2 finance deletion can be done independently.

## Success Criteria

- Public site reflects the new Calmi price.
- Dashboard supports bundle packs for all relevant SKUs without creating synthetic inventory SKUs.
- Order defaults are data-driven, not hard-coded.
- Reports preserve both total SKU performance and pack-size detail.
- Product detail shows usable COGS history and logs future cost edits automatically.
- Finance is removed from daily UX without breaking the app.
- Restock Guidance shows a materially more accurate `Avg/Day` for SKUs that stock out.
