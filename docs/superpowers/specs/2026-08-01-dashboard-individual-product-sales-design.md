# Dashboard Individual Product Sales Design

## Goal

Make the dashboard's daily Orders table a product-level unit summary. Bundle sales are expanded into their component products, and sales of the same product are combined across marketplaces.

## Scope

- Keep the selected date, order count, total unit count, and daily total revenue summary.
- Replace channel-specific rows with one row per individual product SKU.
- Expand bundle line items using `bundle_compositions`.
- Respect component quantities, order quantities, and pack-size multipliers.
- Remove the per-product Revenue and Platform columns.
- Do not change stored orders, finance data, reports, or other dashboard sections.

## Data Flow

`getDailySalesSnippet` loads paid or shipped orders for the selected date, the product catalog, and bundle compositions. Each direct product line contributes its effective unit quantity to that SKU. Each bundle line contributes its effective unit quantity multiplied by each composition quantity to the corresponding component SKU. Results are combined by component SKU across all channels and sorted by quantity descending, then product name.

Daily total revenue continues to use the existing order gross value less channel fees. The table does not allocate revenue to component products.

## Error Handling

If a sold SKU has no bundle composition, it remains a direct product row rather than disappearing. Missing product metadata falls back to displaying the SKU. An empty sales day retains the existing empty state.

## Testing

Add focused unit coverage proving that:

- a bundle expands into its component quantities;
- direct and bundled units combine under the same product;
- sales from different channels combine into one row;
- pack-size multipliers are respected;
- total daily revenue and order count remain unchanged;
- the dashboard table no longer renders Revenue or Platform columns.
