# Unified Sales Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make GMV, Revenue, COGS, Profit, and Profit After Ads use one calculation and one name across every active dashboard surface.

**Architecture:** Add a pure TypeScript calculation module under Supabase's shared function directory so both the Next.js app and Edge Functions can import the same formulas. Existing server actions remain responsible for fetching and grouping data, while all monetary arithmetic and qualifying-status decisions move to the shared module. Derived metrics remain unstored; only the KPI target column changes from Revenue to GMV.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase/Postgres, Supabase Edge Functions, Vitest

---

## File Map

**Create**

- `supabase/functions/_shared/sales-metrics.ts` — canonical pure formulas and sales-status rules.
- `lib/sales-metrics.test.ts` — unit tests for the canonical formulas.
- `supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql` — preserves KPI targets while changing their meaning and name.
- `lib/kpi/workspace.ts` — pure KPI attribution and reconciliation logic.
- `lib/kpi/workspace.test.ts` — KPI bundle attribution and reconciliation tests.
- `lib/orders/sales-metrics-contract.test.ts` — cross-surface source contract preventing local formula drift.

**Modify**

- `lib/products/pack-sizes.ts` — delegate pack multiplication to the shared module.
- `lib/line-item-costs.ts` — delegate cost resolution and COGS to the shared module.
- `lib/types/database.types.ts` — rename KPI target field.
- `lib/actions/orders.ts` — emit GMV alongside Revenue and use shared calculations.
- `lib/orders/daily-sales.ts` and `lib/orders/daily-sales.test.ts` — provide daily GMV and Revenue.
- `lib/actions/products.ts` — use shared line metrics for projected Revenue history.
- `app/(dashboard)/dashboard/page.tsx` — display GMV, Revenue, and Profit.
- `app/(dashboard)/reports/reports-client.tsx` — add GMV and rename Net Profit.
- `lib/ads/reports-contract.test.ts` — update report fixtures and UI contracts.
- `components/orders/order-detail-client.tsx` — show the canonical order breakdown.
- `components/orders/orders-list-client.tsx` — add GMV and rename Profit.
- `lib/actions/kpi.ts` — calculate actual GMV and Revenue, preserve unmatched sales, and save Target GMV.
- `app/(dashboard)/kpi/kpi-client.tsx` — retain unit targets and replace Revenue targets with GMV targets.
- `supabase/functions/send-daily-kpi-report/index.ts` — use Target/Actual GMV and report Revenue separately.
- `lib/notifications/email-html.ts` and `supabase/functions/_shared/email-html.ts` — update KPI and sales email labels.
- `lib/notifications/email-html.test.ts` and `lib/notifications/source-contracts.test.ts` — enforce email metric names and shared imports.
- `lib/ads/reporting.ts` and `lib/ads/reporting.test.ts` — add GMV and canonical Profit.
- `lib/actions/ad-campaigns.ts` — add GMV to legacy campaign metrics and use GMV ROAS.
- `components/ad-campaigns/ads-setup-workspace.tsx` — show GMV, Revenue, Profit, and Profit After Ads.
- `app/(dashboard)/ad-campaigns/page.tsx` and `app/(dashboard)/ad-campaigns/[id]/page.tsx` — update legacy campaign cards and tables.
- `supabase/functions/send-sales-report/index.ts` — calculate email report metrics through the shared module.
- `lib/notifications/email-html.ts` and `supabase/functions/_shared/email-html.ts` — render GMV beside Revenue.
- `lib/marketplace-settlements.ts` — derive settlement Revenue through the shared engine.
- `lib/actions/finance.ts` — consume explicit GMV and Revenue fields without reconstructing GMV.
- `FINANCE_SOP.md` and `ENHANCED_REPORTS.md` — document the same vocabulary as the active UI.

Do not stage or modify the user's existing unrelated changes in `lib/actions/inventory.ts` or `lib/inventory/`.

### Task 1: Canonical sales-metrics engine

**Files:**
- Create: `supabase/functions/_shared/sales-metrics.ts`
- Create: `lib/sales-metrics.test.ts`
- Modify: `lib/products/pack-sizes.ts`
- Modify: `lib/line-item-costs.ts`

- [ ] **Step 1: Write failing formula tests**

Create `lib/sales-metrics.test.ts` with these complete cases:

