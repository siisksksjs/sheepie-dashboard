import { readFile } from "node:fs/promises"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createClient } from "@/lib/supabase/server"
import { createLedgerEntry } from "../actions/inventory"
import {
  calculateOrderSettlementAmount,
  createMarketplaceSettlementEntry,
  isSettledOrderStatus,
} from "@/lib/marketplace-settlements"

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}))

vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react")

  return {
    ...actual,
    cache: <T>(value: T) => value,
  }
})

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(),
}))

vi.mock("../actions/inventory", () => ({
  createLedgerEntry: vi.fn(),
}))

vi.mock("@/lib/line-item-costs", () => ({
  getLineItemCostPerUnit: vi.fn(),
  getLineItemTotalCost: vi.fn(),
}))

vi.mock("../actions/changelog", () => ({
  safeRecordAutomaticChangelogEntry: vi.fn(),
}))

vi.mock("@/lib/changelog", () => ({
  buildChangeItem: vi.fn(),
  summarizeLineItems: vi.fn(),
}))

vi.mock("@/lib/restock/config", () => ({
  RESTOCK_GUIDANCE_CONFIG: {},
}))

vi.mock("@/lib/restock/guidance", () => ({
  averageLatestLeadTimes: vi.fn(),
  buildLeadBufferLabel: vi.fn(),
  buildReorderWindow: vi.fn(),
}))

