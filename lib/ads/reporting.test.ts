import { beforeEach, describe, expect, it, vi } from "vitest"
import { createClient } from "@/lib/supabase/server"

import {
  buildMonthlyAdsReportBundle,
  classifyAdsChannel,
  computeMonthlyBudgetCap,
  computeSkuMonthlySummary,
  createMonthlyAdsReportLoadErrorBundle,
} from "./reporting"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/line-item-costs", () => ({
  getLineItemTotalCost: vi.fn((lineItem: { quantity?: number; cost_per_unit_snapshot?: number | null }, product?: { cost_per_unit?: number }) => {
    const costPerUnit = lineItem.cost_per_unit_snapshot ?? product?.cost_per_unit ?? 0
    return (lineItem.quantity || 0) * costPerUnit
  }),
}))

vi.mock("../actions/changelog", () => ({
  safeRecordAutomaticChangelogEntry: vi.fn(),
}))

vi.mock("@/lib/changelog", () => ({
  buildChangeItem: vi.fn(() => null),
}))

const loadAdCampaignActions = async () => import("../actions/ad-campaigns")
type MockSupabaseClient = Awaited<ReturnType<typeof createClient>>

beforeEach(() => {
  vi.clearAllMocks()
})

describe("classifyAdsChannel", () => {
  it("marks a sku-channel as ads-active when an active setup overlaps the selected month", () => {
    expect(
      classifyAdsChannel({
        sku: "LUMI",
        channel: "shopee",
        month: "2026-04-01",
        setups: [
          {
            sku: "LUMI",
            channel: "shopee",
            start_date: "2026-03-20",
            end_date: null,
            status: "active",
          },
        ],
      }),
    ).toBe("ads-active")
  })

  it("marks a sku-channel as organic when no active setup overlaps the selected month", () => {
    expect(
      classifyAdsChannel({
        sku: "LUMI",
        channel: "tokopedia",
        month: "2026-04-01",
        setups: [
          {
            sku: "LUMI",
            channel: "tokopedia",
            start_date: "2026-04-01",
            end_date: "2026-04-30",
            status: "paused",
          },
        ],
      }),
    ).toBe("organic")
  })
})

describe("computeMonthlyBudgetCap", () => {
  it("multiplies the daily budget cap by the active days inside the selected month", () => {
    expect(
      computeMonthlyBudgetCap({
        month: "2026-04-01",
        daily_budget_cap: 150_000,
        start_date: "2026-04-10",
        end_date: null,
      }),
    ).toBe(3_150_000)
  })
})

describe("computeSkuMonthlySummary", () => {
  it("rolls up target units, actual units, channel-status units, ads spend, and profit after ads", () => {
    const summary = computeSkuMonthlySummary({
      month: "2026-04-01",
      sku: "LUMI",
      channelPerformance: [
        {
          sku: "LUMI",
          channel: "shopee",
          units: 20,
          revenue: 4_000_000,
          cost: 2_000_000,
          profit: 2_000_000,
        },
        {
          sku: "LUMI",
          channel: "tokopedia",
          units: 12,
          revenue: 1_800_000,
          cost: 720_000,
          profit: 1_080_000,
        },
        {
          sku: "CALMI",
          channel: "shopee",
          units: 99,
          revenue: 9_900_000,
          cost: 4_950_000,
          profit: 4_950_000,
        },
      ],
      setups: [
        {
          sku: "LUMI",
          channel: "shopee",
          start_date: "2026-04-10",
          end_date: null,
          status: "active",
          daily_budget_cap: 150_000,
        },
        {
          sku: "LUMI",
          channel: "tokopedia",
          start_date: "2026-04-01",
          end_date: "2026-04-30",
          status: "paused",
          daily_budget_cap: 200_000,
        },
        {
          sku: "LUMI",
          channel: "tiktok",
          start_date: "2026-05-01",
          end_date: null,
          status: "active",
          daily_budget_cap: 125_000,
        },
      ],
      monthlySpend: [
        {
          sku: "LUMI",
          channel: "shopee",
          month: "2026-04-01",
          actual_spend: 2_100_000,
        },
        {
          sku: "CALMI",
          channel: "shopee",
          month: "2026-04-01",
          actual_spend: 999_999,
        },
      ],
      salesTargets: [
        {
          sku: "LUMI",
          daily_target_units: 2,
          effective_from: "2026-04-10",
          effective_to: null,
        },
      ],
    })

    expect(summary).toMatchObject({
      month: "2026-04-01",
      sku: "LUMI",
      target_units: 42,
      actual_units: 32,
      ads_active_channel_units: 20,
      organic_channel_units: 12,
      total_ads_spent: 2_100_000,
      total_budget_cap: 3_150_000,
      gross_profit: 3_080_000,
      profit_after_ads: 980_000,
    })
    expect(summary.channels).toEqual([
      {
        channel: "shopee",
        classification: "ads-active",
        units: 20,
        ads_spent: 2_100_000,
        budget_cap: 3_150_000,
        revenue: 4_000_000,
        cost: 2_000_000,
        profit: 2_000_000,
        uses_shared_budget: false,
      },
      {
        channel: "tokopedia",
        classification: "organic",
        units: 12,
        ads_spent: 0,
        budget_cap: 0,
        revenue: 1_800_000,
        cost: 720_000,
        profit: 1_080_000,
        uses_shared_budget: false,
      },
    ])
  })
})