```ts
import { describe, expect, it } from "vitest"

import {
  calculateSalesOrder,
  getSalesPackMultiplier,
  isQualifyingSalesStatus,
} from "@/supabase/functions/_shared/sales-metrics"

describe("canonical sales metrics", () => {
  it("calculates GMV, Revenue, COGS, and Profit for a mixed order", () => {
    const result = calculateSalesOrder({
      channelFees: 20_000,
      lines: [
        { key: "A", sellingPrice: 100_000, quantity: 1, packSize: "single", unitCost: 40_000 },
        { key: "B", sellingPrice: 50_000, quantity: 2, packSize: "single", unitCost: 20_000 },
      ],
    })

    expect(result.totals).toMatchObject({
      gmv: 200_000,
      channelFees: 20_000,
      revenue: 180_000,
      cogs: 80_000,
      profit: 100_000,
      hasCompleteCostData: true,
    })
    expect(result.lines.map((line) => line.channelFees)).toEqual([10_000, 10_000])
  })

  it("uses physical units for pack COGS", () => {
    const result = calculateSalesOrder({
      channelFees: null,
      lines: [
        { key: "pack", sellingPrice: 270_000, quantity: 2, packSize: "bundle_3", unitCost: 30_000 },
      ],
    })

    expect(result.lines[0]).toMatchObject({ units: 6, gmv: 540_000, revenue: 540_000, cogs: 180_000, profit: 360_000 })
  })

  it("treats a missing fee as zero and flags missing costs", () => {
    const result = calculateSalesOrder({
      channelFees: null,
      lines: [{ key: "legacy", sellingPrice: 75_000, quantity: 1, packSize: null, unitCost: null }],
    })

    expect(result.totals).toMatchObject({ gmv: 75_000, channelFees: 0, revenue: 75_000, cogs: 0, profit: 75_000, hasCompleteCostData: false })
  })

  it("defines the one qualifying-order rule", () => {
    expect(isQualifyingSalesStatus("paid")).toBe(true)
    expect(isQualifyingSalesStatus("shipped")).toBe(true)
    expect(isQualifyingSalesStatus("cancelled")).toBe(false)
    expect(isQualifyingSalesStatus("returned")).toBe(false)
  })

  it("uses the canonical pack multipliers", () => {
    expect(["single", "bundle_2", "bundle_3", "bundle_4"].map(getSalesPackMultiplier)).toEqual([1, 2, 3, 4])
  })
})
```

- [ ] **Step 2: Run the tests and confirm the module is missing**

Run: `npm test -- lib/sales-metrics.test.ts`

Expected: FAIL because `supabase/functions/_shared/sales-metrics.ts` does not exist.

- [ ] **Step 3: Implement the pure shared module**

Create `supabase/functions/_shared/sales-metrics.ts` with this public contract:

```ts
export type SalesPackSize = "single" | "bundle_2" | "bundle_3" | "bundle_4"

export type SalesLineInput<Key extends string = string> = {
  key: Key
  sellingPrice: number
  quantity: number
  packSize?: SalesPackSize | null
  unitCost?: number | null
}

export type SalesLineMetrics<Key extends string = string> = {
  key: Key
  units: number
  gmv: number
  channelFees: number
  revenue: number
  cogs: number
  profit: number
  hasCompleteCostData: boolean
}

export const QUALIFYING_SALES_STATUSES = ["paid", "shipped"] as const

export function getSalesPackMultiplier(packSize?: SalesPackSize | string | null) {
  if (packSize === "bundle_2") return 2
  if (packSize === "bundle_3") return 3
  if (packSize === "bundle_4") return 4
  return 1
}

export function isQualifyingSalesStatus(status: string) {
  return QUALIFYING_SALES_STATUSES.some((candidate) => candidate === status)
}

export function resolveSalesUnitCost(snapshot?: number | null, current?: number | null) {
  if (snapshot !== null && snapshot !== undefined) return Number(snapshot)
  if (current !== null && current !== undefined) return Number(current)
  return null
}

export function calculateSalesOrder<Key extends string>(input: {
  channelFees?: number | null
  lines: SalesLineInput<Key>[]
}) {
  const prepared = input.lines.map((line) => {
    const quantity = Number(line.quantity || 0)
    const units = quantity * getSalesPackMultiplier(line.packSize)
    const gmv = Number(line.sellingPrice || 0) * quantity
    const hasCompleteCostData = line.unitCost !== null && line.unitCost !== undefined
    const cogs = hasCompleteCostData ? Number(line.unitCost) * units : 0
    return { ...line, units, gmv, cogs, hasCompleteCostData }
  })
  const gmv = prepared.reduce((sum, line) => sum + line.gmv, 0)
  const channelFees = prepared.length > 0 ? Number(input.channelFees || 0) : 0
  let allocatedFees = 0
  const lines: SalesLineMetrics<Key>[] = prepared.map((line, index) => {
    const isLast = index === prepared.length - 1
    const lineFees = isLast
      ? channelFees - allocatedFees
      : gmv > 0
        ? (channelFees * line.gmv) / gmv
        : 0
    allocatedFees += lineFees
    const revenue = line.gmv - lineFees
    return {
      key: line.key,
      units: line.units,
      gmv: line.gmv,
      channelFees: lineFees,
      revenue,
      cogs: line.cogs,
      profit: revenue - line.cogs,
      hasCompleteCostData: line.hasCompleteCostData,
    }
  })
  const totals = lines.reduce(
    (sum, line) => ({
      gmv: sum.gmv + line.gmv,
      channelFees: sum.channelFees + line.channelFees,
      revenue: sum.revenue + line.revenue,
      cogs: sum.cogs + line.cogs,
      profit: sum.profit + line.profit,
      hasCompleteCostData: sum.hasCompleteCostData && line.hasCompleteCostData,
    }),
    { gmv: 0, channelFees: 0, revenue: 0, cogs: 0, profit: 0, hasCompleteCostData: true },
  )
  return { lines, totals }
}
```

