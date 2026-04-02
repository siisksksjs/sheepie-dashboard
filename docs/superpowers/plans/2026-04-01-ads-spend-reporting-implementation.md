# Ads Spend Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SKU-level ads setup, month-end actual spend tracking, SKU sales targets, and monthly ads profitability reporting while preserving legacy campaign history.

**Architecture:** Extend the existing ads module with new SKU-centric tables and server actions, then layer a pure reporting engine on top so the math is testable outside the UI. The `Ad Campaigns` tab becomes the new operational workspace, while the Reports area consumes the new monthly summaries without replacing legacy campaign history.

**Tech Stack:** Next.js App Router, TypeScript, Supabase/Postgres migrations, server actions, React client components, existing dashboard UI primitives, Vitest/Jest-style `npm test -- <file>` workflow.

---

## File Map

- Create: `supabase/migrations/20260401_add_sku_ads_reporting.sql`
  - Add `sku_ad_setups`, `monthly_ad_spend`, and `sku_sales_targets`
  - Add constraints, indexes, RLS, and finance linkage field for month-end spend
- Create: `lib/ads/reporting.ts`
  - Pure helpers for month overlap, budget cap math, ads-active classification, and monthly rollups
- Create: `lib/ads/reporting.test.ts`
  - Regression tests for classification, missing spend handling, budget cap math, and SKU summary rollups
- Create: `components/ad-campaigns/ads-setup-workspace.tsx`
  - Client workspace for SKU-level setup, monthly spend entry, and monthly ads report
- Modify: `lib/types/database.types.ts`
  - Add types for the new tables and related enums
- Modify: `lib/actions/ad-campaigns.ts`
  - Add CRUD/data loaders for SKU ad setups, monthly spend, sales targets, and report bundle queries
- Modify: `app/(dashboard)/ad-campaigns/page.tsx`
  - Replace campaign-first page with new workspace plus legacy campaigns section
- Modify: `app/(dashboard)/reports/page.tsx`
  - Fetch monthly ads report bundle for the Reports page
- Modify: `app/(dashboard)/reports/reports-client.tsx`
  - Render monthly ads summary and channel breakdown in Reports

## Task 1: Add Database Schema For SKU-Level Ads Reporting

**Files:**
- Create: `supabase/migrations/20260401_add_sku_ads_reporting.sql`
- Modify: `lib/types/database.types.ts`
- Test: `lib/ads/reporting.test.ts`

- [ ] **Step 1: Write the failing type contract test**

```ts
import { describe, expect, it } from "vitest"
import type { SkuAdSetup, MonthlyAdSpend, SkuSalesTarget } from "@/lib/types/database.types"

describe("sku ads schema contracts", () => {
  it("defines the new ads reporting entities", () => {
    const setup = {} as SkuAdSetup
    const spend = {} as MonthlyAdSpend
    const target = {} as SkuSalesTarget

    expectTypeOf(setup.sku).toEqualTypeOf<string>()
    expectTypeOf(spend.month).toEqualTypeOf<string>()
    expectTypeOf(target.daily_target_units).toEqualTypeOf<number>()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: FAIL with missing exported types or missing test file

- [ ] **Step 3: Write the migration**

```sql
create table sku_ad_setups (
  id uuid primary key default gen_random_uuid(),
  sku text not null references products(sku) on delete restrict,
  channel text not null check (channel in ('shopee', 'tokopedia', 'tiktok', 'offline')),
  objective text not null,
  daily_budget_cap numeric(12,2) not null check (daily_budget_cap >= 0),
  start_date date not null,
  end_date date,
  status text not null check (status in ('active', 'paused', 'ended')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, channel, start_date)
);

create table monthly_ad_spend (
  id uuid primary key default gen_random_uuid(),
  month date not null,
  sku text not null references products(sku) on delete restrict,
  channel text not null check (channel in ('shopee', 'tokopedia', 'tiktok', 'offline')),
  actual_spend numeric(12,2) not null check (actual_spend >= 0),
  notes text,
  finance_entry_id uuid references finance_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (month, sku, channel)
);

