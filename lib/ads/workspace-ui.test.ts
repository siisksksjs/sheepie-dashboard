import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import type { MonthlyAdsReportBundle } from "./reporting"
import type {
  MonthlyAdSpend,
  Product,
  SkuAdSetup,
  SkuSalesTarget,
} from "../types/database.types"

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
  }: {
    href: string
    children: React.ReactNode
  }) => React.createElement("a", { href }, children),
}))

vi.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) =>
    React.createElement("span", null, children),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    asChild,
    ...props
  }: {
    children: React.ReactNode
    asChild?: boolean
  }) => {
    if (asChild && React.isValidElement(children)) {
      return React.cloneElement(children, props)
    }

    return React.createElement("button", props, children)
  },
}))

vi.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) =>
    React.createElement("section", null, children),
  CardHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("header", null, children),
  CardTitle: ({ children }: { children: React.ReactNode }) =>
    React.createElement("h2", null, children),
  CardDescription: ({ children }: { children: React.ReactNode }) =>
    React.createElement("p", null, children),
  CardContent: ({ children }: { children: React.ReactNode }) =>
    React.createElement("div", null, children),
}))

vi.mock("@/components/ui/table", () => ({
  Table: ({ children }: { children: React.ReactNode }) =>
    React.createElement("table", null, children),
  TableHeader: ({ children }: { children: React.ReactNode }) =>
    React.createElement("thead", null, children),
  TableBody: ({ children }: { children: React.ReactNode }) =>
    React.createElement("tbody", null, children),
  TableRow: ({ children }: { children: React.ReactNode }) =>
    React.createElement("tr", null, children),
  TableHead: ({ children }: { children: React.ReactNode }) =>
    React.createElement("th", null, children),
  TableCell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("td", null, children),
}))

vi.mock("@/components/ad-campaigns/workspace-row-actions", () => ({
  SetupRowActions: () => React.createElement("div", null, "Setup Actions"),
  SpendRowActions: () => React.createElement("div", null, "Spend Actions"),
  TargetRowActions: () => React.createElement("div", null, "Target Actions"),
}))

vi.mock("@/lib/utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/utils")>()),
  formatCurrency: (value: number) => `Rp${value}`,
}))

async function loadWorkspace() {
  return (await import("../../components/ad-campaigns/ads-setup-workspace"))
    .AdsSetupWorkspace
}

