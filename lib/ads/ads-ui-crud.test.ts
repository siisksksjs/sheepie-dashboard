import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MonthlyAdsReportBundle } from "@/lib/ads/reporting"
import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type {
  MonthlyAdSpend,
  Product,
  SkuAdSetup,
  SkuSalesTarget,
} from "@/lib/types/database.types"

const { routerPush, routerRefresh } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  routerRefresh: vi.fn(),
}))
const { notFoundMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    refresh: routerRefresh,
  }),
  notFound: notFoundMock,
}))

vi.mock("next/link", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    __esModule: true,
    default: ({
      href,
      children,
      ...props
    }: {
      href: string
      children: React.ReactNode
    }) => React.createElement("a", { href, ...props }, children),
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("@/lib/line-item-costs", () => ({
  getLineItemTotalCost: vi.fn(() => 0),
}))

vi.mock("../actions/changelog", () => ({
  safeRecordAutomaticChangelogEntry: vi.fn(),
}))

vi.mock("@/lib/changelog", () => ({
  buildChangeItem: vi.fn(() => null),
}))

vi.mock("@/lib/actions/ad-campaigns", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/actions/ad-campaigns")>()

  return {
    ...actual,
    getMonthlyAdSpendById: vi.fn(),
    getSkuAdSetupById: vi.fn(),
    getSkuSalesTargetById: vi.fn(),
  }
})

vi.mock("@/lib/actions/products", () => ({
  getProducts: vi.fn(),
}))

vi.mock("@/components/ui/button", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
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
  }
})

vi.mock("@/components/ui/card", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  const makeDiv = (slot: string) => {
    const Component = ({
      children,
      ...props
    }: {
      children: React.ReactNode
    }) => React.createElement("div", { "data-slot": slot, ...props }, children)

    Component.displayName = slot
    return Component
  }

  return {
    Card: makeDiv("card"),
    CardHeader: makeDiv("card-header"),
    CardTitle: makeDiv("card-title"),
    CardDescription: makeDiv("card-description"),
    CardContent: makeDiv("card-content"),
  }
})

vi.mock("@/components/ui/input", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
  }
})

vi.mock("@/components/ui/label", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    Label: ({
      children,
      ...props
    }: {
      children: React.ReactNode
    }) => React.createElement("label", props, children),
  }
})

vi.mock("@/components/ui/textarea", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  return {
    Textarea: ({
      children,
      ...props
    }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props, children),
  }
})

vi.mock("@/components/ui/select", async () => {
  const React = await vi.importActual<typeof import("react")>("react")

  const Fragment = ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children)
  const renderElement = (tag: string, slot: string) => {
    const Component = ({
      children,
      ...props
    }: {
      children: React.ReactNode
    }) => React.createElement(tag, { "data-slot": slot, ...props }, children)

    Component.displayName = slot
    return Component
  }

  return {
    Select: ({
      children,
      name,
      value,
      defaultValue,
      required,
    }: {
      children: React.ReactNode
      name?: string
      value?: string
      defaultValue?: string
      required?: boolean
    }) =>
      React.createElement(
        "div",
        {
          "data-slot": "select",
          "data-name": name,
          "data-value": value ?? defaultValue ?? "",
          "data-required": required ? "true" : undefined,
        },
        children,
      ),
    SelectValue: ({ placeholder }: { placeholder?: string }) =>
      React.createElement("span", { "data-slot": "select-value" }, placeholder),
    SelectContent: Fragment,
    SelectTrigger: renderElement("button", "select-trigger"),
    SelectItem: ({
      children,
      value,
    }: {
      children: React.ReactNode
      value: string
    }) => React.createElement("div", { "data-slot": "select-item", "data-value": value }, children),
  }
})

type MockSupabaseClient = Awaited<ReturnType<typeof createClient>>

const loadAdCampaignActions = async () => import("../actions/ad-campaigns")
const loadAdCampaignActionMocks = async () => import("@/lib/actions/ad-campaigns")
const loadAdCampaignForms = async () =>
  Promise.all([
    import("../../components/ad-campaigns/setup-form"),
    import("../../components/ad-campaigns/spend-form"),
    import("../../components/ad-campaigns/target-form"),
  ])
const loadAdCampaignCrudPages = async () =>
  Promise.all([
    import("../../app/(dashboard)/ad-campaigns/setup/new/page"),
    import("../../app/(dashboard)/ad-campaigns/setup/[id]/edit/page"),
    import("../../app/(dashboard)/ad-campaigns/spend/new/page"),
    import("../../app/(dashboard)/ad-campaigns/spend/[id]/edit/page"),
    import("../../app/(dashboard)/ad-campaigns/targets/new/page"),
    import("../../app/(dashboard)/ad-campaigns/targets/[id]/edit/page"),
  ])
const loadProductActionMocks = async () => import("@/lib/actions/products")
const loadAdsWorkspace = async () =>
  import("../../components/ad-campaigns/ads-setup-workspace")

async function loadFormModuleWithState<TModule>(
  modulePath: string,
  stateValues: unknown[],
) {
  vi.resetModules()
  vi.doMock("react", async () => {
    const actual = await vi.importActual<typeof import("react")>("react")
    let stateIndex = 0

    return {
      ...actual,
      useRef: () => ({ current: false }),
      useState: (initialValue: unknown) => {
        const nextValue =
          stateIndex < stateValues.length ? stateValues[stateIndex] : initialValue
        stateIndex += 1
        return [nextValue, vi.fn()] as const
      },
    }
  })

  const loadedModule = (await import(modulePath)) as TModule
  vi.doUnmock("react")
  vi.resetModules()
  return loadedModule
}

const sampleProducts: Product[] = [
  {
    id: "prod_1",
    sku: "LUMI",
    name: "Lumi Candle",
    variant: "Lavender",
    cost_per_unit: 50000,
    reorder_point: 20,
    is_bundle: false,
    status: "active",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  },
  {
    id: "prod_2",
    sku: "AURA",
    name: "Aura Spray",
    variant: null,
    cost_per_unit: 40000,
    reorder_point: 15,
    is_bundle: false,
    status: "active",
    created_at: "2026-04-01T00:00:00.000Z",
    updated_at: "2026-04-01T00:00:00.000Z",
  },
]

