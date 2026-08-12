# Dashboard and Reports Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Dashboard, Reports, calendars, and KPI financial information readable and consistently ordered while limiting KPI to the three main products.

**Architecture:** Add small pure presentation helpers for compact Rupiah labels, canonical financial-series metadata, and GMV sorting. Move the repeated Recharts financial configuration into focused report chart components, while keeping report data aggregation and canonical financial formulas unchanged. Filter KPI totals at the workspace boundary and keep the dashboard inventory changes local to its server page.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Recharts, Vitest, Supabase server actions.

---

### Task 1: Add reusable report presentation rules

**Files:**
- Create: `lib/reports/presentation.ts`
- Create: `lib/reports/presentation.test.ts`

- [ ] **Step 1: Write the failing presentation-helper tests**

```ts
import { describe, expect, it } from "vitest"
import {
  FINANCIAL_SERIES,
  formatCompactRupiahAxis,
  sortByGmvDescending,
} from "@/lib/reports/presentation"

describe("report presentation", () => {
  it("formats readable compact Rupiah axis values", () => {
    expect(formatCompactRupiahAxis(0)).toBe("Rp 0")
    expect(formatCompactRupiahAxis(500_000)).toBe("Rp 500 rb")
    expect(formatCompactRupiahAxis(25_000_000)).toBe("Rp 25 jt")
    expect(formatCompactRupiahAxis(1_250_000_000)).toBe("Rp 1,3 M")
  })

  it("keeps the canonical financial order", () => {
    expect(FINANCIAL_SERIES.map((item) => item.key)).toEqual([
      "gmv", "revenue", "cost", "profit",
    ])
  })

  it("sorts report rows by GMV without mutating input", () => {
    const input = [{ name: "A", gmv: 10 }, { name: "B", gmv: 30 }]
    expect(sortByGmvDescending(input).map((row) => row.name)).toEqual(["B", "A"])
    expect(input.map((row) => row.name)).toEqual(["A", "B"])
  })
})
```

- [ ] **Step 2: Run the test and verify it fails because the helper does not exist**

Run: `npm test -- lib/reports/presentation.test.ts`

Expected: FAIL resolving `@/lib/reports/presentation`.

- [ ] **Step 3: Implement the pure helpers**

```ts
export const FINANCIAL_SERIES = [
  { key: "gmv", label: "GMV", color: "#7457df" },
  { key: "revenue", label: "Revenue", color: "#3478d4" },
  { key: "cost", label: "Cost", color: "#e6922e" },
  { key: "profit", label: "Profit", color: "#16a16c" },
] as const

const formatOneDecimal = (value: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 1 }).format(value)

export function formatCompactRupiahAxis(value: number) {
  const absolute = Math.abs(value)
  if (absolute >= 1_000_000_000) return `Rp ${formatOneDecimal(value / 1_000_000_000)} M`
  if (absolute >= 1_000_000) return `Rp ${formatOneDecimal(value / 1_000_000)} jt`
  if (absolute >= 1_000) return `Rp ${formatOneDecimal(value / 1_000)} rb`
  return `Rp ${formatOneDecimal(value)}`
}

export function sortByGmvDescending<T extends { gmv: number }>(rows: readonly T[]) {
  return [...rows].sort((a, b) => b.gmv - a.gmv)
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run: `npm test -- lib/reports/presentation.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Commit the helper boundary**

```bash
git add lib/reports/presentation.ts lib/reports/presentation.test.ts
git commit -m "feat(reports): add financial presentation helpers"
```

### Task 2: Fix Dashboard metric overflow and remove bundle stock rows

**Files:**
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Create: `lib/orders/dashboard-visual-contract.test.ts`

- [ ] **Step 1: Write a failing source contract for the requested Dashboard behavior**