vi.mock("@/lib/marketplace-settlements", () => ({
  calculateOrderSettlementAmount: vi.fn(),
  createMarketplaceSettlementEntry: vi.fn(),
  createMarketplaceSettlementReversalEntry: vi.fn(),
  isSettledOrderStatus: vi.fn(() => false),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(isSettledOrderStatus).mockReturnValue(false)
})

afterEach(() => {
  vi.useRealTimers()
})

describe("buildDuplicateOrderInput", () => {
  it("forces today's date and paid status while copying sales fields", async () => {
    const { buildDuplicateOrderInput } = await import("../actions/orders")

    const result = await buildDuplicateOrderInput({
      sourceOrder: {
        id: "ord_1",
        order_id: "SHOPE-20260330-001",
        channel: "shopee",
        order_date: "2026-03-30",
        status: "returned",
        channel_fees: 12000,
        notes: "repeat buyer",
        created_at: "2026-03-30T01:00:00.000Z",
        updated_at: "2026-03-30T01:00:00.000Z",
      },
      sourceLineItems: [
        {
          id: "line_1",
          order_id: "ord_1",
          sku: "Calmi-001",
          quantity: 2,
          selling_price: 75000,
          cost_per_unit_snapshot: 12000,
          created_at: "2026-03-30T01:00:00.000Z",
        },
      ],
      nextOrderId: "SHOPE-20260401-002",
      today: "2026-04-01",
    })

    expect(result).toEqual({
      order_id: "SHOPE-20260401-002",
      channel: "shopee",
      order_date: "2026-04-01",
      status: "paid",
      channel_fees: 12000,
      notes: "repeat buyer",
      line_items: [
        {
          sku: "Calmi-001",
          quantity: 2,
          selling_price: 75000,
        },
      ],
    })
  })
})

describe("duplicate order source contract", () => {
  it("expects orders action to export duplicateOrder and reference duplicate-order helpers", async () => {
    const source = await readFile("lib/actions/orders.ts", "utf8")

    expect(source).toMatch(/export\s+async\s+function\s+duplicateOrder\s*\(\s*orderId\s*:\s*string\s*\)/)
    expect(source).toMatch(/export\s+async\s+function\s+duplicateOrder[\s\S]*?\bgenerateNextOrderId\s*\(/)
    expect(source).toMatch(/export\s+async\s+function\s+buildDuplicateOrderInput\s*\([^)]*\)\s*(?::\s*[^{]+)?\{[\s\S]*?status\s*:\s*"paid"/)
    expect(source).toMatch(/export\s+async\s+function\s+duplicateOrder[\s\S]*?\bawait\s+buildDuplicateOrderInput\s*\(/)
    expect(source).toMatch(/export\s+async\s+function\s+duplicateOrder[\s\S]*?Order not found/)
    expect(source).toMatch(/export\s+async\s+function\s+duplicateOrder[\s\S]*?Source order has no line items/)
  })
})

describe("orders page duplicate UI contract", () => {
  it("expects the orders page to expose Duplicate and wire duplicateOrder from the list page", async () => {
    const source = await readFile("app/(dashboard)/orders/page.tsx", "utf8")

    expect(source).toContain("Duplicate")
    expect(source).toContain("duplicateOrder(")
  })
})

describe("orders list client duplicate UI contract", () => {
  it("expects the client component to expose Duplicate and call the duplicate handler via onDuplicate", async () => {
    const source = await readFile("components/orders/orders-list-client.tsx", "utf8")

    expect(source).toContain("handleDuplicate")
    expect(source).toContain("duplicateLabel")
    expect(source).toContain("onDuplicate(orderId)")
    expect(source).toMatch(/onClick=\{\(\)\s*=>\s*handleDuplicate\(order\.id\)\}/)
    expect(source).toMatch(/try\s*\{[\s\S]*onDuplicate\(orderId\)/)
    expect(source).toMatch(/catch\s*\(\s*error\s*\)/)
    expect(source).toMatch(/finally\s*\{[\s\S]*setPendingOrderId\(null\)/)
  })
})

describe("order detail duplicate UI contract", () => {
  it("expects the order detail page to expose Duplicate Order and wire duplicateOrder from the detail page", async () => {
    const source = await readFile("components/orders/order-detail-client.tsx", "utf8")

    expect(source).toContain("Duplicate Order")
    expect(source).toContain("duplicateOrder(")
    expect(source).toMatch(/if\s*\(\s*duplicating\s*\)\s*\{\s*return\s*\}/)
    expect(source).toMatch(/try\s*\{[\s\S]*duplicateOrder\(order\.id\)/)
    expect(source).toMatch(/catch\s*\(\s*error\s*\)/)
    expect(source).toMatch(/finally\s*\{[\s\S]*setDuplicating\(false\)/)
    expect(source).toContain("<Button asChild")
  })
})

describe("duplicateOrder", () => {
  it("returns an error when the source order does not exist", async () => {
    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({
        data: null,
        error: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" },
      })),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return ordersSingleBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("missing_order")).resolves.toEqual({
      success: false,
      error: "Order not found",
    })
  })

  it("returns a backend error when loading the source order fails", async () => {
    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({
        data: null,
        error: { message: "database offline" },
      })),
    }

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return ordersSingleBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "database offline",
    })
  })

  it("returns an error when the source order has no line items", async () => {
    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({
        data: {
          id: "ord_source",
          order_id: "SHOPE-20260401-009",
          channel: "shopee",
          order_date: "2026-04-01",
          status: "returned",
          channel_fees: 15000,
          notes: "duplicate me",
          created_at: "2026-04-01T08:00:00.000Z",
          updated_at: "2026-04-01T08:00:00.000Z",
        },
        error: null,
      })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({ data: [], error: null })),
    }

    const orderLineItemsBuilders = [orderLineItemsQueryBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          return ordersSingleBuilder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "Source order has no line items",
    })
  })

  it("uses the Jakarta business date and returns only the new order identity", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))

    const sourceOrder = {
      id: "ord_source",
      order_id: "SHOPE-20260401-009",
      channel: "shopee" as const,
      order_date: "2026-04-01",
      status: "returned" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    }

    const sourceLineItems = [
      {
        id: "line_1",
        order_id: "ord_source",
        sku: "Calmi-001",
        quantity: 2,
        selling_price: 75000,
        cost_per_unit_snapshot: 12000,
        created_at: "2026-04-01T08:00:00.000Z",
      },
    ]

    const createdOrder = {
      id: "ord_new",
      order_id: "SHOPE-20260402-001",
      channel: "shopee" as const,
      order_date: "2026-04-02",
      status: "paid" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T17:30:00.000Z",
      updated_at: "2026-04-01T17:30:00.000Z",
    }

    let insertedOrderPayload:
      | {
          order_id: string
          channel: "shopee"
          order_date: string
          status: "paid"
          channel_fees: number | null
          notes: string | null
        }[]
      | undefined

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({ data: sourceOrder, error: null })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }

    const createOrderBuilder = {
      insert: vi.fn((payload) => {
        insertedOrderPayload = payload

        return {
          select: () => ({
            single: async () => ({ data: createdOrder, error: null }),
          }),
        }
      }),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({ data: sourceLineItems, error: null })),
    }

    const orderLineItemsInsertBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    }

    const productsBuilder = {
      select: vi.fn(() => productsBuilder),
      in: vi.fn(async () => ({
        data: [{ sku: "Calmi-001", cost_per_unit: 12000 }],
        error: null,
      })),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder, createOrderBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder, orderLineItemsInsertBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        if (table === "products") {
          return productsBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")
    const result = await duplicateOrder("ord_source")

    expect(result).toEqual({
      success: true,
      data: {
        id: "ord_new",
        order_id: "SHOPE-20260402-001",
      },
    })

    expect(insertedOrderPayload).toEqual([
      expect.objectContaining({
        order_id: "SHOPE-20260402-001",
        order_date: "2026-04-02",
        status: "paid",
      }),
    ])
  })

  it("returns a structured error when next order id generation fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({
        data: {
          id: "ord_source",
          order_id: "SHOPE-20260401-009",
          channel: "shopee",
          order_date: "2026-04-01",
          status: "returned",
          channel_fees: 15000,
          notes: "duplicate me",
          created_at: "2026-04-01T08:00:00.000Z",
          updated_at: "2026-04-01T08:00:00.000Z",
        },
        error: null,
      })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: null, error: { message: "lookup failed" } })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({
        data: [
          {
            id: "line_1",
            order_id: "ord_source",
            sku: "Calmi-001",
            quantity: 2,
            selling_price: 75000,
            cost_per_unit_snapshot: 12000,
            created_at: "2026-04-01T08:00:00.000Z",
          },
        ],
        error: null,
      })),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "lookup failed",
    })
  })

  it("still runs the normal paid-order side effects for settled duplicates", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))
    vi.mocked(isSettledOrderStatus).mockReturnValue(true)
    vi.mocked(createLedgerEntry).mockResolvedValue({
      success: true,
    } as any)
    vi.mocked(calculateOrderSettlementAmount).mockReturnValue(135000)
    vi.mocked(createMarketplaceSettlementEntry).mockResolvedValue({
      success: true,
    } as any)

    const sourceOrder = {
      id: "ord_source",
      order_id: "SHOPE-20260401-009",
      channel: "shopee" as const,
      order_date: "2026-04-01",
      status: "returned" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    }

    const sourceLineItems = [
      {
        id: "line_1",
        order_id: "ord_source",
        sku: "Calmi-001",
        quantity: 2,
        selling_price: 75000,
        cost_per_unit_snapshot: 12000,
        created_at: "2026-04-01T08:00:00.000Z",
      },
    ]

    const createdOrder = {
      id: "ord_new",
      order_id: "SHOPE-20260402-001",
      channel: "shopee" as const,
      order_date: "2026-04-02",
      status: "paid" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T17:30:00.000Z",
      updated_at: "2026-04-01T17:30:00.000Z",
    }

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({ data: sourceOrder, error: null })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }

    const createOrderBuilder = {
      insert: vi.fn(() => ({
        select: () => ({
          single: async () => ({ data: createdOrder, error: null }),
        }),
      })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({ data: sourceLineItems, error: null })),
    }

    const orderLineItemsInsertBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    }

    const productCostLookupBuilder = {
      select: vi.fn(() => productCostLookupBuilder),
      in: vi.fn(async () => ({
        data: [{ sku: "Calmi-001", cost_per_unit: 12000 }],
        error: null,
      })),
    }

    const settledProductBuilder = {
      select: vi.fn(() => settledProductBuilder),
      eq: vi.fn(() => settledProductBuilder),
      single: vi.fn(async () => ({ data: { is_bundle: false }, error: null })),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder, createOrderBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder, orderLineItemsInsertBuilder]
    const productBuilders = [productCostLookupBuilder, settledProductBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        if (table === "products") {
          const builder = productBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected products builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")
    const result = await duplicateOrder("ord_source")

    expect(result).toEqual({
      success: true,
      data: {
        id: "ord_new",
        order_id: "SHOPE-20260402-001",
      },
    })

    expect(createLedgerEntry).toHaveBeenCalledWith({
      sku: "Calmi-001",
      movement_type: "OUT_SALE",
      quantity: -2,
      reference: "Order SHOPE-20260402-001",
    }, {
      skipChangelog: true,
    })

    expect(createMarketplaceSettlementEntry).toHaveBeenCalled()
  })

  it("returns a failure when a settled duplicate ledger write fails", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))
    vi.mocked(isSettledOrderStatus).mockReturnValue(true)
    vi.mocked(createLedgerEntry)
      .mockResolvedValueOnce({
        success: true,
      } as any)
      .mockResolvedValueOnce({
        success: false,
        error: "ledger failed",
      } as any)
      .mockResolvedValueOnce({
        success: true,
      } as any)

    const sourceOrder = {
      id: "ord_source",
      order_id: "SHOPE-20260401-009",
      channel: "shopee" as const,
      order_date: "2026-04-01",
      status: "returned" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    }

    const sourceLineItems = [
      {
        id: "line_1",
        order_id: "ord_source",
        sku: "Calmi-001",
        quantity: 2,
        selling_price: 75000,
        cost_per_unit_snapshot: 12000,
        created_at: "2026-04-01T08:00:00.000Z",
      },
      {
        id: "line_2",
        order_id: "ord_source",
        sku: "Lumi-001",
        quantity: 1,
        selling_price: 65000,
        cost_per_unit_snapshot: 10000,
        created_at: "2026-04-01T08:00:00.000Z",
      },
    ]

    const createdOrder = {
      id: "ord_new",
      order_id: "SHOPE-20260402-001",
      channel: "shopee" as const,
      order_date: "2026-04-02",
      status: "paid" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T17:30:00.000Z",
      updated_at: "2026-04-01T17:30:00.000Z",
    }

    const deleteEq = vi.fn(async () => ({ error: null }))

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({ data: sourceOrder, error: null })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }

    const createOrderBuilder = {
      insert: vi.fn(() => ({
        select: () => ({
          single: async () => ({ data: createdOrder, error: null }),
        }),
      })),
    }

    const deleteOrderBuilder = {
      delete: vi.fn(() => ({
        eq: deleteEq,
      })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({ data: sourceLineItems, error: null })),
    }

    const orderLineItemsInsertBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    }

    const productCostLookupBuilder = {
      select: vi.fn(() => productCostLookupBuilder),
      in: vi.fn(async () => ({
        data: [
          { sku: "Calmi-001", cost_per_unit: 12000 },
          { sku: "Lumi-001", cost_per_unit: 10000 },
        ],
        error: null,
      })),
    }

    const settledProductBuilderOne = {
      select: vi.fn(() => settledProductBuilderOne),
      eq: vi.fn(() => settledProductBuilderOne),
      single: vi.fn(async () => ({ data: { is_bundle: false }, error: null })),
    }

    const settledProductBuilderTwo = {
      select: vi.fn(() => settledProductBuilderTwo),
      eq: vi.fn(() => settledProductBuilderTwo),
      single: vi.fn(async () => ({ data: { is_bundle: false }, error: null })),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder, createOrderBuilder, deleteOrderBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder, orderLineItemsInsertBuilder]
    const productBuilders = [productCostLookupBuilder, settledProductBuilderOne, settledProductBuilderTwo]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        if (table === "products") {
          const builder = productBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected products builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "ledger failed",
    })

    expect(deleteEq).toHaveBeenCalledWith("id", "ord_new")
    expect(createLedgerEntry).toHaveBeenCalledWith({
      sku: "Calmi-001",
      movement_type: "RETURN",
      quantity: 2,
      reference: "Order SHOPE-20260402-001 - Rollback",
    }, {
      skipChangelog: true,
    })
  })

  it("returns a failure when settlement creation fails after settled duplicate stock deductions", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))
    vi.mocked(isSettledOrderStatus).mockReturnValue(true)
    vi.mocked(createLedgerEntry)
      .mockResolvedValueOnce({
        success: true,
      } as any)
      .mockResolvedValueOnce({
        success: true,
      } as any)
    vi.mocked(calculateOrderSettlementAmount).mockReturnValue(135000)
    vi.mocked(createMarketplaceSettlementEntry).mockResolvedValue({
      success: false,
      error: "settlement failed",
    } as any)

    const sourceOrder = {
      id: "ord_source",
      order_id: "SHOPE-20260401-009",
      channel: "shopee" as const,
      order_date: "2026-04-01",
      status: "returned" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T08:00:00.000Z",
      updated_at: "2026-04-01T08:00:00.000Z",
    }

    const sourceLineItems = [
      {
        id: "line_1",
        order_id: "ord_source",
        sku: "Calmi-001",
        quantity: 2,
        selling_price: 75000,
        cost_per_unit_snapshot: 12000,
        created_at: "2026-04-01T08:00:00.000Z",
      },
    ]

    const createdOrder = {
      id: "ord_new",
      order_id: "SHOPE-20260402-001",
      channel: "shopee" as const,
      order_date: "2026-04-02",
      status: "paid" as const,
      channel_fees: 15000,
      notes: "duplicate me",
      created_at: "2026-04-01T17:30:00.000Z",
      updated_at: "2026-04-01T17:30:00.000Z",
    }

    const deleteEq = vi.fn(async () => ({ error: null }))

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({ data: sourceOrder, error: null })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }

    const createOrderBuilder = {
      insert: vi.fn(() => ({
        select: () => ({
          single: async () => ({ data: createdOrder, error: null }),
        }),
      })),
    }

    const deleteOrderBuilder = {
      delete: vi.fn(() => ({
        eq: deleteEq,
      })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({ data: sourceLineItems, error: null })),
    }

    const orderLineItemsInsertBuilder = {
      insert: vi.fn(async () => ({ error: null })),
    }

    const productCostLookupBuilder = {
      select: vi.fn(() => productCostLookupBuilder),
      in: vi.fn(async () => ({
        data: [{ sku: "Calmi-001", cost_per_unit: 12000 }],
        error: null,
      })),
    }

    const settledProductBuilder = {
      select: vi.fn(() => settledProductBuilder),
      eq: vi.fn(() => settledProductBuilder),
      single: vi.fn(async () => ({ data: { is_bundle: false }, error: null })),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder, createOrderBuilder, deleteOrderBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder, orderLineItemsInsertBuilder]
    const productBuilders = [productCostLookupBuilder, settledProductBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        if (table === "products") {
          const builder = productBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected products builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "settlement failed",
    })

    expect(deleteEq).toHaveBeenCalledWith("id", "ord_new")
    expect(createLedgerEntry).toHaveBeenCalledWith({
      sku: "Calmi-001",
      movement_type: "RETURN",
      quantity: 2,
      reference: "Order SHOPE-20260402-001 - Rollback",
    }, {
      skipChangelog: true,
    })
  })

  it("returns a structured failure if the create step throws unexpectedly", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-04-01T17:30:00.000Z"))

    const ordersSingleBuilder = {
      select: vi.fn(() => ordersSingleBuilder),
      eq: vi.fn(() => ordersSingleBuilder),
      single: vi.fn(async () => ({
        data: {
          id: "ord_source",
          order_id: "SHOPE-20260401-009",
          channel: "shopee",
          order_date: "2026-04-01",
          status: "returned",
          channel_fees: 15000,
          notes: "duplicate me",
          created_at: "2026-04-01T08:00:00.000Z",
          updated_at: "2026-04-01T08:00:00.000Z",
        },
        error: null,
      })),
    }

    const nextOrderIdBuilder = {
      select: vi.fn(() => nextOrderIdBuilder),
      like: vi.fn(() => nextOrderIdBuilder),
      order: vi.fn(() => nextOrderIdBuilder),
      limit: vi.fn(async () => ({ data: [], error: null })),
    }

    const orderLineItemsQueryBuilder = {
      select: vi.fn(() => orderLineItemsQueryBuilder),
      eq: vi.fn(async () => ({
        data: [
          {
            id: "line_1",
            order_id: "ord_source",
            sku: "Calmi-001",
            quantity: 2,
            selling_price: 75000,
            cost_per_unit_snapshot: 12000,
            created_at: "2026-04-01T08:00:00.000Z",
          },
        ],
        error: null,
      })),
    }

    const productsBuilder = {
      select: vi.fn(() => productsBuilder),
      in: vi.fn(() => {
        throw new Error("create exploded")
      }),
    }

    const ordersBuilders = [ordersSingleBuilder, nextOrderIdBuilder]
    const orderLineItemsBuilders = [orderLineItemsQueryBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        if (table === "products") {
          return productsBuilder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { duplicateOrder } = await import("../actions/orders")

    await expect(duplicateOrder("ord_source")).resolves.toEqual({
      success: false,
      error: "create exploded",
    })
  })
})

