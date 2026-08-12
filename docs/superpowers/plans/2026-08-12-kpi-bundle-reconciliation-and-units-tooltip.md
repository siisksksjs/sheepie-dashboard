# KPI Bundle Reconciliation and Units Tooltip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the three-product KPI include sales made through bundles while excluding Cervi-002, and replace the Reports units-chart hover with a readable professional tooltip.

**Architecture:** Restore bundle-aware allocation in the pure KPI aggregation helper: direct main-SKU lines are counted directly, bundle lines are distributed to tracked component SKUs according to composition quantities, and non-bundle products such as Cervi-002 remain excluded. Reuse a focused units-volume chart component beside the existing financial chart components so Reports has an opaque tooltip and subtle hover cursor without adding finance logic to the UI.

**Tech Stack:** Next.js, React, TypeScript, Supabase, Recharts, Vitest

---

### Task 1: Restore bundle-aware KPI aggregation

**Files:**
- Modify: `lib/kpi/workspace.test.ts`
- Modify: `lib/kpi/workspace.ts`
- Modify: `lib/actions/kpi.ts`

- [ ] **Step 1: Write a failing aggregation test**

Add a test whose order contains direct LumiCloud GMV, a Lumi/Calmi bundle, and Cervi-002. Pass the product catalog and bundle composition, then assert the bundle GMV is split between Lumi-001 and Calmi-001, Cervi-002 stays in `other`, and KPI totals contain only the three tracked component products.

```ts
const result = buildKpiActuals({
  orders: [{ channel_fees: 36_000, order_line_items: [
    { sku: "Lumi-001", quantity: 1, pack_size: "single", selling_price: 60_000 },
    { sku: "Lumi-Calmi-Kit", quantity: 1, pack_size: "single", selling_price: 240_000 },
    { sku: "Cervi-002", quantity: 1, pack_size: "single", selling_price: 60_000 },
  ] }],
  products: [
    { sku: "Lumi-001", is_bundle: false },
    { sku: "Calmi-001", is_bundle: false },
    { sku: "Cervi-002", is_bundle: false },
    { sku: "Lumi-Calmi-Kit", is_bundle: true },
  ],
  bundleCompositions: [
    { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Lumi-001", quantity: 1 },
    { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Calmi-001", quantity: 1 },
  ],
})

expect(result.totals).toMatchObject({ actual_units: 3, actual_gmv: 300_000, actual_revenue: 270_000 })
expect(result.other).toMatchObject({ actual_units: 1, actual_gmv: 60_000, actual_revenue: 54_000 })
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- lib/kpi/workspace.test.ts`

Expected: FAIL because `buildKpiActuals` does not accept the catalog/compositions and currently classifies the bundle as other.

- [ ] **Step 3: Implement bundle-aware allocation**

Extend `buildKpiActuals` with catalog and composition inputs. Build lookup maps, count direct main SKUs unchanged, split bundle line units/GMV/revenue among tracked components using component-unit weights, classify Cervi-002 and unmapped products as `other`, and calculate `totals` only from `bySku`.

- [ ] **Step 4: Restore the required Supabase inputs**

In `getKpiWorkspace`, fetch the full product catalog and `bundle_compositions`, pass them into `buildKpiActuals`, retain only the three main rows in the returned UI workspace, and keep totals as the sum of those rows.

- [ ] **Step 5: Run KPI tests**

Run: `npm test -- lib/kpi/workspace.test.ts`

Expected: PASS, including the contract that no synthetic “Other products and bundles” KPI row is rendered.

- [ ] **Step 6: Commit the KPI correction**

```bash
git add lib/kpi/workspace.test.ts lib/kpi/workspace.ts lib/actions/kpi.ts
git commit -m "fix(kpi): allocate bundle sales to main products"
```

### Task 2: Replace the Units Sold chart hover

**Files:**
- Modify: `components/reports/financial-charts.tsx`
- Modify: `app/(dashboard)/reports/reports-client.tsx`
- Modify: `lib/reports/financial-charts-contract.test.ts`

- [ ] **Step 1: Write a failing chart contract test**

Require the reports chart module to export `UnitsTrendChart`, render an opaque custom tooltip containing `Units Sold`, and use a subtle cursor instead of Recharts’ default gray hover block.

```ts
expect(source).toContain("export function UnitsTrendChart")
expect(source).toContain("Units Sold")
expect(source).toContain('cursor={{ fill: "hsl(var(--muted) / 0.3)" }}')
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `npm test -- lib/reports/financial-charts-contract.test.ts`

Expected: FAIL because the reusable units chart does not exist.

- [ ] **Step 3: Build the reusable units chart**

Add `UnitsTrendChart` to `components/reports/financial-charts.tsx`. Use the existing axis styling, a violet rounded bar, an opaque `bg-card` tooltip with formatted integer units, and a subtle hover cursor.

- [ ] **Step 4: Replace the inline Reports chart**

Remove the inline `BarChart`, default `Tooltip`, and `Legend` for Units Sold from `reports-client.tsx`. Render `UnitsTrendChart` with the existing trend data and date formatters.

- [ ] **Step 5: Run chart tests**

Run: `npm test -- lib/reports/financial-charts-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the chart correction**

```bash
git add components/reports/financial-charts.tsx app/'(dashboard)'/reports/reports-client.tsx lib/reports/financial-charts-contract.test.ts
git commit -m "fix(reports): improve units chart tooltip"
```

### Task 3: Verify the combined fix

**Files:**
- Verify only

- [ ] **Step 1: Run focused tests**

Run: `npm test -- lib/kpi/workspace.test.ts lib/reports/financial-charts-contract.test.ts`

Expected: all focused tests PASS.

- [ ] **Step 2: Run type checking and linting**

Run: `npm run typecheck`

Run: `npm run lint`

Expected: typecheck passes; lint introduces no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: all tests PASS.

- [ ] **Step 4: Review the final diff and worktree**

Run: `git diff --check`

Run: `git status --short`

Expected: no whitespace errors; unrelated existing inventory changes remain untouched.