```ts
import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("dashboard visual contract", () => {
  const source = fs.readFileSync("app/(dashboard)/dashboard/page.tsx", "utf8")

  it("uses physical products for stock totals and never appends bundle rows", () => {
    expect(source).toContain("const physicalStockData = stockData.filter")
    expect(source).toContain("physicalStockData.map")
    expect(source).not.toContain("{/* Bundles with calculated availability */}")
    expect(source).not.toContain("bundles.map((bundle) =>")
  })

  it("uses a wide responsive KPI layout with contained numeric values", () => {
    expect(source).toContain("xl:grid-cols-3")
    expect(source).toContain("tabular-nums")
    expect(source).toContain("break-words")
  })
})
```

- [ ] **Step 2: Run the contract and confirm it fails against the current six-column layout and bundle rows**

Run: `npm test -- lib/orders/dashboard-visual-contract.test.ts`

Expected: FAIL on missing `physicalStockData`, `xl:grid-cols-3`, and retained bundle mapping.

- [ ] **Step 3: Use only physical stock for overview statistics and rows**

```ts
const physicalStockData = stockData.filter((item) => !item.is_bundle)
const stats = {
  totalProducts: physicalStockData.length,
  lowStockItems: physicalStockData.filter((item) => item.is_low_stock).length,
  totalStock: physicalStockData.reduce((sum, item) => sum + item.current_stock, 0),
}
```

Render `physicalStockData.map(...)` once in Stock Overview, delete the appended `bundles.map(...)` block, and change its description to `Current inventory levels for main SKUs`.

- [ ] **Step 4: Widen cards and contain long currencies**

Change the stat grid to `grid gap-4 md:grid-cols-2 xl:grid-cols-3 mb-8`. Give financial values `text-2xl 2xl:text-3xl font-bold leading-tight tracking-tight tabular-nums break-words` so they fit without crossing card boundaries.

- [ ] **Step 5: Run the focused test and type checker**

Run: `npm test -- lib/orders/dashboard-visual-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit Dashboard polish**

```bash
git add 'app/(dashboard)/dashboard/page.tsx' lib/orders/dashboard-visual-contract.test.ts
git commit -m "fix(dashboard): contain metrics and hide bundle stock"
```

### Task 3: Restrict KPI actuals and totals to the three main products

**Files:**
- Modify: `lib/kpi/workspace.ts`
- Modify: `lib/kpi/workspace.test.ts`
- Modify: `lib/actions/kpi.ts`
- Modify: `app/(dashboard)/kpi/kpi-client.tsx`

- [ ] **Step 1: Change the KPI workspace test to require tracked-product totals only**

Replace the first test assertions with:

```ts
expect(result.totals).toMatchObject({ actual_gmv: 240_000, actual_revenue: 216_000 })
expect(result.other).toMatchObject({ actual_gmv: 60_000, actual_revenue: 54_000 })
expect(Array.from(result.bySku.keys()).sort()).toEqual(["Calmi-001", "Lumi-001"])
```

Add a source contract:

```ts
const actionSource = fs.readFileSync("lib/actions/kpi.ts", "utf8")
expect(actionSource).not.toContain('sku: "__other__"')
expect(actionSource).not.toContain('name: "Other products and bundles"')
```

- [ ] **Step 2: Run the KPI tests and verify the old all-sales total fails**

Run: `npm test -- lib/kpi/workspace.test.ts`

Expected: FAIL because totals still equal Rp300,000 and the action still appends `__other__`.

- [ ] **Step 3: Calculate KPI totals only from `bySku` values**

Remove the per-order `add(totals, ...)` call. After all order lines have been allocated, create totals from tracked actuals:

```ts
const totals = Array.from(bySku.values()).reduce((sum, actual) => {
  add(sum, actual.actual_units, actual.actual_gmv, actual.actual_revenue)
  return sum
}, EMPTY_ACTUAL())