describe("monthly ads report bundle helpers", () => {
  it("keeps a genuinely empty month distinct from a load failure", () => {
    expect(
      buildMonthlyAdsReportBundle({
        month: "2026-04-15",
        orders: [],
        products: [],
        setups: [],
        spendRows: [],
        targets: [],
      }),
    ).toEqual({
      month: "2026-04-01",
      skuSummaries: [],
      channelBreakdown: [],
      missingSpendScopes: [],
      monthlySpendRows: [],
      totals: {
        total_target_units: 0,
        total_actual_units: 0,
        ads_active_channel_units: 0,
        organic_channel_units: 0,
        total_ads_spent: 0,
        total_budget_cap: 0,
        profit_before_ads: 0,
        profit_after_ads: 0,
        target_achievement_percent: 0,
        has_missing_spend: false,
        ads_active_rows_missing_spend: 0,
      },
      load_error: null,
    })

    expect(
      createMonthlyAdsReportLoadErrorBundle({
        month: "2026-04-15",
        load_error: "orders query failed",
      }),
    ).toEqual({
      month: "2026-04-01",
      skuSummaries: [],
      channelBreakdown: [],
      missingSpendScopes: [],
      monthlySpendRows: [],
      totals: {
        total_target_units: 0,
        total_actual_units: 0,
        ads_active_channel_units: 0,
        organic_channel_units: 0,
        total_ads_spent: 0,
        total_budget_cap: 0,
        profit_before_ads: 0,
        profit_after_ads: 0,
        target_achievement_percent: 0,
        has_missing_spend: false,
        ads_active_rows_missing_spend: 0,
      },
      load_error: "orders query failed",
    })
  })
})

