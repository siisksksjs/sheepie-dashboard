# Dashboard and Reports Visual Polish Design

## Goal

Make dashboard and report numbers easy to read, remove irrelevant bundle stock and KPI rows, and present financial metrics in one professional and predictable order.

## Scope

This change is presentation and filtering work. It does not change the canonical sales formulas:

- GMV = customer-paid amount before channel fees
- Revenue = GMV minus channel fees
- Cost = COGS
- Profit = Revenue minus Cost

## Dashboard

- Replace the six-column desktop stat grid with a wider responsive layout so long Indonesian currency values cannot overlap adjacent cards.
- Allow currency values to scale down at narrower widths without clipping.
- Keep Dashboard financial cards as GMV, Revenue, and Profit; Reports provides the complete four-metric financial comparison.
- Show only non-bundle product rows in Stock Overview.
- Update Stock Overview text so it no longer claims bundle availability is included.
- Continue using physical, non-bundle inventory for product count and stock-unit totals.

## Reports visual direction

Use the approved “Executive analytics” direction while preserving the existing Sheepie visual language.

### Shared chart behavior

- Format financial axes using compact Indonesian currency labels such as `Rp 500 rb`, `Rp 25 jt`, and `Rp 1,2 M`.
- Reserve enough chart margin for the complete axis labels.
- Use subtle gridlines and stronger series contrast.
- Use solid, high-contrast tooltip cards with a border, shadow, readable spacing, and no transparent text over chart lines.
- Display financial metrics in this order everywhere: GMV, Revenue, Cost, Profit.
- Use consistent colors: purple for GMV, blue for Revenue, amber/red for Cost, and green for Profit.

### Trends

- Keep one combined line chart so the relationship between the four metrics is visible.
- Render GMV, Revenue, Cost, and Profit in the canonical order in the legend and tooltip.
- Give lines clear point markers and hover emphasis.
- Use a custom ordered tooltip rather than Recharts’ default floating label list.

### Channels

- Replace the narrow grouped vertical financial bars with a horizontal comparison chart.
- Include all four financial metrics: GMV, Revenue, Cost, and Profit.
- Sort channel rows by GMV descending.
- Keep the order-distribution chart, but move its labels to a readable legend/tooltip treatment when small slices would collide.
- Update the details table to order financial columns as GMV, Revenue, Cost, Profit. Fees remain an operational column after the four financial metrics.

### Products

- Use horizontal financial comparison bars with enough space for wrapped product names.
- Include GMV, Revenue, Cost, and Profit in one consistent ordered comparison.
- Sort product rows by GMV descending for chart and details-table presentation.
- Remove the separate Profit-only chart because the combined chart already communicates product profitability and avoids duplicated visual space.
- Keep units and margin in the details table after the four core financial metrics.

### Summary cards

- Add a Cost/COGS summary card between Revenue and Profit.
- Order the cards as GMV, Revenue, Cost, Profit, Units Sold, Average Order Value.
- Use responsive column counts and compact values to avoid overlap.

## Calendar views

- Add GMV to every month card in the yearly calendar.
- Add GMV to every daily cell/detail view where Revenue is shown.
- Add GMV as a Heatmap Basis option for both monthly and yearly calendar modes.
- When the heatmap is based on money, use the selected financial metric consistently for intensity and the peak summary.
- Order displayed calendar financial values as GMV, Revenue, Profit. Cost is not added to compact calendar cards because the requested calendar addition is GMV and space is constrained.

## KPI scope

- KPI covers exactly these three base products: CerviCloud Pillow, LumiCloud Eye Mask, and CalmiCloud Ear Plug.
- Remove the synthetic `Other products and bundles` card and target row.
- Exclude unmatched SKUs and bundle sales from all KPI totals, progress values, and KPI summaries.
- Do not delete or alter the underlying order data. Other and bundle sales continue to appear in company-wide Dashboard and Reports totals.

## Data flow

- Reuse existing report aggregates and canonical sales calculations.
- Add no new financial formulas.
- Derive chart ordering and display sorting in report presentation helpers so all affected charts use the same rules.
- Filter KPI actuals and totals at the KPI workspace/action boundary so the UI cannot accidentally include the synthetic other bucket.

## Responsive and accessibility requirements

- Financial values must remain inside their cards at desktop and tablet widths.
- Axis labels must not be clipped.
- Tooltips must have an opaque background and sufficient contrast.
- Charts retain text legends and tooltips rather than relying only on color.
- Product/channel labels may wrap or truncate with a full tooltip where needed.

## Verification

- Add automated coverage for the three-product KPI scope.
- Add source/UI contract tests for bundle removal, calendar GMV, canonical metric ordering, and compact financial-axis formatting.
- Run the relevant test suite, TypeScript checks, production build, and diff checks.
- Inspect Dashboard, Reports Trends, Channels, Products, monthly calendar, yearly calendar, and KPI in a browser at desktop and narrower widths.

## Out of scope

- Changes to GMV, Revenue, Cost, or Profit formulas.
- Full accounting or finance features.
- Removing bundle sales from company-wide sales reports.
- Redesigning unrelated pages or the overall Sheepie brand system.