const sampleMonthlyAdsReportBundle: MonthlyAdsReportBundle = {
  month: "2026-04-01",
  skuSummaries: [
    {
      month: "2026-04-01",
      sku: "LUMI",
      target_units: 360,
      actual_units: 240,
      ads_active_channel_units: 180,
      organic_channel_units: 60,
      total_ads_spent: 2_100_000,
      total_budget_cap: 3_000_000,
      gross_profit: 4_500_000,
      profit_after_ads: 2_400_000,
      channels: [
        {
          channel: "shopee",
          classification: "ads-active",
          units: 180,
          ads_spent: 2_100_000,
          budget_cap: 3_000_000,
          revenue: 9_000_000,
          cost: 4_500_000,
          profit: 4_500_000,
          uses_shared_budget: false,
        },
        {
          channel: "tokopedia",
          classification: "organic",
          units: 60,
          ads_spent: 0,
          budget_cap: 0,
          revenue: 3_000_000,
          cost: 1_500_000,
          profit: 1_500_000,
          uses_shared_budget: false,
        },
      ],
    },
  ],
  channelBreakdown: [
    {
      month: "2026-04-01",
      sku: "LUMI",
      channel: "shopee",
      classification: "ads-active",
      units: 180,
      ads_spent: 2_100_000,
      budget_cap: 3_000_000,
      revenue: 9_000_000,
      cost: 4_500_000,
      profit: 4_500_000,
      uses_shared_budget: false,
      product_name: "Lumi Candle",
      product_variant: "Lavender",
      profit_after_ads: 2_400_000,
      actual_spend_missing: false,
    },
    {
      month: "2026-04-01",
      sku: "LUMI",
      channel: "tokopedia",
      classification: "organic",
      units: 60,
      ads_spent: 0,
      budget_cap: 0,
      revenue: 3_000_000,
      cost: 1_500_000,
      profit: 1_500_000,
      uses_shared_budget: false,
      product_name: "Lumi Candle",
      product_variant: "Lavender",
      profit_after_ads: 1_500_000,
      actual_spend_missing: false,
    },
  ],
  missingSpendScopes: [],
  monthlySpendRows: [
    {
      id: "spend_1",
      month: "2026-04-01",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      actual_spend: 2_100_000,
      notes: "Month close",
      finance_entry_id: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    },
  ],
  totals: {
    total_target_units: 360,
    total_actual_units: 240,
    ads_active_channel_units: 180,
    organic_channel_units: 60,
    total_ads_spent: 2_100_000,
    total_budget_cap: 3_000_000,
    profit_before_ads: 4_500_000,
    profit_after_ads: 2_400_000,
    target_achievement_percent: 66.7,
    has_missing_spend: false,
    ads_active_rows_missing_spend: 0,
  },
  load_error: null,
}

function mockSupabaseTables(tables: Record<string, unknown>) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn((table: string) => {
      if (table in tables) {
        return tables[table]
      }

      throw new Error(`Unexpected table: ${table}`)
    }),
  } as unknown as MockSupabaseClient)
}

function expectAdsReportingRevalidated() {
  const revalidatedPaths = vi
    .mocked(revalidatePath)
    .mock.calls.map(([path]) => path)

  expect(revalidatedPaths).toEqual(
    expect.arrayContaining(["/ad-campaigns", "/reports"]),
  )
  expect(revalidatedPaths.filter((path) => path === "/ad-campaigns")).not.toHaveLength(0)
  expect(revalidatedPaths.filter((path) => path === "/reports")).not.toHaveLength(0)
}