return { bySku, other, totals }
```

Keep `other` only as an internal diagnostic result; do not display or include it in KPI totals.

- [ ] **Step 4: Remove the synthetic KPI row from the server action**

Delete the `if (actuals.other...) { rows.push(...) }` block in `getKpiWorkspace`. Totals continue to reduce the three returned rows, so top cards, gauges, progress, and tables all share the same scope.

- [ ] **Step 5: Simplify the KPI client for targetable rows only**

Remove `is_targetable` branching and disabled states from row progress and target inputs. Preserve the field in the server type only if removing it would create unrelated churn; every returned row must have `is_targetable: true`.

- [ ] **Step 6: Run KPI tests and type checking**

Run: `npm test -- lib/kpi/workspace.test.ts && npm run typecheck`

Expected: PASS, with no `Other products and bundles` rendered by the workspace.

- [ ] **Step 7: Commit the KPI scope correction**

```bash
git add lib/kpi/workspace.ts lib/kpi/workspace.test.ts lib/actions/kpi.ts 'app/(dashboard)/kpi/kpi-client.tsx'
git commit -m "fix(kpi): limit workspace to three main products"
```

### Task 4: Build professional reusable financial charts

**Files:**
- Create: `components/reports/financial-charts.tsx`
- Create: `lib/reports/financial-charts-contract.test.ts`
- Modify: `lib/ads/reports-contract.test.ts`

- [ ] **Step 1: Write a failing chart contract**

```ts
import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("financial report charts", () => {
  const source = fs.readFileSync("components/reports/financial-charts.tsx", "utf8")

  it("uses compact axes and an opaque ordered tooltip", () => {
    expect(source).toContain("formatCompactRupiahAxis")
    expect(source).toContain("FINANCIAL_SERIES.map")
    expect(source).toContain("bg-card")
    expect(source).toContain("shadow-xl")
  })

  it("renders trend and horizontal comparison charts", () => {
    expect(source).toContain("export function FinancialTrendChart")
    expect(source).toContain("export function FinancialComparisonChart")
    expect(source).toContain('layout="vertical"')
  })
})
```

- [ ] **Step 2: Run the contract and verify the component is missing**

Run: `npm test -- lib/reports/financial-charts-contract.test.ts`

Expected: FAIL reading the missing file.

- [ ] **Step 3: Implement `FinancialTooltip`**

Create a solid card that reads the Recharts payload into a map and then renders `FINANCIAL_SERIES.map(...)`, rather than trusting payload order:

```tsx
function FinancialTooltip({ active, label, payload, labelFormatter }: FinancialTooltipProps) {
  if (!active || !payload?.length) return null
  const values = new Map(payload.map((entry) => [String(entry.dataKey), Number(entry.value)]))
  return (
    <div className="min-w-52 rounded-xl border bg-card p-3 text-sm shadow-xl">
      <div className="mb-2 font-semibold text-foreground">{labelFormatter(label)}</div>
      <div className="space-y-1.5">
        {FINANCIAL_SERIES.map((series) => (
          <div key={series.key} className="flex items-center justify-between gap-6">
            <span style={{ color: series.color }}>{series.label}</span>
            <span className="font-semibold tabular-nums text-foreground">
              {formatCurrency(values.get(series.key) || 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Implement the trend chart**

Use `margin={{ top: 12, right: 24, left: 32, bottom: 8 }}`, a `YAxis width={88} tickFormatter={formatCompactRupiahAxis}`, subtle gridlines, `dot={{ r: 3 }}`, `activeDot={{ r: 6 }}`, `strokeWidth={3}` for GMV/Revenue and `2.5` for Cost/Profit, plus the custom tooltip. Render lines and a custom legend from `FINANCIAL_SERIES` in canonical order.

- [ ] **Step 5: Implement the horizontal comparison chart**

Accept `data`, `categoryKey`, and `height`. Render a vertical `BarChart`, `XAxis type="number" tickFormatter={formatCompactRupiahAxis}`, `YAxis type="category" width={130}`, and four bars generated from `FINANCIAL_SERIES`. Use the same custom tooltip and ordered legend.

- [ ] **Step 6: Keep the report Recharts test double compatible with the new component**

The new component uses only the already mocked primitives: `LineChart`, `Line`, `BarChart`, `Bar`, `XAxis`, `YAxis`, `CartesianGrid`, `Tooltip`, `Legend`, and `ResponsiveContainer`. Import the component through `reports-client.tsx` and confirm the existing passthrough mock renders it without adding a browser layout dependency.

- [ ] **Step 7: Run chart and report contract tests**

Run: `npm test -- lib/reports/financial-charts-contract.test.ts lib/ads/reports-contract.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit the reusable charts**

```bash
git add components/reports/financial-charts.tsx lib/reports/financial-charts-contract.test.ts lib/ads/reports-contract.test.ts
git commit -m "feat(reports): add professional financial charts"
```

### Task 5: Apply canonical charts and ordering to Reports

**Files:**
- Modify: `app/(dashboard)/reports/reports-client.tsx`
- Modify: `lib/ads/reports-contract.test.ts`

- [ ] **Step 1: Add failing report UI assertions**

Extend the reports client fixture with one channel and one product containing `gmv`, `revenue`, `cost`, and `profit`. Assert rendered markup contains these headings in order:

```ts
const financialHeadings = ["GMV", "Revenue", "Cost", "Profit"]
let cursor = -1
for (const heading of financialHeadings) {
  const next = html.indexOf(heading, cursor + 1)
  expect(next).toBeGreaterThan(cursor)
  cursor = next
}
expect(html).toContain("Total Cost")
```

Also assert the source imports `FinancialTrendChart`, `FinancialComparisonChart`, and `sortByGmvDescending` and no longer contains `Profit by Product`.

- [ ] **Step 2: Run the report contract and confirm the new expectations fail**

Run: `npm test -- lib/ads/reports-contract.test.ts`

Expected: FAIL on missing Cost summary and reusable charts.

- [ ] **Step 3: Add total Cost and reorder summary cards**

Calculate `totalCost` from `overviewReport.byProduct`. Use a responsive `md:grid-cols-2 xl:grid-cols-3` card grid and order cards as Total GMV, Total Revenue, Total Cost, Profit, Units Sold, Avg Order Value. Apply `tabular-nums break-words` to card values.

- [ ] **Step 4: Replace the Trends chart**

Use:

```tsx
<FinancialTrendChart
  data={trendData}
  xKey="month"
  xTickFormatter={trendXAxisTickFormatter}
  labelFormatter={trendTooltipLabelFormatter}
/>
```

Keep Units Sold as its separate volume chart, but improve its margins and axis contrast.

- [ ] **Step 5: Replace Channel financial bars and fix order distribution labels**

Create `channelsByGmv = sortByGmvDescending(overviewReport?.byChannel || [])` and pass it to `FinancialComparisonChart`. In the donut chart, disable direct slice labels and add a bottom legend using `channelLabels`; this prevents labels for TikTok/Offline from colliding.

- [ ] **Step 6: Reorder Channel details columns**

Render Channel, Orders, GMV, Revenue, Cost, Profit, Fees, Avg Order. Cost comes from `channel.cost`. Map `channelsByGmv` so table and chart rankings agree.

- [ ] **Step 7: Consolidate Product charts**

Create `productsByGmv = sortByGmvDescending(overviewReport?.byProduct || [])`. Replace the two half-width cards with one full-width `FinancialComparisonChart` whose height grows with row count, capped to a sensible desktop maximum. Delete the separate Profit-only card.

- [ ] **Step 8: Reorder Product details columns**

Render SKU, Product, Units Sold, GMV, Revenue, Cost, Profit, Margin and map `productsByGmv`.

- [ ] **Step 9: Run report tests and type checking**

Run: `npm test -- lib/ads/reports-contract.test.ts lib/reports/financial-charts-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 10: Commit Reports chart integration**

```bash
git add 'app/(dashboard)/reports/reports-client.tsx' lib/ads/reports-contract.test.ts
git commit -m "feat(reports): polish financial charts and ordering"
```

### Task 6: Add GMV throughout monthly and daily calendars

**Files:**
- Modify: `app/(dashboard)/reports/reports-client.tsx`
- Modify: `lib/ads/reports-contract.test.ts`

- [ ] **Step 1: Add failing calendar GMV assertions**

Add report data containing a day and month with nonzero GMV, then assert:

```ts
expect(html).toContain('data-value="gmv"')
expect(html).toContain("GMV")
expect(html).toContain("Rp300000")
```

Add a source assertion that the heatmap type includes `"gmv"`.

- [ ] **Step 2: Run the report contract and verify the GMV heatmap option fails**

Run: `npm test -- lib/ads/reports-contract.test.ts`

Expected: FAIL because `HeatmapMetric` does not yet include GMV.

- [ ] **Step 3: Add GMV to the heatmap data path**

Change the type to `type HeatmapMetric = "units" | "orders" | "gmv" | "revenue"`. Add `gmv` to `byDateMap`, calculate `maxDayGmv` and `maxMonthGmv`, and select those maxima when the heatmap basis is GMV.

- [ ] **Step 4: Add GMV selectors and compact calendar values**

Add `<SelectItem value="gmv">GMV</SelectItem>` before Revenue in both Heatmap Basis selects. In yearly month cards and daily cells/details, render financial values in the order GMV, Revenue, Profit with compact, tabular currency text.

- [ ] **Step 5: Update peak summaries**

Make the peak text name the selected basis and format its matching value, rather than always ending with Revenue. This ensures choosing GMV changes both intensity and explanation.

- [ ] **Step 6: Run report tests and type checking**

Run: `npm test -- lib/ads/reports-contract.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit calendar GMV coverage**

```bash
git add 'app/(dashboard)/reports/reports-client.tsx' lib/ads/reports-contract.test.ts
git commit -m "feat(reports): add GMV to calendar views"
```

### Task 7: Verify the complete visual update

**Files:**
- Modify only if verification reveals a defect in files already listed above.

- [ ] **Step 1: Run focused tests**

Run:

```bash
npm test -- \
  lib/reports/presentation.test.ts \
  lib/reports/financial-charts-contract.test.ts \
  lib/orders/dashboard-visual-contract.test.ts \
  lib/kpi/workspace.test.ts \
  lib/ads/reports-contract.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run full automated verification**

Run: `npm test && npm run typecheck && npm run build && git diff --check`

Expected: all tests PASS, type checking PASS, production build PASS, and no whitespace errors. Run `npm run lint` separately and distinguish existing unrelated lint failures from any errors in touched files.

- [ ] **Step 3: Start the app and inspect the requested views**

Run: `npm run dev`

Inspect at desktop and tablet widths:

- `/dashboard`: all stat values stay inside cards; Stock Overview contains no bundle rows.
- `/reports`: Trends axes show complete compact Rupiah labels; tooltip is opaque and ordered.
- `/reports` Channels: horizontal four-metric chart is readable; pie labels do not collide; table uses GMV, Revenue, Cost, Profit.
- `/reports` Products: one ordered horizontal chart and GMV-sorted details.
- `/reports?year=2026`: every monthly card includes GMV; GMV heatmap basis works.
- `/reports?year=2026&month=8`: daily calendar cells/details include GMV.
- `/kpi`: exactly three product cards and rows; top totals exclude bundle/other sales.

- [ ] **Step 4: Capture browser screenshots for evidence**

Save screenshots under a temporary verification directory outside Git and inspect them for overflow, clipping, tooltip contrast, and responsive behavior.

- [ ] **Step 5: Commit any verification-only corrections**

```bash
git add \
  'app/(dashboard)/dashboard/page.tsx' \
  'app/(dashboard)/reports/reports-client.tsx' \
  'app/(dashboard)/kpi/kpi-client.tsx' \
  components/reports/financial-charts.tsx \
  lib/actions/kpi.ts \
  lib/kpi/workspace.ts \
  lib/kpi/workspace.test.ts \
  lib/reports/presentation.ts \
  lib/reports/presentation.test.ts \
  lib/reports/financial-charts-contract.test.ts \
  lib/orders/dashboard-visual-contract.test.ts \
  lib/ads/reports-contract.test.ts
git commit -m "fix(ui): address visual verification findings"
```

Skip this commit if no correction was needed.