create table sku_sales_targets (
  id uuid primary key default gen_random_uuid(),
  sku text not null references products(sku) on delete restrict,
  daily_target_units integer not null check (daily_target_units >= 0),
  effective_from date not null,
  effective_to date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

- [ ] **Step 4: Update database types with the new entities**

```ts
export type SkuAdSetupStatus = "active" | "paused" | "ended"

export type SkuAdSetup = {
  id: string
  sku: string
  channel: Channel
  objective: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
  status: SkuAdSetupStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type MonthlyAdSpend = {
  id: string
  month: string
  sku: string
  channel: Channel
  actual_spend: number
  notes: string | null
  finance_entry_id: string | null
  created_at: string
  updated_at: string
}

export type SkuSalesTarget = {
  id: string
  sku: string
  daily_target_units: number
  effective_from: string
  effective_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 5: Run the test to verify the contracts exist**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS for the type contract section, or fail later on missing pure helper tests

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260401_add_sku_ads_reporting.sql lib/types/database.types.ts lib/ads/reporting.test.ts
git commit -m "feat: add sku ads reporting schema"
```

## Task 2: Build The Pure Reporting Engine First

**Files:**
- Create: `lib/ads/reporting.ts`
- Modify: `lib/ads/reporting.test.ts`

- [ ] **Step 1: Write the failing behavior tests**

```ts
import { describe, expect, it } from "vitest"
import {
  classifyAdsChannel,
  computeMonthlyBudgetCap,
  computeSkuMonthlySummary,
} from "@/lib/ads/reporting"

describe("classifyAdsChannel", () => {
  it("marks a sku-channel as ads-active when setup overlaps the selected month", () => {
    expect(classifyAdsChannel({
      sku: "LUMI",
      channel: "shopee",
      month: "2026-04-01",
      setups: [{ sku: "LUMI", channel: "shopee", start_date: "2026-03-20", end_date: null, status: "active" }],
    })).toBe("ads-active")
  })

  it("marks a sku-channel as organic when no setup exists", () => {
    expect(classifyAdsChannel({
      sku: "LUMI",
      channel: "tokopedia",
      month: "2026-04-01",
      setups: [],
    })).toBe("organic")
  })
})

describe("computeMonthlyBudgetCap", () => {
  it("multiplies daily budget by active days in month", () => {
    expect(computeMonthlyBudgetCap({
      month: "2026-04-01",
      daily_budget_cap: 150000,
      start_date: "2026-04-10",
      end_date: null,
    })).toBe(3150000)
  })
})

describe("computeSkuMonthlySummary", () => {
  it("keeps Lumi Tokopedia spend at zero when only Shopee is ads-active", () => {
    const summary = computeSkuMonthlySummary(/* explicit fixtures */)
    expect(summary.organic_channel_units).toBeGreaterThan(0)
    expect(summary.total_ads_spent).toBe(2100000)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: FAIL with missing module exports

- [ ] **Step 3: Implement the pure helpers**

```ts
export function classifyAdsChannel(input: {
  sku: string
  channel: Channel
  month: string
  setups: Pick<SkuAdSetup, "sku" | "channel" | "start_date" | "end_date" | "status">[]
}): "ads-active" | "organic" {
  const monthStart = new Date(`${input.month}T00:00:00`)
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0)

  return input.setups.some((setup) => {
    if (setup.sku !== input.sku || setup.channel !== input.channel || setup.status !== "active") return false
    const setupStart = new Date(`${setup.start_date}T00:00:00`)
    const setupEnd = setup.end_date ? new Date(`${setup.end_date}T00:00:00`) : monthEnd
    return setupStart <= monthEnd && setupEnd >= monthStart
  }) ? "ads-active" : "organic"
}

export function computeMonthlyBudgetCap(input: {
  month: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
}): number {
  const activeDays = getActiveDaysInMonth(input)
  return activeDays * input.daily_budget_cap
}
```

- [ ] **Step 4: Run the pure helper tests**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/ads/reporting.ts lib/ads/reporting.test.ts
git commit -m "feat: add sku ads reporting helpers"
```

## Task 3: Add Server Actions And Report Bundle Queries

**Files:**
- Modify: `lib/actions/ad-campaigns.ts`
- Modify: `lib/ads/reporting.test.ts`

- [ ] **Step 1: Write failing source-contract and behavior tests for the actions**

```ts
import { describe, expect, it } from "vitest"
import { getMonthlyAdsReportBundle } from "@/lib/actions/ad-campaigns"

describe("getMonthlyAdsReportBundle", () => {
  it("returns sku summaries and channel rows for the selected month", async () => {
    const result = await getMonthlyAdsReportBundle("2026-04-01")
    expect(result).toHaveProperty("skuSummaries")
    expect(result).toHaveProperty("channelBreakdown")
    expect(result).toHaveProperty("monthlySpendRows")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: FAIL with missing action export

- [ ] **Step 3: Add CRUD/data loaders for the new models**

```ts
export async function createSkuAdSetup(input: {
  sku: string
  channel: Channel
  objective: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
  notes: string | null
}) {
  const supabase = await createClient()
  return supabase.from("sku_ad_setups").insert([{ ...input, status: "active" }]).select().single()
}