beforeEach(() => {
  vi.clearAllMocks()
  routerPush.mockReset()
  routerRefresh.mockReset()
  notFoundMock.mockClear()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("ads UI CRUD mutation surface", () => {
  it("exports the setup, spend, and target mutation actions", async () => {
    const actions = await loadAdCampaignActions()

    expect(actions.updateSkuAdSetup).toEqual(expect.any(Function))
    expect(actions.deleteSkuAdSetup).toEqual(expect.any(Function))
    expect(actions.pauseSkuAdSetup).toEqual(expect.any(Function))
    expect(actions.endSkuAdSetup).toEqual(expect.any(Function))
    expect(actions.updateMonthlyAdSpend).toEqual(expect.any(Function))
    expect(actions.deleteMonthlyAdSpend).toEqual(expect.any(Function))
    expect(actions.updateSkuSalesTarget).toEqual(expect.any(Function))
    expect(actions.deleteSkuSalesTarget).toEqual(expect.any(Function))
  })

  it.each([
    {
      name: "createSkuAdSetup rejects a missing required start date",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: "GMV Max",
          daily_budget_cap: 175_000,
          start_date: undefined as unknown as string,
          end_date: null,
          notes: null,
        }),
      expectedError: "Start date is required",
    },
    {
      name: "createSkuAdSetup rejects non-finite daily budget caps",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: "GMV Max",
          daily_budget_cap: Number.NaN,
          start_date: "2026-04-01",
          end_date: null,
          notes: null,
        }),
      expectedError: "Daily budget cap must be a finite number",
    },
    {
      name: "upsertMonthlyAdSpend rejects a missing required month",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.upsertMonthlyAdSpend({
          sku: "LUMI",
          channel: "shopee",
          month: undefined as unknown as string,
          actual_spend: 210_000,
          notes: null,
        }),
      expectedError: "Month is required",
    },
    {
      name: "upsertMonthlyAdSpend rejects non-finite spend amounts",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.upsertMonthlyAdSpend({
          sku: "LUMI",
          channel: "shopee",
          month: "2026-04-01",
          actual_spend: Number.POSITIVE_INFINITY,
          notes: null,
        }),
      expectedError: "Actual spend must be a finite number",
    },
    {
      name: "createSkuSalesTarget rejects a missing required effective_from date",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.createSkuSalesTarget({
          sku: "LUMI",
          daily_target_units: 5,
          effective_from: undefined as unknown as string,
          effective_to: null,
          notes: null,
        }),
      expectedError: "Effective from is required",
    },
    {
      name: "createSkuSalesTarget rejects non-finite daily target units",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) =>
        actions.createSkuSalesTarget({
          sku: "LUMI",
          daily_target_units: Number.NaN,
          effective_from: "2026-04-01",
          effective_to: null,
          notes: null,
        }),
      expectedError: "Daily target units must be a finite number",
    },
  ])("$name", async ({ run, expectedError }) => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(),
    } as unknown as MockSupabaseClient)

    const actions = await loadAdCampaignActions()

    await expect(run(actions)).resolves.toEqual({
      success: false,
      error: expectedError,
    })

    expect(createClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("updates a SKU ad setup and revalidates both reporting pages", async () => {
    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: "2026-04-30",
      status: "active",
    }
    const updatedRow = {
      id: "setup_1",
      sku: "LUMI",
      channel: "shopee",
      objective: "scale",
      daily_budget_cap: 175_000,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
      status: "active",
      notes: "Scaled budget",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-10T00:00:00.000Z",
    }

    const loadSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const loadEq = vi.fn(() => ({
      single: loadSingle,
    }))
    const selectBuilder = {
      single: vi.fn(async () => ({
        data: updatedRow,
        error: null,
      })),
    }
    const eqBuilder = {
      select: vi.fn(() => selectBuilder),
    }
    const tableBuilder = {
      select: vi.fn((columns?: string) => {
        expect(columns).toBe("start_date, end_date, status")

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")
            return loadEq()
          }),
        }
      }),
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          objective: "scale",
          daily_budget_cap: 175_000,
          end_date: "2026-04-30",
          notes: "Scaled budget",
        })

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")
            return eqBuilder
          }),
        }
      }),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { updateSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      updateSkuAdSetup("setup_1", {
        objective: "scale",
        daily_budget_cap: 175_000,
        end_date: "2026-04-30",
        notes: "Scaled budget",
      }),
    ).resolves.toEqual({
      success: true,
      data: updatedRow,
    })

    expectAdsReportingRevalidated()
  })

  it("deletes a SKU ad setup and returns a structured success result", async () => {
    const tableBuilder = {
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: string) => {
          expect(column).toBe("id")
          expect(value).toBe("setup_1")

          return {
            error: null,
          }
        }),
      })),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { deleteSkuAdSetup } = await loadAdCampaignActions()

    await expect(deleteSkuAdSetup("setup_1")).resolves.toEqual({
      success: true,
    })

    expectAdsReportingRevalidated()
  })

  it("pauses a SKU ad setup by setting the status to paused and revalidating reporting", async () => {
    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
    }
    const pausedRow = {
      id: "setup_1",
      status: "paused",
    }

    const selectBuilder = {
      single: vi.fn(async () => ({
        data: pausedRow,
        error: null,
      })),
    }
    const eqBuilder = {
      select: vi.fn(() => selectBuilder),
    }
    const tableBuilder = {
      select: vi.fn((columns?: string) => {
        expect(columns).toBe("start_date, end_date, status")

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")

            return {
              single: vi.fn(async () => ({
                data: existingRow,
                error: null,
              })),
            }
          }),
        }
      }),
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          status: "paused",
        })

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")
            return eqBuilder
          }),
        }
      }),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { pauseSkuAdSetup } = await loadAdCampaignActions()

    await expect(pauseSkuAdSetup("setup_1")).resolves.toEqual({
      success: true,
      data: pausedRow,
    })

    expectAdsReportingRevalidated()
  })

  it("ends a SKU ad setup by marking it ended, stamping Jakarta's business date, and revalidating reporting", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-18T20:30:00.000Z"))

    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
    }
    const endedRow = {
      id: "setup_1",
      status: "ended",
      end_date: "2026-04-19",
    }

    const loadSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectBuilder = {
      single: vi.fn(async () => ({
        data: endedRow,
        error: null,
      })),
    }
    const eqBuilder = {
      select: vi.fn(() => selectBuilder),
    }
    const tableBuilder = {
      select: vi.fn((columns?: string) => {
        expect(columns).toBe("start_date, end_date, status")

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")
            return {
              single: loadSingle,
            }
          }),
        }
      }),
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          status: "ended",
          end_date: "2026-04-19",
        })

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("setup_1")
            return eqBuilder
          }),
        }
      }),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { endSkuAdSetup } = await loadAdCampaignActions()

    await expect(endSkuAdSetup("setup_1")).resolves.toEqual({
      success: true,
      data: endedRow,
    })

    expectAdsReportingRevalidated()
  })

  it("stamps an end date when updateSkuAdSetup marks a setup ended directly", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-18T20:30:00.000Z"))

    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
    }
    const updatedRow = {
      id: "setup_1",
      status: "ended",
      end_date: "2026-04-19",
    }

    mockSupabaseTables({
      sku_ad_setups: {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: existingRow,
              error: null,
            })),
          })),
        })),
        update: vi.fn((payload: unknown) => {
          expect(payload).toEqual({
            status: "ended",
            end_date: "2026-04-19",
          })

          return {
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({
                  data: updatedRow,
                  error: null,
                })),
              })),
            })),
          }
        }),
      },
    })

    const { updateSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      updateSkuAdSetup("setup_1", {
        status: "ended",
      }),
    ).resolves.toEqual({
      success: true,
      data: updatedRow,
    })

    expectAdsReportingRevalidated()
  })

  it("updates monthly ad spend on the normalized month bucket and revalidates reporting", async () => {
    const updatedRow = {
      id: "spend_1",
      month: "2026-04-01",
      sku: "LUMI",
      channel: "shopee",
      actual_spend: 410_000,
      notes: "Adjusted after reconciliation",
      finance_entry_id: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    }

    const selectBuilder = {
      single: vi.fn(async () => ({
        data: updatedRow,
        error: null,
      })),
    }
    const eqBuilder = {
      select: vi.fn(() => selectBuilder),
    }
    const tableBuilder = {
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          month: "2026-04-01",
          actual_spend: 410_000,
          notes: "Adjusted after reconciliation",
        })

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("spend_1")
            return eqBuilder
          }),
        }
      }),
    }

    mockSupabaseTables({
      monthly_ad_spend: tableBuilder,
    })

    const { updateMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(
      updateMonthlyAdSpend("spend_1", {
        month: "2026-04-23",
        actual_spend: 410_000,
        notes: "Adjusted after reconciliation",
      }),
    ).resolves.toEqual({
      success: true,
      data: updatedRow,
    })

    expectAdsReportingRevalidated()
  })

  it.each([
    {
      name: "negative daily budget caps",
      payload: {
        daily_budget_cap: -1,
      },
      error: "Daily budget cap cannot be negative",
    },
    {
      name: "invalid date strings",
      payload: {
        start_date: "2026-02-30",
      },
      error: "Start date must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "end dates earlier than start dates",
      payload: {
        start_date: "2026-04-10",
        end_date: "2026-04-09",
      },
      error: "End date cannot be earlier than start date",
    },
    {
      name: "invalid statuses",
      payload: {
        status: "invalid" as never,
      },
      error: "Status is invalid",
    },
  ])(
    "rejects SKU ad setup updates with $name before writing to Supabase",
    async ({ payload, error }) => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn(),
      } as unknown as MockSupabaseClient)

      const { updateSkuAdSetup } = await loadAdCampaignActions()

      await expect(updateSkuAdSetup("setup_1", payload)).resolves.toEqual({
        success: false,
        error,
      })

      expect(createClient).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it("rejects a partial SKU ad setup end date earlier than the persisted start date", async () => {
    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-10",
      end_date: null,
    }

    const selectSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectEq = vi.fn(() => ({
      single: selectSingle,
    }))
    const update = vi.fn(() => {
      throw new Error("update should not be reached")
    })

    mockSupabaseTables({
      sku_ad_setups: {
        select: vi.fn(() => ({
          eq: selectEq,
        })),
        update,
      },
    })

    const { updateSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      updateSkuAdSetup("setup_1", {
        end_date: "2026-04-09",
      }),
    ).resolves.toEqual({
      success: false,
      error: "End date cannot be earlier than start date",
    })

    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a partial SKU ad setup start date later than the persisted end date", async () => {
    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: "2026-04-15",
    }

    const selectSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectEq = vi.fn(() => ({
      single: selectSingle,
    }))
    const update = vi.fn(() => {
      throw new Error("update should not be reached")
    })

    mockSupabaseTables({
      sku_ad_setups: {
        select: vi.fn(() => ({
          eq: selectEq,
        })),
        update,
      },
    })

    const { updateSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      updateSkuAdSetup("setup_1", {
        start_date: "2026-04-16",
      }),
    ).resolves.toEqual({
      success: false,
      error: "End date cannot be earlier than start date",
    })

    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deletes monthly ad spend rows by id and revalidates reporting", async () => {
    const tableBuilder = {
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: string) => {
          expect(column).toBe("id")
          expect(value).toBe("spend_1")

          return {
            error: null,
          }
        }),
      })),
    }

    mockSupabaseTables({
      monthly_ad_spend: tableBuilder,
    })

    const { deleteMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(deleteMonthlyAdSpend("spend_1")).resolves.toEqual({
      success: true,
    })

    expectAdsReportingRevalidated()
  })

  it.each([
    {
      name: "malformed month values",
      payload: {
        month: "April 2026",
      },
      error: "Month must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "negative actual spend",
      payload: {
        actual_spend: -500,
      },
      error: "Actual spend cannot be negative",
    },
  ])(
    "rejects monthly ad spend updates with $name before writing to Supabase",
    async ({ payload, error }) => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn(),
      } as unknown as MockSupabaseClient)

      const { updateMonthlyAdSpend } = await loadAdCampaignActions()

      await expect(updateMonthlyAdSpend("spend_1", payload)).resolves.toEqual({
        success: false,
        error,
      })

      expect(createClient).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      name: "createSkuAdSetup negative budgets",
      invoke: async () => {
        const { createSkuAdSetup } = await loadAdCampaignActions()
        return createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: "scale",
          daily_budget_cap: -1,
          start_date: "2026-04-01",
          end_date: null,
          notes: null,
        })
      },
      expected: "Daily budget cap cannot be negative",
    },
    {
      name: "createSkuAdSetup invalid ISO dates",
      invoke: async () => {
        const { createSkuAdSetup } = await loadAdCampaignActions()
        return createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: "scale",
          daily_budget_cap: 100_000,
          start_date: "2026-02-30",
          end_date: null,
          notes: null,
        })
      },
      expected: "Start date must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "createSkuAdSetup inverted ranges",
      invoke: async () => {
        const { createSkuAdSetup } = await loadAdCampaignActions()
        return createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: "scale",
          daily_budget_cap: 100_000,
          start_date: "2026-04-10",
          end_date: "2026-04-09",
          notes: null,
        })
      },
      expected: "End date cannot be earlier than start date",
    },
    {
      name: "createSkuAdSetup empty objective",
      invoke: async () => {
        const { createSkuAdSetup } = await loadAdCampaignActions()
        return createSkuAdSetup({
          sku: "LUMI",
          channel: "shopee",
          objective: " ",
          daily_budget_cap: 100_000,
          start_date: "2026-04-01",
          end_date: null,
          notes: null,
        })
      },
      expected: "Objective is required",
    },
    {
      name: "upsertMonthlyAdSpend invalid ISO dates",
      invoke: async () => {
        const { upsertMonthlyAdSpend } = await loadAdCampaignActions()
        return upsertMonthlyAdSpend({
          month: "2026-02-30",
          sku: "LUMI",
          channel: "shopee",
          actual_spend: 100_000,
          notes: null,
        })
      },
      expected: "Month must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "upsertMonthlyAdSpend negative spend",
      invoke: async () => {
        const { upsertMonthlyAdSpend } = await loadAdCampaignActions()
        return upsertMonthlyAdSpend({
          month: "2026-04-01",
          sku: "LUMI",
          channel: "shopee",
          actual_spend: -1,
          notes: null,
        })
      },
      expected: "Actual spend cannot be negative",
    },
    {
      name: "upsertMonthlyAdSpend invalid channels",
      invoke: async () => {
        const { upsertMonthlyAdSpend } = await loadAdCampaignActions()
        return upsertMonthlyAdSpend({
          month: "2026-04-01",
          sku: "LUMI",
          channel: "invalid" as never,
          actual_spend: 100_000,
          notes: null,
        })
      },
      expected: "Channels is invalid",
    },
    {
      name: "createSkuSalesTarget negative target units",
      invoke: async () => {
        const { createSkuSalesTarget } = await loadAdCampaignActions()
        return createSkuSalesTarget({
          sku: "LUMI",
          daily_target_units: -1,
          effective_from: "2026-04-01",
          effective_to: null,
          notes: null,
        })
      },
      expected: "Daily target units cannot be negative",
    },
    {
      name: "createSkuSalesTarget invalid ISO dates",
      invoke: async () => {
        const { createSkuSalesTarget } = await loadAdCampaignActions()
        return createSkuSalesTarget({
          sku: "LUMI",
          daily_target_units: 5,
          effective_from: "2026-13-01",
          effective_to: null,
          notes: null,
        })
      },
      expected: "Effective from must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "createSkuSalesTarget inverted ranges",
      invoke: async () => {
        const { createSkuSalesTarget } = await loadAdCampaignActions()
        return createSkuSalesTarget({
          sku: "LUMI",
          daily_target_units: 5,
          effective_from: "2026-05-10",
          effective_to: "2026-05-09",
          notes: null,
        })
      },
      expected: "Effective to cannot be earlier than effective from",
    },
    {
      name: "createSkuSalesTarget empty SKUs",
      invoke: async () => {
        const { createSkuSalesTarget } = await loadAdCampaignActions()
        return createSkuSalesTarget({
          sku: " ",
          daily_target_units: 5,
          effective_from: "2026-04-01",
          effective_to: null,
          notes: null,
        })
      },
      expected: "SKU is required",
    },
  ])(
    "rejects invalid create/upsert inputs for $name before writing to Supabase",
    async ({ invoke, expected }) => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn(),
      } as unknown as MockSupabaseClient)

      await expect(invoke()).resolves.toEqual({
        success: false,
        error: expected,
      })

      expect(createClient).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it("creates a SKU ad setup with active status and revalidates reporting", async () => {
    const createdRow = {
      id: "setup_new",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      objective: "GMV Max",
      daily_budget_cap: 175_000,
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
      notes: "Primary campaign",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }

    mockSupabaseTables({
      sku_ad_setups: {
        insert: vi.fn((payload: unknown) => {
          expect(payload).toEqual([
            {
              sku: "LUMI",
              channel: "shopee",
              channels: ["shopee"],
              channel_scope_key: "shopee",
              objective: "GMV Max",
              daily_budget_cap: 175_000,
              start_date: "2026-04-01",
              end_date: null,
              status: "active",
              notes: "Primary campaign",
            },
          ])

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: createdRow,
                error: null,
              })),
            })),
          }
        }),
      },
    })

    const { createSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      createSkuAdSetup({
        sku: " LUMI ",
        channel: "shopee",
        objective: " GMV Max ",
        daily_budget_cap: 175_000,
        start_date: "2026-04-01",
        end_date: null,
        notes: " Primary campaign ",
      }),
    ).resolves.toEqual({
      success: true,
      data: createdRow,
    })

    expectAdsReportingRevalidated()
  })

  it("upserts monthly ad spend with a normalized month and revalidates reporting", async () => {
    const spendRow = {
      id: "spend_new",
      sku: "LUMI",
      channel: "shopee",
      channels: ["shopee"],
      channel_scope_key: "shopee",
      month: "2026-04-01",
      actual_spend: 210_000,
      notes: "Month close",
      finance_entry_id: null,
      created_at: "2026-04-30T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    }

    mockSupabaseTables({
      monthly_ad_spend: {
        upsert: vi.fn((payload: unknown, options: unknown) => {
          expect(payload).toEqual([
            {
              sku: "LUMI",
              channel: "shopee",
              channels: ["shopee"],
              channel_scope_key: "shopee",
              month: "2026-04-01",
              actual_spend: 210_000,
              notes: "Month close",
            },
          ])
          expect(options).toEqual({ onConflict: "month,sku,channel_scope_key" })

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: spendRow,
                error: null,
              })),
            })),
          }
        }),
      },
    })

    const { upsertMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(
      upsertMonthlyAdSpend({
        sku: " LUMI ",
        channel: "shopee",
        month: "2026-04-19",
        actual_spend: 210_000,
        notes: " Month close ",
      }),
    ).resolves.toEqual({
      success: true,
      data: spendRow,
    })

    expectAdsReportingRevalidated()
  })

  it("creates a SKU sales target and revalidates reporting", async () => {
    const createdRow = {
      id: "target_new",
      sku: "LUMI",
      daily_target_units: 5,
      effective_from: "2026-04-01",
      effective_to: null,
      notes: "April target",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }

    mockSupabaseTables({
      sku_sales_targets: {
        insert: vi.fn((payload: unknown) => {
          expect(payload).toEqual([
            {
              sku: "LUMI",
              daily_target_units: 5,
              effective_from: "2026-04-01",
              effective_to: null,
              notes: "April target",
            },
          ])

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: createdRow,
                error: null,
              })),
            })),
          }
        }),
      },
    })

    const { createSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      createSkuSalesTarget({
        sku: " LUMI ",
        daily_target_units: 5,
        effective_from: "2026-04-01",
        effective_to: null,
        notes: " April target ",
      }),
    ).resolves.toEqual({
      success: true,
      data: createdRow,
    })

    expectAdsReportingRevalidated()
  })

  it("canonicalizes whitespace-only notes to null on create paths", async () => {
    const createdRow = {
      id: "target_new",
      sku: "LUMI",
      daily_target_units: 5,
      effective_from: "2026-04-01",
      effective_to: null,
      notes: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-01T00:00:00.000Z",
    }

    mockSupabaseTables({
      sku_sales_targets: {
        insert: vi.fn((payload: unknown) => {
          expect(payload).toEqual([
            {
              sku: "LUMI",
              daily_target_units: 5,
              effective_from: "2026-04-01",
              effective_to: null,
              notes: null,
            },
          ])

          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: createdRow,
                error: null,
              })),
            })),
          }
        }),
      },
    })

    const { createSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      createSkuSalesTarget({
        sku: "LUMI",
        daily_target_units: 5,
        effective_from: "2026-04-01",
        effective_to: null,
        notes: "   ",
      }),
    ).resolves.toEqual({
      success: true,
      data: createdRow,
    })

    expectAdsReportingRevalidated()
  })

  it("updates SKU sales targets, returns the updated row, and revalidates reporting", async () => {
    const existingRow = {
      id: "target_1",
      effective_from: "2026-05-01",
      effective_to: "2026-05-31",
    }
    const updatedRow = {
      id: "target_1",
      sku: "LUMI",
      daily_target_units: 5,
      effective_from: "2026-05-01",
      effective_to: "2026-05-31",
      notes: "May promo target",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-05-01T00:00:00.000Z",
    }

    const loadSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectBuilder = {
      single: vi.fn(async () => ({
        data: updatedRow,
        error: null,
      })),
    }
    const eqBuilder = {
      select: vi.fn(() => selectBuilder),
    }
    const tableBuilder = {
      select: vi.fn((columns?: string) => {
        expect(columns).toBe("effective_from, effective_to")

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("target_1")
            return {
              single: loadSingle,
            }
          }),
        }
      }),
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          daily_target_units: 5,
          effective_from: "2026-05-01",
          effective_to: "2026-05-31",
          notes: "May promo target",
        })

        return {
          eq: vi.fn((column: string, value: string) => {
            expect(column).toBe("id")
            expect(value).toBe("target_1")
            return eqBuilder
          }),
        }
      }),
    }

    mockSupabaseTables({
      sku_sales_targets: tableBuilder,
    })

    const { updateSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      updateSkuSalesTarget("target_1", {
        daily_target_units: 5,
        effective_from: "2026-05-01",
        effective_to: "2026-05-31",
        notes: "May promo target",
      }),
    ).resolves.toEqual({
      success: true,
      data: updatedRow,
    })

    expectAdsReportingRevalidated()
  })

  it.each([
    {
      name: "negative daily target units",
      payload: {
        daily_target_units: -2,
      },
      error: "Daily target units cannot be negative",
    },
    {
      name: "invalid date strings",
      payload: {
        effective_from: "2026-13-01",
      },
      error: "Effective from must be a valid date in YYYY-MM-DD format",
    },
    {
      name: "effective_to earlier than effective_from",
      payload: {
        effective_from: "2026-05-10",
        effective_to: "2026-05-09",
      },
      error: "Effective to cannot be earlier than effective from",
    },
  ])(
    "rejects SKU sales target updates with $name before writing to Supabase",
    async ({ payload, error }) => {
      vi.mocked(createClient).mockResolvedValue({
        from: vi.fn(),
      } as unknown as MockSupabaseClient)

      const { updateSkuSalesTarget } = await loadAdCampaignActions()

      await expect(updateSkuSalesTarget("target_1", payload)).resolves.toEqual({
        success: false,
        error,
      })

      expect(createClient).not.toHaveBeenCalled()
      expect(revalidatePath).not.toHaveBeenCalled()
    },
  )

  it.each([
    {
      name: "updateSkuAdSetup rejects an empty patch",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateSkuAdSetup("setup_1", {})
      },
      expectedError: "At least one setup field must be updated",
    },
    {
      name: "updateSkuAdSetup rejects undefined-only patches",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateSkuAdSetup("setup_1", {
          notes: undefined,
        })
      },
      expectedError: "At least one setup field must be updated",
    },
    {
      name: "updateMonthlyAdSpend rejects an empty patch",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateMonthlyAdSpend("spend_1", {})
      },
      expectedError: "At least one spend field must be updated",
    },
    {
      name: "updateMonthlyAdSpend rejects undefined-only patches",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateMonthlyAdSpend("spend_1", {
          month: undefined,
        })
      },
      expectedError: "At least one spend field must be updated",
    },
    {
      name: "updateSkuSalesTarget rejects an empty patch",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateSkuSalesTarget("target_1", {})
      },
      expectedError: "At least one target field must be updated",
    },
    {
      name: "updateSkuSalesTarget rejects undefined-only patches",
      run: async (actions: Awaited<ReturnType<typeof loadAdCampaignActions>>) => {
        return actions.updateSkuSalesTarget("target_1", {
          effective_to: undefined,
        })
      },
      expectedError: "At least one target field must be updated",
    },
  ])("$name", async ({ run, expectedError }) => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn(),
    } as unknown as MockSupabaseClient)

    const actions = await loadAdCampaignActions()

    await expect(run(actions)).resolves.toEqual({
      success: false,
      error: expectedError,
    })

    expect(createClient).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a partial SKU sales target effective_to earlier than the persisted effective_from", async () => {
    const existingRow = {
      id: "target_1",
      effective_from: "2026-05-10",
      effective_to: null,
    }

    const selectSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectEq = vi.fn(() => ({
      single: selectSingle,
    }))
    const update = vi.fn(() => {
      throw new Error("update should not be reached")
    })

    mockSupabaseTables({
      sku_sales_targets: {
        select: vi.fn(() => ({
          eq: selectEq,
        })),
        update,
      },
    })

    const { updateSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      updateSkuSalesTarget("target_1", {
        effective_to: "2026-05-09",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Effective to cannot be earlier than effective from",
    })

    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("rejects a partial SKU sales target effective_from later than the persisted effective_to", async () => {
    const existingRow = {
      id: "target_1",
      effective_from: "2026-05-01",
      effective_to: "2026-05-15",
    }

    const selectSingle = vi.fn(async () => ({
      data: existingRow,
      error: null,
    }))
    const selectEq = vi.fn(() => ({
      single: selectSingle,
    }))
    const update = vi.fn(() => {
      throw new Error("update should not be reached")
    })

    mockSupabaseTables({
      sku_sales_targets: {
        select: vi.fn(() => ({
          eq: selectEq,
        })),
        update,
      },
    })

    const { updateSkuSalesTarget } = await loadAdCampaignActions()

    await expect(
      updateSkuSalesTarget("target_1", {
        effective_from: "2026-05-16",
      }),
    ).resolves.toEqual({
      success: false,
      error: "Effective to cannot be earlier than effective from",
    })

    expect(update).not.toHaveBeenCalled()
    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("deletes SKU sales targets by id and revalidates reporting", async () => {
    const tableBuilder = {
      delete: vi.fn(() => ({
        eq: vi.fn(async (column: string, value: string) => {
          expect(column).toBe("id")
          expect(value).toBe("target_1")

          return {
            error: null,
          }
        }),
      })),
    }

    mockSupabaseTables({
      sku_sales_targets: tableBuilder,
    })

    const { deleteSkuSalesTarget } = await loadAdCampaignActions()

    await expect(deleteSkuSalesTarget("target_1")).resolves.toEqual({
      success: true,
    })

    expectAdsReportingRevalidated()
  })

  it("returns a structured error without revalidating when a setup update fails", async () => {
    const tableBuilder = {
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: null,
              error: {
                message: "setup update failed",
              },
            })),
          })),
        })),
      })),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { updateSkuAdSetup } = await loadAdCampaignActions()

    await expect(
      updateSkuAdSetup("setup_1", {
        notes: "Broken",
      }),
    ).resolves.toEqual({
      success: false,
      error: "setup update failed",
    })

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns a structured error without revalidating when pausing a setup fails", async () => {
    const existingRow = {
      id: "setup_1",
      start_date: "2026-04-01",
      end_date: null,
      status: "active",
    }
    const tableBuilder = {
      select: vi.fn((columns?: string) => {
        expect(columns).toBe("start_date, end_date, status")

        return {
          eq: vi.fn(() => ({
            single: vi.fn(async () => ({
              data: existingRow,
              error: null,
            })),
          })),
        }
      }),
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          status: "paused",
        })

        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: {
                  message: "pause failed",
                },
              })),
            })),
          })),
        }
      }),
    }

    mockSupabaseTables({
      sku_ad_setups: tableBuilder,
    })

    const { pauseSkuAdSetup } = await loadAdCampaignActions()

    await expect(pauseSkuAdSetup("setup_1")).resolves.toEqual({
      success: false,
      error: "pause failed",
    })

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns a structured error without revalidating when monthly ad spend update fails", async () => {
    const tableBuilder = {
      update: vi.fn((payload: unknown) => {
        expect(payload).toEqual({
          month: "2026-04-01",
          actual_spend: 410_000,
        })

        return {
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: null,
                error: {
                  message: "monthly spend update failed",
                },
              })),
            })),
          })),
        }
      }),
    }

    mockSupabaseTables({
      monthly_ad_spend: tableBuilder,
    })

    const { updateMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(
      updateMonthlyAdSpend("spend_1", {
        month: "2026-04-23",
        actual_spend: 410_000,
      }),
    ).resolves.toEqual({
      success: false,
      error: "monthly spend update failed",
    })

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("returns a structured error without revalidating when deleting monthly ad spend fails", async () => {
    const tableBuilder = {
      delete: vi.fn(() => ({
        eq: vi.fn(async () => ({
          error: {
            message: "monthly spend delete failed",
          },
        })),
      })),
    }

    mockSupabaseTables({
      monthly_ad_spend: tableBuilder,
    })

    const { deleteMonthlyAdSpend } = await loadAdCampaignActions()

    await expect(deleteMonthlyAdSpend("spend_1")).resolves.toEqual({
      success: false,
      error: "monthly spend delete failed",
    })

    expect(revalidatePath).not.toHaveBeenCalled()
  })

  it("renders the setup form contract for create and edit modes", async () => {
    const [{ SetupForm }] = await loadAdCampaignForms()
    const initialRecord: SkuAdSetup = {
      id: "setup_1",
      sku: "LUMI",
      channel: "shopee",
      objective: "Scale bestseller",
      daily_budget_cap: 250000,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
      status: "active",
      notes: "Keep budget tight on weekdays",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-10T00:00:00.000Z",
    }

    const createMarkup = renderToStaticMarkup(
      createElement(SetupForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )
    const editMarkup = renderToStaticMarkup(
      createElement(SetupForm, {
        mode: "edit",
        products: sampleProducts,
        initialRecord,
      }),
    )

    expect(createMarkup).toContain('href="/ad-campaigns"')
    expect(createMarkup).not.toContain("<a href=\"/ad-campaigns\"><button")
    expect(createMarkup).toContain("New SKU Ad Setup")
    expect(createMarkup).toContain('name="objective"')
    expect(createMarkup).toContain('name="daily_budget_cap"')
    expect(createMarkup).toContain('name="start_date"')
    expect(createMarkup).toContain("Create Setup")
    expect(createMarkup).toContain("Lumi Candle")
    expect(createMarkup).toContain("Aura Spray")

    expect(editMarkup).toContain("Edit SKU Ad Setup")
    expect(editMarkup).toContain('value="Scale bestseller"')
    expect(editMarkup).toContain('value="250000"')
    expect(editMarkup).toContain('value="2026-04-30"')
    expect(editMarkup).toContain("Save Changes")
    expect(editMarkup).toContain("Keep budget tight on weekdays")
  })

  it("renders the spend form contract for create and edit modes", async () => {
    const [, { SpendForm }] = await loadAdCampaignForms()
    const initialRecord: MonthlyAdSpend = {
      id: "spend_1",
      month: "2026-04-01",
      sku: "AURA",
      channel: "tokopedia",
      actual_spend: 410000,
      notes: "Adjusted after reconciliation",
      finance_entry_id: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    }

    const createMarkup = renderToStaticMarkup(
      createElement(SpendForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )
    const editMarkup = renderToStaticMarkup(
      createElement(SpendForm, {
        mode: "edit",
        products: sampleProducts,
        initialRecord,
      }),
    )

    expect(createMarkup).toContain('href="/ad-campaigns"')
    expect(createMarkup).not.toContain("<a href=\"/ad-campaigns\"><button")
    expect(createMarkup).toContain("New Monthly Spend")
    expect(createMarkup).toContain('type="month"')
    expect(createMarkup).toContain('name="actual_spend"')
    expect(createMarkup).toContain("Create Spend Row")

    expect(editMarkup).toContain("Edit Monthly Spend")
    expect(editMarkup).toContain('value="2026-04"')
    expect(editMarkup).toContain('value="410000"')
    expect(editMarkup).toContain("Adjusted after reconciliation")
    expect(editMarkup).toContain("Save Changes")
  })

  it("renders the target form contract for create and edit modes", async () => {
    const [, , { TargetForm }] = await loadAdCampaignForms()
    const initialRecord: SkuSalesTarget = {
      id: "target_1",
      sku: "LUMI",
      daily_target_units: 12,
      effective_from: "2026-04-01",
      effective_to: "2026-04-30",
      notes: "Raise target during campaign",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
    }

    const createMarkup = renderToStaticMarkup(
      createElement(TargetForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )
    const editMarkup = renderToStaticMarkup(
      createElement(TargetForm, {
        mode: "edit",
        products: sampleProducts,
        initialRecord,
      }),
    )

    expect(createMarkup).toContain('href="/ad-campaigns"')
    expect(createMarkup).not.toContain("<a href=\"/ad-campaigns\"><button")
    expect(createMarkup).toContain("New SKU Sales Target")
    expect(createMarkup).toContain('name="daily_target_units"')
    expect(createMarkup).toContain('name="effective_from"')
    expect(createMarkup).toContain('name="effective_to"')
    expect(createMarkup).toContain("Create Target")

    expect(editMarkup).toContain("Edit SKU Sales Target")
    expect(editMarkup).toContain('value="12"')
    expect(editMarkup).toContain('value="2026-04-01"')
    expect(editMarkup).toContain('value="2026-04-30"')
    expect(editMarkup).toContain("Raise target during campaign")
    expect(editMarkup).toContain("Save Changes")
  })

  it("exports strict date and month validation helpers for the forms", async () => {
    const [setupModule, spendModule, targetModule] = await loadAdCampaignForms()

    expect(setupModule.isValidDateInput("2026-02-28")).toBe(true)
    expect(setupModule.isValidDateInput("2026-02-30")).toBe(false)

    expect(spendModule.isValidMonthInput("2026-04")).toBe(true)
    expect(spendModule.isValidMonthInput("2026-13")).toBe(false)

    expect(targetModule.isValidDateInput("2026-04-01")).toBe(true)
    expect(targetModule.isValidDateInput("2026-04-31")).toBe(false)
    expect(targetModule.isWholeUnitValue(12)).toBe(true)
    expect(targetModule.isWholeUnitValue(12.5)).toBe(false)
  })

  it("wires the dedicated create pages to the correct forms", async () => {
    const productActions = await loadProductActionMocks()
    vi.mocked(productActions.getProducts).mockResolvedValue(sampleProducts)

    const [
      { default: NewSetupPage },
      ,
      { default: NewSpendPage },
      ,
      { default: NewTargetPage },
    ] = await loadAdCampaignCrudPages()

    const setupMarkup = renderToStaticMarkup(await NewSetupPage())
    const spendMarkup = renderToStaticMarkup(await NewSpendPage())
    const targetMarkup = renderToStaticMarkup(await NewTargetPage())

    expect(productActions.getProducts).toHaveBeenCalledTimes(3)
    expect(setupMarkup).toContain("New SKU Ad Setup")
    expect(spendMarkup).toContain("New Monthly Spend")
    expect(targetMarkup).toContain("New SKU Sales Target")
  })

  it("wires the dedicated edit pages to the correct forms and loaded records", async () => {
    const productActions = await loadProductActionMocks()
    const adCampaignActions = await loadAdCampaignActionMocks()
    vi.mocked(productActions.getProducts).mockResolvedValue(sampleProducts)
    vi.mocked(adCampaignActions.getSkuAdSetupById).mockResolvedValue({
      id: "setup_1",
      sku: "LUMI",
      channel: "shopee",
      objective: "Scale bestseller",
      daily_budget_cap: 250000,
      start_date: "2026-04-01",
      end_date: "2026-04-30",
      status: "active",
      notes: "Keep budget tight on weekdays",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-10T00:00:00.000Z",
    })
    vi.mocked(adCampaignActions.getMonthlyAdSpendById).mockResolvedValue({
      id: "spend_1",
      month: "2026-04-01",
      sku: "AURA",
      channel: "tokopedia",
      actual_spend: 410000,
      notes: "Adjusted after reconciliation",
      finance_entry_id: null,
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-30T00:00:00.000Z",
    })
    vi.mocked(adCampaignActions.getSkuSalesTargetById).mockResolvedValue({
      id: "target_1",
      sku: "LUMI",
      daily_target_units: 12,
      effective_from: "2026-04-01",
      effective_to: "2026-04-30",
      notes: "Raise target during campaign",
      created_at: "2026-04-01T00:00:00.000Z",
      updated_at: "2026-04-05T00:00:00.000Z",
    })

    const [
      ,
      { default: EditSetupPage },
      ,
      { default: EditSpendPage },
      ,
      { default: EditTargetPage },
    ] = await loadAdCampaignCrudPages()

    const setupMarkup = renderToStaticMarkup(
      await EditSetupPage({ params: Promise.resolve({ id: "setup_1" }) }),
    )
    const spendMarkup = renderToStaticMarkup(
      await EditSpendPage({ params: Promise.resolve({ id: "spend_1" }) }),
    )
    const targetMarkup = renderToStaticMarkup(
      await EditTargetPage({ params: Promise.resolve({ id: "target_1" }) }),
    )

    expect(adCampaignActions.getSkuAdSetupById).toHaveBeenCalledWith("setup_1")
    expect(adCampaignActions.getMonthlyAdSpendById).toHaveBeenCalledWith("spend_1")
    expect(adCampaignActions.getSkuSalesTargetById).toHaveBeenCalledWith("target_1")
    expect(setupMarkup).toContain("Edit SKU Ad Setup")
    expect(setupMarkup).toContain('value="Scale bestseller"')
    expect(spendMarkup).toContain("Edit Monthly Spend")
    expect(spendMarkup).toContain('value="410000"')
    expect(targetMarkup).toContain("Edit SKU Sales Target")
    expect(targetMarkup).toContain('value="12"')
  })

  it("sends missing edit records to notFound for the dedicated CRUD pages", async () => {
    const productActions = await loadProductActionMocks()
    const adCampaignActions = await loadAdCampaignActionMocks()
    vi.mocked(productActions.getProducts).mockResolvedValue(sampleProducts)
    vi.mocked(adCampaignActions.getSkuAdSetupById).mockResolvedValue(null)
    vi.mocked(adCampaignActions.getMonthlyAdSpendById).mockResolvedValue(null)
    vi.mocked(adCampaignActions.getSkuSalesTargetById).mockResolvedValue(null)

    const [
      ,
      { default: EditSetupPage },
      ,
      { default: EditSpendPage },
      ,
      { default: EditTargetPage },
    ] = await loadAdCampaignCrudPages()

    await expect(
      EditSetupPage({ params: Promise.resolve({ id: "missing-setup" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      EditSpendPage({ params: Promise.resolve({ id: "missing-spend" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")
    await expect(
      EditTargetPage({ params: Promise.resolve({ id: "missing-target" }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND")

    expect(notFoundMock).toHaveBeenCalledTimes(3)
  })

  it("renders workspace CRUD navigation and row-level action controls", async () => {
    const { AdsSetupWorkspace } = await loadAdsWorkspace()

    const markup = renderToStaticMarkup(
      createElement(AdsSetupWorkspace, {
        products: sampleProducts,
        report: sampleMonthlyAdsReportBundle,
        selectedMonth: "2026-04-01",
        setups: {
          data: [
            {
              id: "setup_1",
              sku: "LUMI",
              channel: "shopee",
              objective: "Scale bestseller",
              daily_budget_cap: 250000,
              start_date: "2026-04-01",
              end_date: "2026-04-30",
              status: "active",
              notes: "Keep budget tight on weekdays",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-10T00:00:00.000Z",
            },
          ],
          load_error: null,
        },
        spendRows: {
          data: sampleMonthlyAdsReportBundle.monthlySpendRows,
          load_error: null,
        },
        targets: {
          data: [
            {
              id: "target_1",
              sku: "LUMI",
              daily_target_units: 12,
              effective_from: "2026-04-01",
              effective_to: "2026-04-30",
              notes: "Raise target during campaign",
              created_at: "2026-04-01T00:00:00.000Z",
              updated_at: "2026-04-05T00:00:00.000Z",
            },
          ],
          load_error: null,
        },
      }),
    )

    expect(markup).toContain('href="/ad-campaigns/setup/new"')
    expect(markup).toContain('href="/ad-campaigns/spend/new"')
    expect(markup).toContain('href="/ad-campaigns/targets/new"')
    expect(markup).toContain(">Edit<")
    expect(markup).toContain(">Pause<")
    expect(markup).toContain(">End<")
    expect(markup).toContain(">Delete<")
  })

  it("renders setup form field and form errors with accessible wiring", async () => {
    const { SetupForm } = await loadFormModuleWithState<{
      SetupForm: typeof import("../../components/ad-campaigns/setup-form").SetupForm
    }>("../../components/ad-campaigns/setup-form", [
      false,
      "Failed to save SKU ad setup.",
      {
        sku: "SKU is required.",
        channel: "Channel is required.",
      },
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ])

    const markup = renderToStaticMarkup(
      createElement(SetupForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain("Failed to save SKU ad setup.")
    expect(markup).toContain('id="sku-error"')
    expect(markup).toContain('aria-describedby="sku-error"')
    expect(markup).toContain('aria-invalid="true"')
    expect(markup).toContain("Select every sales channel covered by this shared ads setup.")
  })

  it("renders spend form field and form errors with accessible wiring", async () => {
    const { SpendForm } = await loadFormModuleWithState<{
      SpendForm: typeof import("../../components/ad-campaigns/spend-form").SpendForm
    }>("../../components/ad-campaigns/spend-form", [
      false,
      "Failed to save monthly spend.",
      {
        month: "Month is required.",
        actual_spend: "Actual spend is required.",
      },
      "",
      "",
      "",
      "",
      "",
    ])

    const markup = renderToStaticMarkup(
      createElement(SpendForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain("Failed to save monthly spend.")
    expect(markup).toContain('id="month-error"')
    expect(markup).toContain('aria-describedby="month-error"')
    expect(markup).toContain('id="actual-spend-error"')
    expect(markup).toContain('aria-describedby="actual-spend-error"')
  })

  it("renders target form field and form errors with accessible wiring", async () => {
    const { TargetForm } = await loadFormModuleWithState<{
      TargetForm: typeof import("../../components/ad-campaigns/target-form").TargetForm
    }>("../../components/ad-campaigns/target-form", [
      false,
      "Failed to save sales target.",
      {
        daily_target_units: "Daily target units must be a whole number.",
        effective_from: "Effective from is required.",
      },
      "",
      "",
      "",
      "",
      "",
    ])

    const markup = renderToStaticMarkup(
      createElement(TargetForm, {
        mode: "create",
        products: sampleProducts,
      }),
    )

    expect(markup).toContain('role="alert"')
    expect(markup).toContain("Failed to save sales target.")
    expect(markup).toContain('id="daily-target-units-error"')
    expect(markup).toContain('aria-describedby="daily-target-units-error"')
    expect(markup).toContain('id="effective-from-error"')
    expect(markup).toContain('aria-describedby="effective-from-error"')
  })
})