Then make `getPackMultiplier()` in `lib/products/pack-sizes.ts` call `getSalesPackMultiplier()`, and make `getLineItemCostPerUnit()` return `resolveSalesUnitCost(...) ?? 0`. Preserve the existing public signatures so unrelated inventory code does not change. Replace hard-coded paid/shipped query arrays with `[...QUALIFYING_SALES_STATUSES]` wherever the query does not intentionally load returned orders for a separate return summary.

- [ ] **Step 4: Run focused tests**

Run: `npm test -- lib/sales-metrics.test.ts lib/products/pack-sizes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the metric engine**

```bash
git add supabase/functions/_shared/sales-metrics.ts lib/sales-metrics.test.ts lib/products/pack-sizes.ts lib/line-item-costs.ts
git commit -m "feat(metrics): add canonical sales calculations"
```

### Task 2: Reports and daily sales data

**Files:**
- Modify: `lib/actions/orders.ts`
- Modify: `lib/orders/daily-sales.ts`
- Modify: `lib/orders/daily-sales.test.ts`
- Create: `lib/orders/sales-metrics-contract.test.ts`
- Modify: `lib/actions/products.ts`

- [ ] **Step 1: Extend daily-sales expectations with GMV**

Update the first expected object in `lib/orders/daily-sales.test.ts`:

```ts
expect(result).toEqual({
  date: "2026-08-01",
  totalOrders: 3,
  totalUnits: 5,
  totalGmv: 530_000,
  totalRevenue: 500_000,
  items: [
    { sku: "Lumi-001", productName: "LumiCloud Eye Mask - Standard", quantity: 4 },
    { sku: "Calmi-001", productName: "CalmiCloud Ear Plug - Standard", quantity: 1 },
  ],
})
```

Create `lib/orders/sales-metrics-contract.test.ts` to require shared imports and the new report fields:

```ts
import fs from "node:fs"
import { describe, expect, it } from "vitest"

const orders = fs.readFileSync("lib/actions/orders.ts", "utf8")
const daily = fs.readFileSync("lib/orders/daily-sales.ts", "utf8")
const products = fs.readFileSync("lib/actions/products.ts", "utf8")