export async function upsertMonthlyAdSpend(input: {
  month: string
  sku: string
  channel: Channel
  actual_spend: number
  notes: string | null
}) {
  const supabase = await createClient()
  return supabase.from("monthly_ad_spend").upsert([input], { onConflict: "month,sku,channel" }).select().single()
}
```

- [ ] **Step 4: Add the monthly ads report bundle query**

```ts
export async function getMonthlyAdsReportBundle(month: string) {
  const supabase = await createClient()
  const monthStart = month
  const monthEnd = endOfMonthIso(month)

  const [ordersResult, productsResult, setupsResult, spendResult, targetsResult] = await Promise.all([
    supabase.from("orders").select(/* orders + line items */).gte("order_date", monthStart).lte("order_date", monthEnd).in("status", ["paid", "shipped"]),
    supabase.from("products").select("sku, name, variant, cost_per_unit"),
    supabase.from("sku_ad_setups").select("*"),
    supabase.from("monthly_ad_spend").select("*").eq("month", monthStart),
    supabase.from("sku_sales_targets").select("*"),
  ])

  return buildMonthlyAdsReportBundle({
    month: monthStart,
    orders: ordersResult.data || [],
    products: productsResult.data || [],
    setups: setupsResult.data || [],
    spendRows: spendResult.data || [],
    targets: targetsResult.data || [],
  })
}
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add lib/actions/ad-campaigns.ts lib/ads/reporting.test.ts
git commit -m "feat: add sku ads reporting server actions"
```

## Task 4: Replace The Ad Campaigns Page With The New Workspace

**Files:**
- Create: `components/ad-campaigns/ads-setup-workspace.tsx`
- Modify: `app/(dashboard)/ad-campaigns/page.tsx`
- Modify: `lib/ads/reporting.test.ts`

- [ ] **Step 1: Write failing UI source-contract tests**

```ts
describe("ad campaigns page", () => {
  it("renders the new workspace sections", async () => {
    const source = await fs.promises.readFile("app/(dashboard)/ad-campaigns/page.tsx", "utf8")
    expect(source).toContain("Ad Setup")
    expect(source).toContain("Monthly Spend Input")
    expect(source).toContain("Monthly Ads Report")
    expect(source).toContain("Legacy Campaigns")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: FAIL because the new sections do not exist

- [ ] **Step 3: Add the workspace component**

```tsx
export function AdsSetupWorkspace(props: {
  setups: SkuAdSetup[]
  spendRows: MonthlyAdSpend[]
  targets: SkuSalesTarget[]
  report: Awaited<ReturnType<typeof getMonthlyAdsReportBundle>>
  products: Product[]
  selectedMonth: string
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Ad Setup</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Spend Input</CardTitle>
        </CardHeader>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Monthly Ads Report</CardTitle>
        </CardHeader>
      </Card>
    </div>
  )
}
```

- [ ] **Step 4: Wire the page to the new workspace and keep legacy campaigns below**

```tsx
export default async function AdCampaignsPage() {
  const selectedMonth = startOfCurrentMonthIso()
  const [legacyCampaigns, reportBundle, products, setups, spendRows, targets] = await Promise.all([
    getAllCampaignsMetrics(),
    getMonthlyAdsReportBundle(selectedMonth),
    getProducts(),
    getSkuAdSetups(),
    getMonthlyAdSpendRows(selectedMonth),
    getSkuSalesTargets(),
  ])

  return (
    <div className="space-y-8">
      <AdsSetupWorkspace
        setups={setups}
        spendRows={spendRows}
        targets={targets}
        report={reportBundle}
        products={products}
        selectedMonth={selectedMonth}
      />
      <section>
        <h2 className="text-xl font-semibold">Legacy Campaigns</h2>
        {/* existing campaign table/cards here */}
      </section>
    </div>
  )
}
```

- [ ] **Step 5: Run tests for the page contracts**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/ad-campaigns/page.tsx components/ad-campaigns/ads-setup-workspace.tsx lib/ads/reporting.test.ts
git commit -m "feat: add sku ads workspace"
```

## Task 5: Integrate Monthly Ads Reporting Into Reports

**Files:**
- Modify: `app/(dashboard)/reports/page.tsx`
- Modify: `app/(dashboard)/reports/reports-client.tsx`
- Modify: `lib/ads/reporting.test.ts`

- [ ] **Step 1: Write the failing UI/report integration tests**

```ts
describe("reports integration", () => {
  it("fetches monthly ads report data in reports/page.tsx", async () => {
    const source = await fs.promises.readFile("app/(dashboard)/reports/page.tsx", "utf8")
    expect(source).toContain("getMonthlyAdsReportBundle")
  })

  it("renders ads spend and profit after ads in reports-client.tsx", async () => {
    const source = await fs.promises.readFile("app/(dashboard)/reports/reports-client.tsx", "utf8")
    expect(source).toContain("Profit After Ads")
    expect(source).toContain("Organic")
    expect(source).toContain("Ads-Active")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: FAIL because Reports has not been wired yet

- [ ] **Step 3: Fetch the monthly ads bundle in the Reports page**

```tsx
const reportMonth = selectedMonth
  ? `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`
  : `${selectedYear}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`

const [salesBundle, adPerf, monthlyAds] = await Promise.all([
  getReportsBundle(selectedYear, selectedMonth),
  getAdPerformanceSummary(),
  getMonthlyAdsReportBundle(reportMonth),
])
```

- [ ] **Step 4: Render monthly ads KPI cards and breakdown tables in the Reports client**

```tsx
<Card>
  <CardHeader>
    <CardTitle>Monthly Ads Profitability</CardTitle>
  </CardHeader>
  <CardContent>
    <div className="grid gap-4 md:grid-cols-4">
      <Metric label="Ads Spend" value={formatCurrency(monthlyAds.totals.total_ads_spent)} />
      <Metric label="Profit Before Ads" value={formatCurrency(monthlyAds.totals.profit_before_ads)} />
      <Metric label="Profit After Ads" value={formatCurrency(monthlyAds.totals.profit_after_ads)} />
      <Metric label="Target Achievement" value={`${monthlyAds.totals.target_achievement_percent.toFixed(1)}%`} />
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 5: Run targeted verification**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npx eslint lib/actions/ad-campaigns.ts lib/ads/reporting.ts lib/ads/reporting.test.ts 'app/(dashboard)/ad-campaigns/page.tsx' components/ad-campaigns/ads-setup-workspace.tsx 'app/(dashboard)/reports/page.tsx' 'app/(dashboard)/reports/reports-client.tsx'`
Expected: `0 errors`

- [ ] **Step 6: Commit**

```bash
git add app/(dashboard)/reports/page.tsx app/(dashboard)/reports/reports-client.tsx lib/ads/reporting.test.ts
git commit -m "feat: add monthly ads profitability reporting"
```

## Task 6: Final Verification And Rollout Notes

**Files:**
- Modify: `docs/superpowers/plans/2026-04-01-ads-spend-reporting-implementation.md`

- [ ] **Step 1: Run full verification**

Run: `npm test -- lib/ads/reporting.test.ts`
Expected: PASS

Run: `npm run typecheck`
Expected: PASS

Run: `npm run build`
Expected: PASS

- [ ] **Step 2: Apply the migration in the target environment**

Run: `npm run db:migrate:dev`
Expected: migration `20260401_add_sku_ads_reporting.sql` applied successfully

- [ ] **Step 3: Manual smoke test checklist**

```txt
1. Create `Cervi + Tokopedia` ad setup with Rp150.000/day.
2. Create `Lumi + Shopee` and `Calmi + Shopee` setups.
3. Enter monthly actual spend for one selected month.
4. Confirm `Lumi + Tokopedia` shows sales as organic with spend 0.
5. Confirm ads-active channels subtract actual spend from profit.
6. Confirm monthly budget cap and variance display correctly.
7. Confirm legacy campaign list still renders below the new workspace.
8. Confirm Reports page shows Profit Before Ads and Profit After Ads.
```

- [ ] **Step 4: Commit final cleanup if needed**

```bash
git add -A
git commit -m "chore: finalize ads spend reporting rollout"
```

## Self-Review

- Spec coverage:
  - new SKU setup model: Task 1, Task 3, Task 4
  - monthly spend model: Task 1, Task 3, Task 4
  - SKU target model: Task 1, Task 3, Task 4
  - ads-active vs organic classification: Task 2, Task 3, Task 5
  - monthly report in ads tab: Task 4
  - monthly report in Reports area: Task 5
  - legacy campaigns preserved: Task 4
- Placeholder scan:
  - removed generic “handle validation” language and replaced it with explicit schemas, helpers, queries, and checks
- Type consistency:
  - canonical names used throughout: `SkuAdSetup`, `MonthlyAdSpend`, `SkuSalesTarget`, `getMonthlyAdsReportBundle`, `classifyAdsChannel`, `computeMonthlyBudgetCap`
