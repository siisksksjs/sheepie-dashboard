# Unified Sales Metrics Design

**Date:** 2026-08-12  
**Status:** Approved

## Goal

Make every sales-facing screen use the same names and calculations so a number never changes meaning between Dashboard, Reports, KPI, Orders, Ads, and email reports.

This remains a simple operating dashboard. It will not add full accounting, bank reconciliation, tax, or cash-flow calculations.

## Metric Definitions

The following definitions are canonical throughout the application:

| Metric | Definition |
| --- | --- |
| GMV | Total amount customers paid before marketplace or channel fees. |
| Revenue | GMV minus marketplace or channel fees. |
| COGS | Historical product cost for the physical units sold. |
| Profit | Revenue minus COGS. |
| Profit After Ads | Profit minus attributed advertising spend. |

For one order:

```text
GMV = sum(line item selling price x purchased pack quantity)
Revenue = GMV - channel fees
COGS = sum(saved unit cost x purchased pack quantity x pack multiplier)
Profit = Revenue - COGS
Profit After Ads = Profit - attributed ad spend
```

`selling_price` is the final customer price for one purchased pack. A bundle-of-two line with quantity three therefore represents three purchased packs and six physical units.

## Included Orders

- Include orders with status `paid` or `shipped`.
- Exclude orders with status `cancelled` or `returned`.
- Continue showing returns separately for operational visibility.
- Partial returns are outside this change because the current order model only supports an order-level returned status.
- A missing channel fee is treated as zero.

## Cost Rules

- Use `cost_per_unit_snapshot` saved on the order line whenever available.
- Fall back to the product's current `cost_per_unit` only for legacy rows without a snapshot.
- Multiply unit cost by physical units, including pack multipliers.
- Do not subtract inventory purchases, salaries, rent, software, tax, or other finance entries from Profit.

The result is deliberately a product-level operating profit, not full accounting net profit. The label `Net Profit` will no longer appear on sales-facing screens.

## One Calculation Source

Create one pure shared sales-metrics module that can be imported by both the Next.js application and Supabase email functions. It will own:

- pack-to-physical-unit conversion;
- order and line-item GMV;
- proportional channel-fee allocation;
- Revenue, COGS, and Profit calculations;
- qualifying-order status rules.

All screens and reports will consume values produced by this shared logic. They may group those values by date, product, channel, bundle component, or campaign, but they must not redefine the formulas.

For a mixed-product order, channel fees are allocated to line items in proportion to each line's GMV. The allocated line fees must always add back to the order's total channel fee, subject only to normal floating-point rounding.

## Bundle Attribution

Sales totals must reconcile regardless of presentation:

- Order, Dashboard, and Reports totals use the sold bundle line as recorded.
- KPI may attribute a bundle's GMV, Revenue, and units to its base products using the configured bundle composition.
- Attribution changes only which product receives the amount; it must not change total GMV or Revenue.
- A bundle without a valid composition remains under its bundle SKU rather than disappearing from totals.

## Screen Changes

### Dashboard

- Replace the single ambiguous Total Revenue card with GMV, Revenue, and Profit.
- All three cards use all-time data, matching the Dashboard's existing scope.
- Add short tooltips with the canonical formulas.

### Reports

- Add GMV beside Revenue in summary cards, charts, channel tables, product tables, calendar details, and exports where applicable.
- Rename `Net Profit` to `Profit`.
- Keep the existing year and month filters.
- All totals, charts, and tables must reconcile for the same filter.

### KPI

- Keep the existing unit targets.
- Replace the financial target on each base-product row with `Target GMV`.
- Show Actual GMV, Revenue, and GMV progress.
- Remove the editable Revenue target from the interface.
- Continue showing the three base-product target rows and bundle attribution.
- If qualifying sales cannot be attributed to those three products, show them in a non-targetable `Other products and bundles` row instead of dropping them. This ensures the KPI grand total reconciles with Reports for the same month.
- Rename the stored KPI target from `target_revenue` to `target_gmv`. Preserve existing numeric target values during migration, then make it clear that users should review them because their meaning changes from after-fee Revenue to before-fee GMV.

### Orders

- Show the breakdown in this order: GMV, Channel Fees, Revenue, COGS, Profit.
- Replace existing `Net Profit` labels with `Profit`.

### Ads

- Use the canonical GMV, Revenue, and Profit values for attributed orders.
- Define ROAS as `GMV / Ad Spend`, matching common marketplace campaign reporting.
- Label it `GMV ROAS` anywhere ambiguity is possible.
- Keep `Profit After Ads = Profit - Ad Spend` as a separate metric.

### Email Reports

- Add GMV and use the same Revenue, COGS, Profit, and Profit After Ads definitions as the application.
- Daily KPI email progress is based on the monthly GMV target.

### Archived Finance Code

- Do not expand or restore the Finance UI.
- If retained finance helpers consume sales totals, update their field names so they do not reinterpret Revenue as GMV.
- Full accounting net profit remains outside the active dashboard workflow.

## Data Changes

- Add a database migration that renames or replaces `monthly_kpi_targets.target_revenue` with `target_gmv` while preserving current values.
- Update generated/manual TypeScript database types.
- No order schema change is required: GMV, Revenue, COGS, and Profit remain derived values.
- Do not store duplicated calculated totals on orders.

## Error Handling

- Missing channel fee: use zero.
- Missing historical cost snapshot: use current product cost and retain the existing legacy fallback.
- Missing product cost entirely: use zero only for existing legacy data, and surface the row as needing cost data rather than silently presenting the Profit as trustworthy.
- Missing bundle composition: retain the sale under the bundle SKU and include it in grand totals.
- Failed data queries continue to return the existing empty/error state, but calculations must never mix partially loaded product totals with complete order totals.

## Testing

Add tests for:

1. A single-product order with a channel fee.
2. A multi-product order with proportional fee allocation.
3. Bundle-of-two, bundle-of-three, and bundle-of-four COGS.
4. Paid and shipped inclusion.
5. Cancelled and returned exclusion.
6. Missing channel fee.
7. Historical cost snapshot and legacy cost fallback.
8. Bundle attribution that preserves grand totals.
9. Bundle without composition remaining visible.
10. Reports and KPI matching for the same month and qualifying sales.
11. UI contract checks that GMV appears and `Net Profit` no longer appears on sales screens.
12. Email calculations matching the application calculations.

## Acceptance Criteria

- `GMV` always means customer-paid sales before channel fees.
- `Revenue` always means GMV after channel fees.
- `Profit` always means Revenue after COGS.
- `Profit After Ads` always means Profit after advertising spend.
- Reports and KPI grand totals match when the same month and order population are selected.
- Dashboard, Reports, KPI, Orders, Ads, and emails use the same calculation source.
- The active UI contains no sales metric labeled `Net Profit`.
- KPI uses Target GMV as its only financial target, retains unit targets, and has no editable Revenue target.
- No full-finance workflow is added.