describe("sales calculation consumers", () => {
  it("uses the canonical calculator in order, daily, and projection paths", () => {
    for (const source of [orders, daily, products]) {
      expect(source).toContain("calculateSalesOrder")
    }
  })

  it("exposes GMV alongside Revenue in report rows", () => {
    expect(orders).toMatch(/type ProductSalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
    expect(orders).toMatch(/type ChannelSalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
    expect(orders).toMatch(/type MonthlySalesRow = \{[\s\S]*gmv: number[\s\S]*revenue: number/)
  })
})
```

- [ ] **Step 2: Run the focused tests and confirm they fail**

Run: `npm test -- lib/orders/daily-sales.test.ts lib/orders/sales-metrics-contract.test.ts`

Expected: FAIL because GMV and the shared imports are absent.

- [ ] **Step 3: Refactor report aggregation to shared metrics**

In every qualifying order loop in `lib/actions/orders.ts`, build the shared input once:

```ts
const calculatedOrder = calculateSalesOrder({
  channelFees: order.channel_fees,
  lines: lineItems.map((item, index) => {
    const product = productMap.get(item.sku)
    return {
      key: String(index),
      sellingPrice: item.selling_price || 0,
      quantity: item.quantity || 0,
      packSize: item.pack_size,
      unitCost: resolveSalesUnitCost(item.cost_per_unit_snapshot, product?.cost_per_unit),
    }
  }),
})
```

Use `calculatedOrder.lines[index]` for line GMV, fees, Revenue, COGS, Profit, and units. Add `gmv` to `ProductSalesRow`, `ChannelSalesRow`, `MonthlySalesRow`, `CalendarItemRow`, `CalendarDayRow`, and `ChannelProductRow`. Add `has_complete_cost_data` to profit-bearing report rows and combine it with logical AND while aggregating. Add totals using `calculatedOrder.totals`; do not retain local `selling_price * quantity - allocatedFee` formulas.

For returned orders, keep return counters separate and use the shared pack multiplier only; do not include their monetary values in sales totals.

In `lib/orders/daily-sales.ts`, use `calculateSalesOrder()` per order and return both `totalGmv` and `totalRevenue`.

In `lib/actions/products.ts`, use the shared line values for historical averages. Keep projected Revenue based on after-fee Revenue; do not rename it to GMV.

- [ ] **Step 4: Run order and report tests**

Run: `npm test -- lib/orders/daily-sales.test.ts lib/orders/dashboard-daily-sales.test.ts lib/orders/sales-metrics-contract.test.ts lib/ads/reports-contract.test.ts`

Expected: PASS after updating report fixtures in `lib/ads/reports-contract.test.ts` with `gmv: 0` wherever report rows are constructed.

- [ ] **Step 5: Commit report data changes**

```bash
git add lib/actions/orders.ts lib/orders/daily-sales.ts lib/orders/daily-sales.test.ts lib/orders/sales-metrics-contract.test.ts lib/actions/products.ts lib/ads/reports-contract.test.ts
git commit -m "refactor(reports): use canonical GMV and Revenue"
```

### Task 3: Dashboard and Reports UI

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/reports/reports-client.tsx`
- Modify: `lib/orders/dashboard-daily-sales.test.ts`
- Modify: `lib/ads/reports-contract.test.ts`

- [ ] **Step 1: Add failing UI label assertions**

Add these assertions to the existing dashboard/report contract tests:

```ts
expect(dashboardSource).toContain("Total GMV")
expect(dashboardSource).toContain("Total Revenue")
expect(dashboardSource).toContain("Profit")
expect(dashboardSource).toContain("Daily GMV")
expect(dashboardSource).toContain("Daily Revenue")
expect(reportsClientSource).toContain("Total GMV")
expect(reportsClientSource).toContain("Total Revenue")
expect(reportsClientSource).toContain("Profit")
expect(reportsClientSource).not.toContain("Net Profit")
```

- [ ] **Step 2: Run UI contract tests and confirm failure**

Run: `npm test -- lib/orders/dashboard-daily-sales.test.ts lib/ads/reports-contract.test.ts`

Expected: FAIL on missing GMV labels and existing Net Profit text.

- [ ] **Step 3: Update Dashboard cards and daily summary**

Calculate card values from the report rows:

```ts
const totalGmv = salesReport.byChannel.reduce((sum, channel) => sum + channel.gmv, 0)
const totalRevenue = salesReport.byChannel.reduce((sum, channel) => sum + channel.revenue, 0)
const totalProfit = salesReport.byChannel.reduce((sum, channel) => sum + channel.profit, 0)
```

Render three cards with these exact tooltips:

```tsx
<InfoTooltip content="GMV calculation" formula="What customers paid before channel fees" />
<InfoTooltip content="Revenue calculation" formula="GMV - Channel Fees" />
<InfoTooltip content="Profit calculation" formula="Revenue - COGS" />
```

Change the daily text block to show `dailySales.totalGmv` and `dailySales.totalRevenue` on separate labeled lines.

- [ ] **Step 4: Update all Reports representations**

Add `gmv` to client row types and derived totals:

```ts
const totalGmv = overviewReport?.byChannel.reduce((sum: number, channel: any) => sum + channel.gmv, 0) || 0
const totalRevenue = overviewReport?.byChannel.reduce((sum: number, channel: any) => sum + channel.revenue, 0) || 0
const totalProfit = overviewReport?.byChannel.reduce((sum: number, channel: any) => sum + channel.profit, 0) || 0
const avgOrderValue = totalOrders > 0 ? totalGmv / totalOrders : 0
const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
```

Add GMV to summary cards, trend charts, channel tables, product tables, pack/channel tables, calendar details, and chart tooltips. Replace every sales-facing `Net Profit` label with `Profit`. Use these formulas in tooltips:

```text
GMV = Selling Price x Purchased Quantity
Revenue = GMV - Allocated Channel Fees
Profit = Revenue - COGS
Profit Margin = Profit / Revenue x 100
Average Order Value = GMV / Orders
```

If any included line lacks both a historical cost snapshot and a current product cost, show `Cost data missing—Profit may be overstated` on the Profit summary and mark the affected product row. GMV and Revenue remain usable.

- [ ] **Step 5: Run UI tests and typecheck**

Run: `npm test -- lib/orders/dashboard-daily-sales.test.ts lib/ads/reports-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Dashboard and Reports UI**

```bash
git add 'app/(dashboard)/dashboard/page.tsx' 'app/(dashboard)/reports/reports-client.tsx' lib/orders/dashboard-daily-sales.test.ts lib/ads/reports-contract.test.ts
git commit -m "feat(ui): show GMV beside Revenue in sales reports"
```

### Task 4: Order list and detail surfaces

**Files:**
- Modify: `lib/actions/orders.ts`
- Modify: `components/orders/order-detail-client.tsx`
- Modify: `components/orders/orders-list-client.tsx`
- Create: `lib/orders/order-metrics-ui.test.ts`

- [ ] **Step 1: Write failing order UI contracts**

Create `lib/orders/order-metrics-ui.test.ts`:

```ts
import fs from "node:fs"
import { describe, expect, it } from "vitest"

const action = fs.readFileSync("lib/actions/orders.ts", "utf8")
const detail = fs.readFileSync("components/orders/order-detail-client.tsx", "utf8")
const list = fs.readFileSync("components/orders/orders-list-client.tsx", "utf8")

describe("order metric UI", () => {
  it("returns and displays canonical fields", () => {
    expect(action).toContain("gmv")
    expect(action).toContain("profit")
    expect(detail).toContain("GMV")
    expect(detail).toContain("Channel Fees")
    expect(detail).toContain("Revenue")
    expect(detail).toContain("COGS")
    expect(detail).toContain("Profit")
    expect(list).toContain("GMV")
    expect(list).toContain("Revenue")
    expect(list).toContain("Profit")
    expect(`${detail}\n${list}`).not.toContain("Net Profit")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- lib/orders/order-metrics-ui.test.ts`

Expected: FAIL on GMV and Profit field names.

- [ ] **Step 3: Replace local order-detail arithmetic**

Have `getOrders()` expose:

```ts
{
  ...order,
  order_line_items: lineItemsWithDetails,
  gmv: metrics.totals.gmv,
  channel_fees: metrics.totals.channelFees,
  revenue: metrics.totals.revenue,
  total_cogs: metrics.totals.cogs,
  profit: metrics.totals.profit,
  has_complete_cost_data: metrics.totals.hasCompleteCostData,
}
```

In order detail, call the shared calculator once with the supplied order and product costs. Render the breakdown in this exact order: GMV, Channel Fees, Revenue, COGS, Profit. When `hasCompleteCostData` is false, show `Cost data missing—Profit may be overstated.`

Update mobile and desktop order lists to use `order.gmv`, `order.revenue`, and `order.profit`.

- [ ] **Step 4: Run tests and typecheck**

Run: `npm test -- lib/orders/order-metrics-ui.test.ts lib/orders/duplicate-order.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit order surfaces**

```bash
git add lib/actions/orders.ts components/orders/order-detail-client.tsx components/orders/orders-list-client.tsx lib/orders/order-metrics-ui.test.ts
git commit -m "feat(orders): show canonical sales breakdown"
```

### Task 5: KPI target migration and workspace logic

**Files:**
- Create: `supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql`
- Modify: `lib/types/database.types.ts`
- Create: `lib/kpi/workspace.ts`
- Modify: `lib/actions/kpi.ts`
- Create: `lib/kpi/workspace.test.ts`

- [ ] **Step 1: Write failing migration and workspace contracts**

Create `lib/kpi/workspace.test.ts` with source and pure-helper assertions. Put `buildKpiActuals()` in `lib/kpi/workspace.ts` so the logic can be tested without importing a server action:

```ts
import fs from "node:fs"
import { describe, expect, it } from "vitest"
import { buildKpiActuals } from "@/lib/kpi/workspace"

describe("KPI GMV workspace", () => {
  it("preserves bundle totals and retains unmatched sales", () => {
    const result = buildKpiActuals({
      orders: [{
        channel_fees: 30_000,
        order_line_items: [
          { sku: "Lumi-Calmi-Kit", quantity: 1, pack_size: "single", selling_price: 240_000 },
          { sku: "Other-001", quantity: 1, pack_size: "single", selling_price: 60_000 },
        ],
      }],
      products: [
        { sku: "Lumi-Calmi-Kit", name: "Kit", variant: null, is_bundle: true },
        { sku: "Other-001", name: "Other", variant: null, is_bundle: false },
      ],
      bundleCompositions: [
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Lumi-001", quantity: 1 },
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Calmi-001", quantity: 1 },
      ],
    })

    expect(result.totals).toMatchObject({ actual_gmv: 300_000, actual_revenue: 270_000 })
    expect(result.other).toMatchObject({ actual_gmv: 60_000, actual_revenue: 54_000 })
    expect(result.bySku.get("Lumi-001")?.actual_gmv).toBe(120_000)
    expect(result.bySku.get("Calmi-001")?.actual_gmv).toBe(120_000)
  })

  it("defines a target_gmv database migration", () => {
    const migration = fs.readFileSync("supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql", "utf8")
    const types = fs.readFileSync("lib/types/database.types.ts", "utf8")
    expect(migration).toMatch(/rename column target_revenue to target_gmv/i)
    expect(types).toContain("target_gmv: number")
    expect(types).not.toContain("target_revenue: number")
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- lib/kpi/workspace.test.ts`

Expected: FAIL because the migration and `buildKpiActuals()` do not exist.

- [ ] **Step 3: Add the preserving migration**

Create `supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql`:

```sql
ALTER TABLE monthly_kpi_targets
RENAME COLUMN target_revenue TO target_gmv;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'monthly_kpi_targets_target_revenue_check'
  ) THEN
    ALTER TABLE monthly_kpi_targets
    RENAME CONSTRAINT monthly_kpi_targets_target_revenue_check
    TO monthly_kpi_targets_target_gmv_check;
  END IF;
END $$;
```

Update `MonthlyKpiTarget.target_revenue` to `target_gmv` in `lib/types/database.types.ts`.

- [ ] **Step 4: Extract and use `buildKpiActuals()`**

Give `buildKpiActuals()` this result contract:

```ts
type KpiActual = { actual_units: number; actual_gmv: number; actual_revenue: number }

export function buildKpiActuals(input: {
  orders: KpiOrder[]
  products: KpiProductCatalogRow[]
  bundleCompositions: Array<Pick<BundleComposition, "bundle_sku" | "component_sku" | "quantity">>
}): {
  bySku: Map<string, KpiActual>
  other: KpiActual
  totals: KpiActual
}
```

For each order, use `calculateSalesOrder()`. Attribute bundle line GMV and Revenue using the same component-unit weights. Direct non-base products, inactive base products, and bundles without qualifying base components go into `other`. Ensure `base rows + other = totals` for GMV and Revenue.

Import the helper into `lib/actions/kpi.ts`, then update `KpiProductRow` and workspace totals:

```ts
type KpiProductRow = {
  sku: string
  name: string
  variant: string | null
  is_targetable: boolean
  target_units: number
  target_gmv: number
  actual_units: number
  actual_gmv: number
  actual_revenue: number
}
```

Append an `Other products and bundles` row only when any unmatched actual is non-zero. Set `is_targetable: false`, `target_units: 0`, and `target_gmv: 0`.

Rename `revenue_progress` to `gmv_progress`; calculate `overall_progress` from unit progress and GMV progress. Save only targetable base rows with `target_gmv`.

- [ ] **Step 5: Run KPI tests and typecheck**

Run: `npm test -- lib/kpi/workspace.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit KPI data and migration**

```bash
git add supabase/migrations/20260812_rename_kpi_target_revenue_to_gmv.sql lib/types/database.types.ts lib/kpi/workspace.ts lib/actions/kpi.ts lib/kpi/workspace.test.ts
git commit -m "feat(kpi): replace Revenue targets with GMV targets"
```

### Task 6: KPI UI and daily KPI email

**Files:**
- Modify: `app/(dashboard)/kpi/kpi-client.tsx`
- Modify: `supabase/functions/send-daily-kpi-report/index.ts`
- Modify: `lib/notifications/email-html.ts`
- Modify: `supabase/functions/_shared/email-html.ts`
- Modify: `lib/notifications/email-html.test.ts`
- Modify: `lib/notifications/source-contracts.test.ts`

- [ ] **Step 1: Add failing KPI UI and email contracts**

Extend `lib/notifications/source-contracts.test.ts`:

```ts
const kpiUi = await readFile("app/(dashboard)/kpi/kpi-client.tsx", "utf8")
const sharedMetrics = await readFile("supabase/functions/_shared/sales-metrics.ts", "utf8")

expect(kpiReportSource).toContain('from "../_shared/sales-metrics.ts"')
expect(sharedMetrics).toContain("calculateSalesOrder")
expect(kpiUi).toContain("Target GMV")
expect(kpiUi).toContain("Actual GMV")
expect(kpiUi).toContain("Revenue")
expect(kpiUi).not.toContain("Target Revenue")
```

Update KPI email fixture shapes to use `targetGmv`, `actualGmv`, `remainingGmv`, `todayGmvPace`, and `gmvProgress`, plus `dailySales.totalGmv` and `dailySales.totalRevenue`.

- [ ] **Step 2: Run email and source tests and confirm failure**

Run: `npm test -- lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts`

Expected: FAIL on old Revenue-target fields.

- [ ] **Step 3: Update KPI client**

Retain Target Units. Replace every editable `target_revenue` with `target_gmv`, add read-only Actual GMV and Revenue columns, and base monetary progress on GMV:

```ts
const gmvProgress = getProgress(base.actual_gmv, base.target_gmv)
const overallProgress = (unitsProgress + gmvProgress) / 2
```

Disable inputs for `is_targetable === false`, label that row `Other products and bundles`, and exclude it from target saving while including it in actual grand totals.

Under the KPI heading, add the plain-language note: `GMV is customer sales before channel fees. Existing saved money targets were preserved—please review them once as GMV targets.`

- [ ] **Step 4: Update daily KPI Edge Function and templates**

Import `calculateSalesOrder` and `getSalesPackMultiplier` from `../_shared/sales-metrics.ts`. Replace local pack and fee arithmetic. Use these payload fields consistently in the Edge Function and both HTML renderers:

```ts
type DailyKpiMoney = {
  targetGmv: number
  actualGmv: number
  actualRevenue: number
  remainingGmv: number
  todayGmvPace: number
  gmvProgress: number
}
```

The daily-sales section must include `totalGmv` and `totalRevenue`; item rows include both `gmv` and `revenue`. Unmatched sales appear under `Other products and bundles` and contribute to grand actuals but not targets.

- [ ] **Step 5: Run KPI, email, and type tests**

Run: `npm test -- lib/kpi/workspace.test.ts lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit KPI UI and email**

```bash
git add 'app/(dashboard)/kpi/kpi-client.tsx' supabase/functions/send-daily-kpi-report/index.ts lib/notifications/email-html.ts supabase/functions/_shared/email-html.ts lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts
git commit -m "feat(kpi): show GMV targets and Revenue actuals"
```

### Task 7: Ads metrics and campaign UI

**Files:**
- Modify: `lib/ads/reporting.ts`
- Modify: `lib/ads/reporting.test.ts`
- Modify: `lib/actions/ad-campaigns.ts`
- Modify: `components/ad-campaigns/ads-setup-workspace.tsx`
- Modify: `app/(dashboard)/ad-campaigns/page.tsx`
- Modify: `app/(dashboard)/ad-campaigns/[id]/page.tsx`
- Modify: `lib/ads/reports-contract.test.ts`
- Modify: `lib/ads/workspace-ui.test.ts`

- [ ] **Step 1: Update failing ads expectations**

For each `SkuChannelMonthlyPerformance` fixture, add `gmv`. Example:

```ts
{
  sku: "Lumi-001",
  channel: "shopee",
  units: 10,
  gmv: 4_400_000,
  revenue: 4_000_000,
  cost: 2_000_000,
  profit: 2_000_000,
}
```

Add UI assertions:

```ts
expect(workspaceSource).toContain("GMV")
expect(workspaceSource).toContain("Revenue")
expect(workspaceSource).toContain("Profit After Ads")
expect(campaignPageSource).toContain("GMV ROAS")
expect(campaignDetailSource).not.toContain("Net Profit")
```

- [ ] **Step 2: Run ads tests and confirm failure**

Run: `npm test -- lib/ads/reporting.test.ts lib/ads/reports-contract.test.ts lib/ads/workspace-ui.test.ts`

Expected: FAIL because ads reports do not expose GMV.

- [ ] **Step 3: Refactor SKU ads reporting**

Add `gmv` to `SkuChannelMonthlyPerformance` and `SkuMonthlyChannelSummary`. Replace `calculateLineItemRevenue()` with `calculateSalesOrder()` once per order, then aggregate each returned line:

```ts
const lineMetrics = calculatedOrder.lines[index]
existing.gmv += lineMetrics.gmv
existing.revenue += lineMetrics.revenue
existing.cost += lineMetrics.cogs
existing.profit += lineMetrics.profit
```

Rename summary `gross_profit` to `profit`. Keep `profit_after_ads = profit - ads spend`.

- [ ] **Step 4: Refactor legacy campaign metrics**

Change attributed order output from `net_profit` to `profit` and add `gmv`. Aggregate campaign totals with:

```ts
const totalGmv = attributedOrders.reduce((sum, order) => sum + order.gmv, 0)
const totalRevenue = attributedOrders.reduce((sum, order) => sum + order.revenue, 0)
const totalProfit = attributedOrders.reduce((sum, order) => sum + order.profit, 0)
const gmvRoas = campaign.total_spend > 0 ? totalGmv / campaign.total_spend : 0
```

Expose `total_gmv` and `overall_gmv_roas` from the all-campaign summary. Remove the ambiguous `overall_roas` name.

- [ ] **Step 5: Update ads UI**

Show GMV beside Revenue wherever campaign sales appear. Rename `ROAS` to `GMV ROAS`, `Net Profit` to `Profit`, and preserve `Profit After Ads` as a distinct metric. Shared-budget rows continue showing Profit After Ads as unavailable where the current allocation cannot support it.

- [ ] **Step 6: Run ads suite and typecheck**

Run: `npm test -- lib/ads/reporting.test.ts lib/ads/reports-contract.test.ts lib/ads/workspace-ui.test.ts lib/ads/workspace-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit ads changes**

```bash
git add lib/ads/reporting.ts lib/ads/reporting.test.ts lib/actions/ad-campaigns.ts components/ad-campaigns/ads-setup-workspace.tsx 'app/(dashboard)/ad-campaigns/page.tsx' 'app/(dashboard)/ad-campaigns/[id]/page.tsx' lib/ads/reports-contract.test.ts lib/ads/workspace-ui.test.ts
git commit -m "feat(ads): add GMV and canonical Profit metrics"
```

### Task 8: Weekly and monthly sales emails

**Files:**
- Modify: `supabase/functions/send-sales-report/index.ts`
- Modify: `lib/notifications/email-html.ts`
- Modify: `supabase/functions/_shared/email-html.ts`
- Modify: `lib/notifications/email-html.test.ts`
- Modify: `lib/notifications/source-contracts.test.ts`

- [ ] **Step 1: Add failing sales-email expectations**

Update the sales email fixture:

```ts
totals: {
  orders: 12,
  unitsSold: 45,
  gmv: 10_000_000,
  revenue: 9_500_000,
  cost: 3_000_000,
  profit: 6_500_000,
  returnedUnits: 2,
}
```

Add `gmv` to SKU and channel rows, then assert the rendered HTML contains both `GMV` and `Revenue`. In the source contract, assert:

```ts
expect(reportSource).toContain('from "../_shared/sales-metrics.ts"')
expect(reportSource).not.toContain("function getPackMultiplier")
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts`

Expected: FAIL on missing GMV fields and duplicated calculation code.

- [ ] **Step 3: Refactor the report Edge Function**

Import the shared engine, delete its local `getPackMultiplier`, and calculate each order once. Change aggregate shapes to:

```ts
type EmailSalesRow = {
  gmv: number
  revenue: number
  profit: number
}
```

Add COGS only to the grand total as today. Sort product and channel rows by GMV so the order matches marketplace top-line performance.

- [ ] **Step 4: Update both HTML renderers**

Render totals in this order: Orders, Units, GMV, Revenue, COGS, Profit, Returned Units. Add GMV columns before Revenue in SKU and channel tables. Do not render `Net Profit`.

- [ ] **Step 5: Run email tests**

Run: `npm test -- lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit sales emails**

```bash
git add supabase/functions/send-sales-report/index.ts lib/notifications/email-html.ts supabase/functions/_shared/email-html.ts lib/notifications/email-html.test.ts lib/notifications/source-contracts.test.ts
git commit -m "feat(email): report GMV beside Revenue"
```

### Task 9: Settlement, archived finance compatibility, and documentation

**Files:**
- Modify: `lib/marketplace-settlements.ts`
- Modify: `lib/actions/finance.ts`
- Modify: `FINANCE_SOP.md`
- Modify: `ENHANCED_REPORTS.md`
- Modify: `lib/orders/sales-metrics-contract.test.ts`

- [ ] **Step 1: Add failing drift-prevention assertions**

Extend `lib/orders/sales-metrics-contract.test.ts`:

```ts
const settlements = fs.readFileSync("lib/marketplace-settlements.ts", "utf8")
const finance = fs.readFileSync("lib/actions/finance.ts", "utf8")

expect(settlements).toContain("calculateSalesOrder")
expect(finance).toContain("channel.gmv")
expect(finance).not.toContain("channel.revenue + channel.fees")
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- lib/orders/sales-metrics-contract.test.ts`

Expected: FAIL because settlement and finance reconstruct the formulas.

- [ ] **Step 3: Refactor settlement and finance compatibility**

Implement settlement calculation as:

```ts
return calculateSalesOrder({
  channelFees,
  lines: lineItems.map((item, index) => ({
    key: String(index),
    sellingPrice: item.selling_price,
    quantity: item.quantity,
    packSize: "single",
    unitCost: 0,
  })),
}).totals.revenue
```

In archived finance helpers, use `channel.gmv` for gross revenue, `channel.fees` for fees, and `channel.revenue` for Revenue. Do not restore the Finance UI or add new finance behavior.

- [ ] **Step 4: Align documentation**

Update both documents to state exactly:

```text
GMV = customer-paid sales before channel fees
Revenue = GMV - channel fees
COGS = historical product cost of physical units sold
Profit = Revenue - COGS
Profit After Ads = Profit - ad spend
```

Remove sales-facing references that define Revenue as gross sales or Profit as Net Profit. Keep inventory purchases outside Profit.

- [ ] **Step 5: Run contract tests and documentation scan**

Run: `npm test -- lib/orders/sales-metrics-contract.test.ts && rg -n "Gross revenue =|Net Profit|Revenue = Gross" FINANCE_SOP.md ENHANCED_REPORTS.md`

Expected: tests PASS; search returns no contradictory active metric definitions.

- [ ] **Step 6: Commit compatibility and docs**

```bash
git add lib/marketplace-settlements.ts lib/actions/finance.ts FINANCE_SOP.md ENHANCED_REPORTS.md lib/orders/sales-metrics-contract.test.ts
git commit -m "docs(metrics): align settlement and sales terminology"
```

### Task 10: Repository-wide drift audit and final verification

**Files:**
- Modify as required by audit: only sales-metric consumers already listed above
- Test: all `lib/**/*.test.ts`

- [ ] **Step 1: Search for remaining duplicated formulas and old names**

Run:

```bash
rg -n "selling_price.*quantity.*channel_fees|itemRevenue\s*=|orderRevenue\s*=|net_profit|Net Profit|target_revenue|actual_revenue.*target" app components lib supabase/functions --glob '!**/*.test.ts'
```

Expected: no sales calculation or old target/profit naming remains. `actual_revenue` may remain as a read-only KPI value; it must not be paired with a Revenue target or Revenue progress.

- [ ] **Step 2: Fix any audit findings through the shared engine**

For every legitimate consumer found, import and call:

```ts
import { calculateSalesOrder } from "@/supabase/functions/_shared/sales-metrics"
```

Edge Functions use:

```ts
import { calculateSalesOrder } from "../_shared/sales-metrics.ts"
```

Do not whitelist a second monetary formula. Non-sales calculations such as displaying an entered line subtotal may continue multiplying price by quantity, but must label that subtotal `GMV` or `Subtotal`, never Revenue.

- [ ] **Step 3: Run the full automated verification**

Run:

```bash
npm test
npm run typecheck
npm run lint
npm run build
git diff --check
```

Expected: every command exits successfully.

- [ ] **Step 4: Verify database migration locally**

Run: `npx supabase db reset`

Expected: migrations apply successfully and `monthly_kpi_targets` contains `target_gmv`, not `target_revenue`. If the local Supabase stack is unavailable, run the repository's configured migration validation instead and record that limitation in the handoff.

- [ ] **Step 5: Perform focused browser acceptance checks**

Start the app with `npm run dev`, then verify:

1. Dashboard shows GMV, Revenue, and Profit with the approved formulas.
2. Reports filtered to the KPI month matches KPI Actual GMV and Revenue grand totals.
3. KPI edits and saves Target GMV and keeps Target Units.
4. An unmatched SKU appears under Other products and bundles instead of disappearing.
5. Order details show GMV, Fees, Revenue, COGS, Profit in that order.
6. Ads show GMV ROAS and no Net Profit label.
7. No active sales screen displays Net Profit.

Expected: all seven checks pass at desktop and mobile widths.

- [ ] **Step 6: Close any audit finding in its owning task**

The expected audit result is no remaining finding and therefore no new commit. If a finding appears, return to the task that owns that exact file, add a failing assertion to that task's test, fix it through the shared engine, rerun that task's verification command, and amend that task's metric commit. Never stage `lib/actions/inventory.ts` or `lib/inventory/` as part of this work.