describe("createOrder", () => {
  it("preserves the normal non-settled order creation workflow after the refactor", async () => {
    const formData = {
      order_id: "SHOPE-20260402-001",
      channel: "shopee" as const,
      order_date: "2026-04-02",
      status: "returned" as const,
      channel_fees: 15000,
      notes: "manual order",
      line_items: [
        {
          sku: "Calmi-001",
          quantity: 2,
          selling_price: 75000,
        },
      ],
    }

    const createdOrder = {
      id: "ord_new",
      order_id: formData.order_id,
      channel: formData.channel,
      order_date: formData.order_date,
      status: formData.status,
      channel_fees: formData.channel_fees,
      notes: formData.notes,
      created_at: "2026-04-02T09:00:00.000Z",
      updated_at: "2026-04-02T09:00:00.000Z",
    }

    let insertedOrderPayload:
      | {
          order_id: string
          channel: "shopee"
          order_date: string
          status: "returned"
          channel_fees: number | null
          notes: string | null
        }[]
      | undefined

    let insertedLineItemsPayload:
      | Array<{
          order_id: string
          sku: string
          quantity: number
          selling_price: number
          cost_per_unit_snapshot: number
        }>
      | undefined

    const productsBuilder = {
      select: vi.fn(() => productsBuilder),
      in: vi.fn(async () => ({
        data: [{ sku: "Calmi-001", cost_per_unit: 12000 }],
        error: null,
      })),
    }

    const createOrderBuilder = {
      insert: vi.fn((payload) => {
        insertedOrderPayload = payload

        return {
          select: () => ({
            single: async () => ({ data: createdOrder, error: null }),
          }),
        }
      }),
    }

    const orderLineItemsInsertBuilder = {
      insert: vi.fn(async (payload) => {
        insertedLineItemsPayload = payload
        return { error: null }
      }),
    }

    const ordersBuilders = [createOrderBuilder]
    const orderLineItemsBuilders = [orderLineItemsInsertBuilder]

    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === "products") {
          return productsBuilder
        }

        if (table === "orders") {
          const builder = ordersBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected orders builder request")
          }

          return builder
        }

        if (table === "order_line_items") {
          const builder = orderLineItemsBuilders.shift()
          if (!builder) {
            throw new Error("Unexpected order_line_items builder request")
          }

          return builder
        }

        throw new Error(`Unexpected table: ${table}`)
      }),
    } as any)

    const { createOrder } = await import("../actions/orders")
    const result = await createOrder(formData)

    expect(result).toEqual({
      success: true,
      data: createdOrder,
    })

    expect(insertedOrderPayload).toEqual([
      {
        order_id: formData.order_id,
        channel: formData.channel,
        order_date: formData.order_date,
        status: formData.status,
        channel_fees: formData.channel_fees,
        notes: formData.notes,
      },
    ])

    expect(insertedLineItemsPayload).toEqual([
      {
        order_id: "ord_new",
        sku: "Calmi-001",
        quantity: 2,
        selling_price: 75000,
        cost_per_unit_snapshot: 12000,
      },
    ])
  })
})