describe("sku ads action surface", () => {
  it("exports the SKU setup, spend, target, and report bundle actions", async () => {
    const actions = await loadAdCampaignActions()

    expect(actions.createSkuAdSetup).toEqual(expect.any(Function))
    expect(actions.getSkuAdSetups).toEqual(expect.any(Function))
    expect(actions.upsertMonthlyAdSpend).toEqual(expect.any(Function))
    expect(actions.getMonthlyAdSpendRows).toEqual(expect.any(Function))
    expect(actions.createSkuSalesTarget).toEqual(expect.any(Function))
    expect(actions.getSkuSalesTargets).toEqual(expect.any(Function))
    expect(actions.getMonthlyAdsReportBundle).toEqual(expect.any(Function))
  })

  it("creates SKU ad setups as active rows and returns the inserted record", async () => {
    const insertedRow = {
      id: "setup_1",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      objective: "profit",
      daily_budget_cap: 100_000,
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
      notes: "Launch",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }

    const insertBuilder = {
      select: vi.fn(() => insertBuilder),
      single: vi.fn(async () => ({
        data: insertedRow,
        error: null,
      })),
    }
    const tableBuilder = {
      insert: vi.fn((rows: unknown[]) => {
        expect(rows).toEqual([
          {
            sku: "LUMI",
            channel: "shopee",
            channels: ["shopee"],
            channel_scope_key: "shopee",
            objective: "profit",
            daily_budget_cap: 100_000,
            start_date: "2026-04-01",
            end_date: null,
            notes: "Launch",
            status: "active",
          },
        ])

        return insertBuilder
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_ad_setups") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { createSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      createSkuAdSetup({
        sku: "LUMI",
        channel: "shopee",
        objective: "profit",
        daily_budget_cap: 100_000,
        start_date: "2026-04-01",
        end_date: null,
        notes: "Launch",
      }),
    ).resolves.toEqual({
      success: true,
      data: insertedRow,
    })
  })

  it("upserts monthly ad spend on the normalized month bucket", async () => {
    const upsertedRow = {
      id: "spend_1",
      month: "2026-04-01",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      actual_spend: 250_000,
      notes: "Final April spend",
      finance_entry_id: null,
      created_at: "2026-04-30T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    }

    const upsertBuilder = {
      select: vi.fn(() => upsertBuilder),
      single: vi.fn(async () => ({
        data: upsertedRow,
        error: null,
      })),
    }
    const tableBuilder = {
      upsert: vi.fn((rows: unknown[], options: unknown) => {
        expect(rows).toEqual([
          {
            month: "2026-04-01",
            sku: "LUMI",
            channel: "shopee",
            channels: ["shopee"],
            channel_scope_key: "shopee",
            actual_spend: 250_000,
            notes: "Final April spend",
          },
        ])
        expect(options).toEqual({ onConflict: "month,sku,channel_scope_key" })

        return upsertBuilder
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "monthly_ad_spend") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { upsertMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(
      upsertMonthlyAdSpend({
        month: "2026-04-22",
        sku: "LUMI",
        channel: "shopee",
        actual_spend: 250_000,
        notes: "Final April spend",
      }),
    ).resolves.toEqual({
      success: true,
      data: upsertedRow,
    })
  })

  it("loads SKU ad setups ordered by newest start date first", async () => {
    const setupRows = [
      {
        id: "setup_2",
        sku: "LUMI",
        channel: "tokopedia",
        objective: "scale",
        daily_budget_cap: 125_000,
        start_date: "2026-04-15",
        end_date: null,
        status: "paused",
        notes: null,
        created_at: "2026-04-15T00:00:00.000Z",
        updated_at: "2026-04-15T00:00:00.000Z",
      },
      {
        id: "setup_1",
        sku: "LUMI",
        channel: "shopee",
        objective: "profit",
        daily_budget_cap: 100_000,
        start_date: "2026-04-01",
        end_date: null,
        status: "active",
        notes: "Launch",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ]

    const tableBuilder = {
      select: vi.fn(() => tableBuilder),
      order: vi.fn(async (column: string, options: { ascending: boolean }) => {
        expect(column).toBe("start_date")
        expect(options).toEqual({ ascending: false })

        return {
          data: setupRows,
          error: null,
        }
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_ad_setups") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getSkuAdSetups } = await loadAdCampaignActions()

    await expect(getSkuAdSetups()).resolves.toEqual({
      data: setupRows,
      load_error: null,
    })
  })

  it("returns an explicit load_error when loading SKU ad setups fails", async () => {
    const tableBuilder = {
      select: vi.fn(() => tableBuilder),
      order: vi.fn(async () => ({
        data: null,
        error: { message: "setups offline" },
      })),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_ad_setups") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getSkuAdSetups } = await loadAdCampaignActions()

    await expect(getSkuAdSetups()).resolves.toEqual({
      data: [],
      load_error: "setups offline",
    })
  })

  it("loads monthly ad spend rows for the normalized month and sorts by sku then channel", async () => {
    const spendRows = [
      {
        id: "spend_2",
        month: "2026-04-01",
        sku: "LUMI",
        channel: "tokopedia",
        actual_spend: 70_000,
        notes: null,
        finance_entry_id: null,
        created_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "spend_1",
        month: "2026-04-01",
        sku: "CALMI",
        channel: "shopee",
        actual_spend: 90_000,
        notes: "Month end",
        finance_entry_id: null,
        created_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      },
      {
        id: "spend_3",
        month: "2026-04-01",
        sku: "LUMI",
        channel: "shopee",
        actual_spend: 110_000,
        notes: null,
        finance_entry_id: null,
        created_at: "2026-04-30T00:00:00.000Z",
        updated_at: "2026-04-30T00:00:00.000Z",
      },
    ]

    const tableBuilder = {
      select: vi.fn(() => tableBuilder),
      eq: vi.fn(async (column: string, value: string) => {
        expect(column).toBe("month")
        expect(value).toBe("2026-04-01")

        return {
          data: spendRows,
          error: null,
        }
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "monthly_ad_spend") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getMonthlyAdSpendRows } = await loadAdCampaignActions()

    await expect(getMonthlyAdSpendRows("2026-04-27")).resolves.toEqual({
      data: [spendRows[1], spendRows[2], spendRows[0]],
      load_error: null,
    })
  })

  it("returns an explicit load_error when loading monthly ad spend rows fails", async () => {
    const tableBuilder = {
      select: vi.fn(() => tableBuilder),
      eq: vi.fn(async (column: string, value: string) => {
        expect(column).toBe("month")
        expect(value).toBe("2026-04-01")

        return {
          data: null,
          error: { message: "spend query failed" },
        }
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "monthly_ad_spend") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getMonthlyAdSpendRows } = await loadAdCampaignActions()

    await expect(getMonthlyAdSpendRows("2026-04-27")).resolves.toEqual({
      data: [],
      load_error: "spend query failed",
    })
  })

  it("creates SKU sales targets and returns the inserted record", async () => {
    const insertedTarget = {
      id: "target_1",
      sku: "LUMI",
      daily_target_units: 3,
      effective_from: "2026-04-01",
      effective_to: null,
      notes: "April target",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }

    const insertBuilder = {
      select: vi.fn(() => insertBuilder),
      single: vi.fn(async () => ({
        data: insertedTarget,
        error: null,
      })),
    }
    const tableBuilder = {
      insert: vi.fn((rows: unknown[]) => {
        expect(rows).toEqual([
          {
            sku: "LUMI",
            daily_target_units: 3,
            effective_from: "2026-04-01",
            effective_to: null,
            notes: "April target",
          },
        ])

        return insertBuilder
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_sales_targets") {
          return tableBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { createSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      createSkuSalesTarget({
        sku: "LUMI",
        daily_target_units: 3,
        effective_from: "2026-04-01",
        effective_to: null,
        notes: "April target",
      }),
    ).resolves.toEqual({
      success: true,
      data: insertedTarget,
    })
  })

  it("loads SKU sales targets sorted by effective date descending then sku", async () => {
    const targetRows = [
      {
        id: "target_1",
        sku: "CALMI",
        daily_target_units: 2,
        effective_from: "2026-04-01",
        effective_to: null,
        notes: null,
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
      {
        id: "target_2",
        sku: "LUMI",
        daily_target_units: 4,
        effective_from: "2026-05-01",
        effective_to: null,
        notes: null,
        created_at: "2026-05-01T00:00:00.000Z",
        updated_at: "2026-05-01T00:00:00.000Z",
      },
      {
        id: "target_3",
        sku: "AURI",
        daily_target_units: 1,
        effective_from: "2026-04-01",
        effective_to: "2026-04-30",
        notes: "Promo period",
        created_at: "2026-04-01T00:00:00.000Z",
        updated_at: "2026-04-01T00:00:00.000Z",
      },
    ]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_sales_targets") {
          return {
            select: vi.fn(async () => ({
              data: targetRows,
              error: null,
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getSkuSalesTargets } = await loadAdCampaignActions()

    await expect(getSkuSalesTargets()).resolves.toEqual({
      data: [targetRows[1], targetRows[2], targetRows[0]],
      load_error: null,
    })
  })

  it("returns an explicit load_error when loading SKU sales targets fails", async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "sku_sales_targets") {
          return {
            select: vi.fn(async () => ({
              data: null,
              error: { message: "targets unavailable" },
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getSkuSalesTargets } = await loadAdCampaignActions()

    await expect(getSkuSalesTargets()).resolves.toEqual({
      data: [],
      load_error: "targets unavailable",
    })
  })

  it("builds a monthly report bundle with SKU summaries, channel rows, totals, and raw monthly spend rows", async () => {
    const ordersResult = {
      data: [
        {
          id: "ord_1",
          order_id: "SHOPE-1",
          channel: "shopee",
          order_date: "2026-04-05",
          status: "paid",
          channel_fees: 20_000,
          order_line_items: [
            {
              sku: "LUMI",
              quantity: 2,
              selling_price: 100_000,
              cost_per_unit_snapshot: 40_000,
            },
          ],
        },
        {
          id: "ord_2",
          order_id: "TOKO-1",
          channel: "tokopedia",
          order_date: "2026-04-12",
          status: "shipped",
          channel_fees: 5_000,
          order_line_items: [
            {
              sku: "LUMI",
              quantity: 1,
              selling_price: 150_000,
              cost_per_unit_snapshot: 60_000,
            },
          ],
        },
      ],
      error: null,
    }
    const productsResult = {
      data: [
        {
          sku: "LUMI",
          name: "Lumi",
          variant: null,
          cost_per_unit: 50_000,
        },
        {
          sku: "CALMI",
          name: "Calmi",
          variant: "Mint",
          cost_per_unit: 30_000,
        },
      ],
      error: null,
    }
    const setupsResult = {
      data: [
        {
          id: "setup_1",
          sku: "LUMI",
          channel: "shopee",
          objective: "profit",
          daily_budget_cap: 10_000,
          start_date: "2026-04-01",
          end_date: null,
          status: "active",
          notes: null,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
        {
          id: "setup_2",
          sku: "CALMI",
          channel: "tiktok",
          objective: "scale",
          daily_budget_cap: 20_000,
          start_date: "2026-04-10",
          end_date: null,
          status: "active",
          notes: null,
          created_at: "2026-04-10T00:00:00.000Z",
          updated_at: "2026-04-10T00:00:00.000Z",
        },
      ],
      error: null,
    }
    const spendResult = {
      data: [
        {
          id: "spend_1",
          month: "2026-04-01",
          sku: "LUMI",
          channel: "shopee",
          actual_spend: 50_000,
          notes: null,
          finance_entry_id: null,
          created_at: "2026-04-30T00:00:00.000Z",
          updated_at: "2026-04-30T00:00:00.000Z",
        },
      ],
      error: null,
    }
    const targetsResult = {
      data: [
        {
          id: "target_1",
          sku: "LUMI",
          daily_target_units: 1,
          effective_from: "2026-04-01",
          effective_to: null,
          notes: null,
          created_at: "2026-04-01T00:00:00.000Z",
          updated_at: "2026-04-01T00:00:00.000Z",
        },
        {
          id: "target_2",
          sku: "CALMI",
          daily_target_units: 2,
          effective_from: "2026-04-10",
          effective_to: null,
          notes: null,
          created_at: "2026-04-10T00:00:00.000Z",
          updated_at: "2026-04-10T00:00:00.000Z",
        },
      ],
      error: null,
    }

    const ordersBuilder = {
      select: vi.fn(() => ordersBuilder),
      gte: vi.fn(() => ordersBuilder),
      lte: vi.fn(() => ordersBuilder),
      in: vi.fn(async () => ordersResult),
    }
    const spendBuilder = {
      select: vi.fn(() => spendBuilder),
      eq: vi.fn(async (column: string, value: string) => {
        expect(column).toBe("month")
        expect(value).toBe("2026-04-01")

        return spendResult
      }),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return ordersBuilder
        }

        if (table === "products") {
          return {
            select: vi.fn(async () => productsResult),
          }
        }

        if (table === "sku_ad_setups") {
          return {
            select: vi.fn(async () => setupsResult),
          }
        }

        if (table === "monthly_ad_spend") {
          return spendBuilder
        }

        if (table === "sku_sales_targets") {
          return {
            select: vi.fn(async () => targetsResult),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getMonthlyAdsReportBundle } = await loadAdCampaignActions()
    const result = await getMonthlyAdsReportBundle("2026-04-15")

    expect(result.month).toBe("2026-04-01")
    expect(result.load_error).toBeNull()
    expect(result.monthlySpendRows).toEqual(spendResult.data)
    expect(result.skuSummaries).toMatchObject([
      {
        month: "2026-04-01",
        sku: "CALMI",
        target_units: 42,
        actual_units: 0,
        total_ads_spent: 0,
        total_budget_cap: 420_000,
        profit_after_ads: 0,
      },
      {
        month: "2026-04-01",
        sku: "LUMI",
        target_units: 30,
        actual_units: 3,
        ads_active_channel_units: 2,
        organic_channel_units: 1,
        total_ads_spent: 50_000,
        total_budget_cap: 300_000,
        gross_profit: 185_000,
        profit_after_ads: 135_000,
      },
    ])
    expect(result.channelBreakdown).toEqual([
      {
        month: "2026-04-01",
        sku: "CALMI",
        product_name: "Calmi",
        product_variant: "Mint",
        channel: "tiktok",
        classification: "ads-active",
        units: 0,
        ads_spent: 0,
        budget_cap: 420_000,
        revenue: 0,
        cost: 0,
        profit: 0,
        uses_shared_budget: false,
        profit_after_ads: 0,
        actual_spend_missing: true,
      },
      {
        month: "2026-04-01",
        sku: "LUMI",
        product_name: "Lumi",
        product_variant: null,
        channel: "shopee",
        classification: "ads-active",
        units: 2,
        ads_spent: 50_000,
        budget_cap: 300_000,
        revenue: 180_000,
        cost: 80_000,
        profit: 100_000,
        uses_shared_budget: false,
        profit_after_ads: 50_000,
        actual_spend_missing: false,
      },
      {
        month: "2026-04-01",
        sku: "LUMI",
        product_name: "Lumi",
        product_variant: null,
        channel: "tokopedia",
        classification: "organic",
        units: 1,
        ads_spent: 0,
        budget_cap: 0,
        revenue: 145_000,
        cost: 60_000,
        profit: 85_000,
        uses_shared_budget: false,
        profit_after_ads: 85_000,
        actual_spend_missing: false,
      },
    ])
    expect(result.totals).toEqual({
      total_target_units: 72,
      total_actual_units: 3,
      ads_active_channel_units: 2,
      organic_channel_units: 1,
      total_ads_spent: 50_000,
      total_budget_cap: 720_000,
      profit_before_ads: 185_000,
      profit_after_ads: 135_000,
      target_achievement_percent: 100 * (3 / 72),
      has_missing_spend: true,
      ads_active_rows_missing_spend: 1,
    })
  })

  it("returns an explicit load_error when a report query fails", async () => {
    const ordersBuilder = {
      select: vi.fn(() => ordersBuilder),
      gte: vi.fn(() => ordersBuilder),
      lte: vi.fn(() => ordersBuilder),
      in: vi.fn(async () => ({
        data: null,
        error: { message: "orders offline" },
      })),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return ordersBuilder
        }

        if (table === "products" || table === "sku_ad_setups" || table === "sku_sales_targets") {
          return {
            select: vi.fn(async () => ({
              data: [],
              error: null,
            })),
          }
        }

        if (table === "monthly_ad_spend") {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(async () => ({
                data: [],
                error: null,
              })),
            })),
          }
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as unknown as MockSupabaseClient)

    const { getMonthlyAdsReportBundle } = await loadAdCampaignActions()

    await expect(getMonthlyAdsReportBundle("2026-04-15")).resolves.toEqual({
      month: "2026-04-01",
      skuSummaries: [],
      channelBreakdown: [],
      missingSpendScopes: [],
      monthlySpendRows: [],
      totals: {
        total_target_units: 0,
        total_actual_units: 0,
        ads_active_channel_units: 0,
        organic_channel_units: 0,
        total_ads_spent: 0,
        total_budget_cap: 0,
        profit_before_ads: 0,
        profit_after_ads: 0,
        target_achievement_percent: 0,
        has_missing_spend: false,
        ads_active_rows_missing_spend: 0,
      },
      load_error: "orders offline",
    })
  })
})