const products: Product[] = [
  {
    id: "product-lumi",
    sku: "LUMI",
    name: "Lumi Oil",
    variant: "30ml",
    cost_per_unit: 45000,
    reorder_point: 10,
    is_bundle: false,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "product-may",
    sku: "MAYSKU",
    name: "May Product",
    variant: null,
    cost_per_unit: 25000,
    reorder_point: 5,
    is_bundle: false,
    status: "active",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
]

const baseReport: MonthlyAdsReportBundle = {
  month: "2026-04-01",
  skuSummaries: [
    {
      month: "2026-04-01",
      sku: "LUMI",
      target_units: 60,
      actual_units: 42,
      ads_active_channel_units: 30,
      organic_channel_units: 12,
      total_ads_spent: 2100000,
      total_budget_cap: 3000000,
      gross_profit: 4500000,
      profit_after_ads: 2400000,
      channels: [
        {
          channel: "shopee",
          classification: "ads-active",
          units: 30,
          ads_spent: 2100000,
          budget_cap: 3000000,
          revenue: 6000000,
          cost: 1500000,
          profit: 4500000,
          uses_shared_budget: false,
        },
      ],
    },
  ],
  channelBreakdown: [
    {
      month: "2026-04-01",
      sku: "LUMI",
      product_name: "Lumi Oil",
      product_variant: "30ml",
      channel: "shopee",
      classification: "ads-active",
      units: 30,
      ads_spent: 2100000,
      budget_cap: 3000000,
      revenue: 6000000,
      cost: 1500000,
      profit: 4500000,
      uses_shared_budget: false,
      profit_after_ads: 2400000,
      actual_spend_missing: false,
    },
  ],
  missingSpendScopes: [],
  monthlySpendRows: [
    {
      id: "spend-lumi",
      month: "2026-04-01",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      actual_spend: 2100000,
      notes: null,
      finance_entry_id: null,
      created_at: "2026-04-01T00:00:00Z",
      updated_at: "2026-04-01T00:00:00Z",
    },
  ],
  totals: {
    total_target_units: 60,
    total_actual_units: 42,
    ads_active_channel_units: 30,
    organic_channel_units: 12,
    total_ads_spent: 2100000,
    total_budget_cap: 3000000,
    profit_before_ads: 4500000,
    profit_after_ads: 2400000,
    target_achievement_percent: 70,
    has_missing_spend: false,
    ads_active_rows_missing_spend: 0,
  },
  load_error: null,
}

describe("AdsSetupWorkspace", () => {
  it("renders only setups and targets that overlap the selected month", async () => {
    const AdsSetupWorkspace = await loadWorkspace()
    const setups: SkuAdSetup[] = [
      {
        id: "setup-april",
        sku: "LUMI",
        channel: "shopee",
        channels: ["shopee"],
        channel_scope_key: "shopee",
        objective: "April launch",
        daily_budget_cap: 100000,
        start_date: "2026-04-10",
        end_date: null,
        status: "active",
        notes: null,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "setup-may",
        sku: "MAYSKU",
        channel: "tokopedia",
        channels: ["tokopedia"],
        channel_scope_key: "tokopedia",
        objective: "May only objective",
        daily_budget_cap: 120000,
        start_date: "2026-05-01",
        end_date: "2026-05-31",
        status: "active",
        notes: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ]
    const targets: SkuSalesTarget[] = [
      {
        id: "target-april",
        sku: "LUMI",
        daily_target_units: 2,
        effective_from: "2026-04-01",
        effective_to: "2026-04-30",
        notes: null,
        created_at: "2026-04-01T00:00:00Z",
        updated_at: "2026-04-01T00:00:00Z",
      },
      {
        id: "target-may",
        sku: "MAYSKU",
        daily_target_units: 3,
        effective_from: "2026-05-01",
        effective_to: "2026-05-31",
        notes: null,
        created_at: "2026-05-01T00:00:00Z",
        updated_at: "2026-05-01T00:00:00Z",
      },
    ]

    const html = renderToStaticMarkup(
      React.createElement(AdsSetupWorkspace, {
        products,
        report: baseReport,
        selectedMonth: "2026-04-01",
        setups: { data: setups, load_error: null },
        spendRows: {
          data: baseReport.monthlySpendRows as MonthlyAdSpend[],
          load_error: null,
        },
        targets: { data: targets, load_error: null },
      }),
    )

    expect(html).toContain("April launch")
    expect(html).toContain("Daily Target Units")
    expect(html).toContain("Lumi Oil")
    expect(html).toContain("Add Setup")
    expect(html).toContain("Add Spend")
    expect(html).toContain("Add Target")
    expect(html).toContain("Setup Actions")
    expect(html).toContain("Spend Actions")
    expect(html).toContain("Target Actions")
    expect(html).not.toContain("May only objective")
    expect(html).not.toContain("May Product")
  })

  it("renders explicit load_error messages for each primary section", async () => {
    const AdsSetupWorkspace = await loadWorkspace()
    const html = renderToStaticMarkup(
      React.createElement(AdsSetupWorkspace, {
        products,
        report: {
          ...baseReport,
          load_error: "report offline",
          skuSummaries: [],
          channelBreakdown: [],
        },
        selectedMonth: "2026-04-01",
        setups: { data: [], load_error: "setups offline" },
        spendRows: { data: [], load_error: "spend offline" },
        targets: { data: [], load_error: "targets offline" },
      }),
    )

    expect(html).toContain("Unable to load ad setups: setups offline")
    expect(html).toContain("Unable to load sales targets: targets offline")
    expect(html).toContain("Unable to load monthly spend inputs: spend offline")
    expect(html).toContain("Unable to load the monthly ads report: report offline")
  })
})
