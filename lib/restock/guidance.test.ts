import { describe, expect, expectTypeOf, it } from "vitest"

import {
  averageLatestLeadTimes,
  buildArrivalChangelogItems,
  buildLeadBufferLabel,
  buildReorderWindow,
  filterCompletedShipmentSamples,
} from "./guidance"
import { resolveRestockItemCosts } from "./item-costs"
import type { ShippingMode as ConfigShippingMode } from "./config"
import type {
  InventoryPurchaseBatch,
  RestockStatus,
  ShippingMode,
} from "@/lib/types/database.types"

describe("averageLatestLeadTimes", () => {
  it("uses the latest 3 completed shipments for the requested sku and mode", () => {
    const result = averageLatestLeadTimes({
      sku: "Calmi-001",
      shippingMode: "air",
      samples: [
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-01-01",
          arrival_date: "2026-01-10",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-02-01",
          arrival_date: "2026-02-13",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-03-01",
          arrival_date: "2026-03-14",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-04-01",
          arrival_date: "2026-04-16",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "sea",
          order_date: "2026-04-01",
          arrival_date: "2026-05-20",
        },
        {
          sku: "Lumi-001",
          shipping_mode: "air",
          order_date: "2026-04-01",
          arrival_date: "2026-04-04",
        },
      ],
    })

    expect(result).toBe(13)
  })

  it("skips invalid completed samples whose arrival date is before the order date", () => {
    const result = averageLatestLeadTimes({
      sku: "Calmi-001",
      shippingMode: "air",
      samples: [
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-01-01",
          arrival_date: "2026-01-10",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-02-01",
          arrival_date: "2026-01-29",
        },
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-03-01",
          arrival_date: "2026-03-14",
        },
      ],
    })

    expect(result).toBe(11)
  })

  it("returns null when no completed shipments exist", () => {
    const result = averageLatestLeadTimes({
      sku: "Calmi-001",
      shippingMode: "air",
      samples: [
        {
          sku: "Calmi-001",
          shipping_mode: "air",
          order_date: "2026-04-01",
          arrival_date: null,
        },
      ],
    })

    expect(result).toBeNull()
  })
})

describe("buildReorderWindow", () => {
  it("uses learned lead days when history exists", () => {
    const result = buildReorderWindow({
      avgDaily: 2.2,
      learnedLeadDays: 13,
      fallbackLeadMin: 7,
      fallbackLeadMax: 10,
      bufferDays: 7,
    })

    expect(result).toEqual({
      leadDays: 13,
      reorderMin: 44,
      reorderMax: 44,
      isFallback: false,
    })
  })

  it("uses fallback lead range when history is missing", () => {
    const result = buildReorderWindow({
      avgDaily: 2.2,
      learnedLeadDays: null,
      fallbackLeadMin: 7,
      fallbackLeadMax: 10,
      bufferDays: 7,
    })

    expect(result).toEqual({
      leadDays: null,
      reorderMin: 31,
      reorderMax: 38,
      isFallback: true,
    })
  })
})

describe("buildLeadBufferLabel", () => {
  it("renders learned and fallback labels differently", () => {
    expect(
      buildLeadBufferLabel({
        leadDays: 13,
        fallbackLeadMin: 7,
        fallbackLeadMax: 10,
        bufferDays: 7,
        isFallback: false,
      }),
    ).toBe("Lead 13d + Buffer 7d = 20d")

    expect(
      buildLeadBufferLabel({
        leadDays: null,
        fallbackLeadMin: 7,
        fallbackLeadMax: 10,
        bufferDays: 7,
        isFallback: true,
      }),
    ).toBe("Fallback 7-10d + Buffer 7d")
  })
})

describe("filterCompletedShipmentSamples", () => {
  it("ignores batches missing arrival date or shipping mode", () => {
    const result = filterCompletedShipmentSamples([
      {
        sku: "Calmi-001",
        shipping_mode: "air",
        order_date: "2026-04-01",
        arrival_date: "2026-04-12",
      },
      {
        sku: "Calmi-001",
        shipping_mode: null,
        order_date: "2026-04-02",
        arrival_date: "2026-04-14",
      },
      {
        sku: "Calmi-001",
        shipping_mode: "air",
        order_date: "2026-04-03",
        arrival_date: null,
      },
    ])

    expect(result).toEqual([
      {
        sku: "Calmi-001",
        shipping_mode: "air",
        order_date: "2026-04-01",
        arrival_date: "2026-04-12",
      },
    ])
  })
})

describe("buildArrivalChangelogItems", () => {
  it("includes order date, arrival date, lead days, mode, and quantities", () => {
    const result = buildArrivalChangelogItems({
      orderDate: "2026-04-01",
      arrivalDate: "2026-04-12",
      shippingMode: "air",
      items: [
        { sku: "Calmi-001", quantity: 300 },
        { sku: "Lumi-001", quantity: 100 },
      ],
    })

    expect(result.map((item) => item.field_name)).toEqual([
      "Shipping mode",
      "China order date",
      "Warehouse arrival date",
      "Actual lead days",
      "Received items",
    ])
  })
})

describe("resolveRestockItemCosts", () => {
  it("uses the product cost when unit cost is left blank", () => {
    const result = resolveRestockItemCosts({
      items: [
        { sku: "Calmi-001", quantity: 3, unit_cost: null },
      ],
      productCosts: new Map([["Calmi-001", 12000]]),
    })

    expect(result.missingCostSkus).toEqual([])
    expect(result.totalAmount).toBe(36000)
    expect(result.items).toEqual([
      {
        sku: "Calmi-001",
        quantity: 3,
        unit_cost: 12000,
        total_cost: 36000,
      },
    ])
  })

  it("treats zero unit cost like blank and falls back to the product cost", () => {
    const result = resolveRestockItemCosts({
      items: [
        { sku: "Calmi-001", quantity: 3, unit_cost: 0 },
      ],
      productCosts: new Map([["Calmi-001", 12000]]),
    })

    expect(result.missingCostSkus).toEqual([])
    expect(result.totalAmount).toBe(36000)
    expect(result.items[0]?.unit_cost).toBe(12000)
  })

  it("keeps the manual unit cost when one is provided", () => {
    const result = resolveRestockItemCosts({
      items: [
        { sku: "Calmi-001", quantity: 2, unit_cost: 15000 },
      ],
      productCosts: new Map([["Calmi-001", 12000]]),
    })

    expect(result.missingCostSkus).toEqual([])
    expect(result.totalAmount).toBe(30000)
    expect(result.items[0]?.unit_cost).toBe(15000)
    expect(result.items[0]?.total_cost).toBe(30000)
  })

  it("reports missing product costs when unit cost is blank and the sku has no default cost", () => {
    const result = resolveRestockItemCosts({
      items: [
        { sku: "Mystery-001", quantity: 1, unit_cost: null },
      ],
      productCosts: new Map(),
    })

    expect(result.items).toEqual([])
    expect(result.missingCostSkus).toEqual(["Mystery-001"])
    expect(result.totalAmount).toBe(0)
  })

  it("keeps a zero total when all resolved costs are zero", () => {
    const result = resolveRestockItemCosts({
      items: [
        { sku: "Calmi-001", quantity: 2, unit_cost: null },
      ],
      productCosts: new Map([["Calmi-001", 0]]),
    })

    expect(result.missingCostSkus).toEqual([])
    expect(result.totalAmount).toBe(0)
  })
})

describe("inventory purchase batch typing", () => {
  it("includes restock tracking fields", () => {
    const batch = {} as InventoryPurchaseBatch

    expectTypeOf<ShippingMode>().toEqualTypeOf<"air" | "sea">()
    expectTypeOf<ConfigShippingMode>().toEqualTypeOf<ShippingMode>()
    expectTypeOf<RestockStatus>().toEqualTypeOf<"in_transit" | "arrived">()
    expectTypeOf(batch.order_date).toEqualTypeOf<string>()
    expectTypeOf(batch.arrival_date).toEqualTypeOf<string | null>()
    expectTypeOf(batch.arrival_processed_at).toEqualTypeOf<string | null>()
    expectTypeOf(batch.restock_status).toEqualTypeOf<RestockStatus>()
    expectTypeOf(batch.shipping_mode).toEqualTypeOf<ShippingMode | null>()
  })
})

describe("restock action changelog behavior", () => {
  it("delegates restock creation to a database rpc for atomic writes", async () => {
    const fs = await import("node:fs/promises")
    const source = await fs.readFile("lib/actions/restock.ts", "utf8")
    const createSection = source.slice(
      source.indexOf("export async function createRestock"),
      source.indexOf("export async function markRestockArrived"),
    )

    expect(createSection).toContain("create_inventory_purchase_restock")
    expect(createSection).not.toContain('.from("finance_entries")')
    expect(createSection).not.toContain('.from("inventory_purchase_batch_items")')
  })

  it("delegates arrival changelog creation to the database rpc", async () => {
    const fs = await import("node:fs/promises")
    const source = await fs.readFile("lib/actions/restock.ts", "utf8")
    const createSection = source.slice(
      source.indexOf("export async function createRestock"),
      source.indexOf("export async function markRestockArrived"),
    )
    const arrivalSection = source.slice(
      source.indexOf("export async function markRestockArrived"),
    )

    expect(createSection).not.toContain("safeRecordAutomaticChangelogEntry(")
    expect(arrivalSection).not.toContain("safeRecordAutomaticChangelogEntry(")
    expect(arrivalSection).toContain("process_inventory_purchase_arrival")
  })

  it("stores the arrival changelog inside the arrival rpc migration", async () => {
    const fs = await import("node:fs/promises")
    const migration = await fs.readFile(
      "supabase/migrations/20260331_process_restock_arrival_with_changelog.sql",
      "utf8",
    )

    expect(migration).toContain("CREATE OR REPLACE FUNCTION process_inventory_purchase_arrival")
    expect(migration).toContain("Restock arrived from China")
    expect(migration).toContain("INSERT INTO changelog_entries")
    expect(migration).toContain("INSERT INTO changelog_items")
  })

  it("stores atomic restock creation inside its own rpc migration", async () => {
    const fs = await import("node:fs/promises")
    const migration = await fs.readFile(
      "supabase/migrations/20260331_create_restock_with_finance_entry.sql",
      "utf8",
    )

    expect(migration).toContain("CREATE OR REPLACE FUNCTION create_inventory_purchase_restock")
    expect(migration).toContain("INSERT INTO inventory_purchase_batches")
    expect(migration).toContain("INSERT INTO inventory_purchase_batch_items")
    expect(migration).toContain("INSERT INTO finance_entries")
    expect(migration).toContain("finance_entry_id")
  })

  it("rejects the legacy finance purchase path instead of guessing a shipping mode", async () => {
    const fs = await import("node:fs/promises")
    const financeSource = await fs.readFile("lib/actions/finance.ts", "utf8")
    const legacySection = financeSource.slice(
      financeSource.indexOf("export async function createInventoryPurchase"),
    )

    expect(legacySection).not.toContain('shipping_mode: "air"')
    expect(legacySection).toContain("Use the Restock tab")
  })
})

describe("restock route file contract", () => {
  it("expects the sidebar to link to /restock", async () => {
    const fs = await import("node:fs/promises")
    const sidebarSource = await fs.readFile("components/layout/sidebar.tsx", "utf8")

    expect(sidebarSource).toContain('href: "/restock"')
    expect(sidebarSource).toContain('name: "Restock"')
  })

  it("expects a dedicated restock route wired to RestockClient", async () => {
    const fs = await import("node:fs/promises")
    const pageSource = await fs.readFile("app/(dashboard)/restock/page.tsx", "utf8")

    expect(pageSource).toContain("RestockClient")
    expect(pageSource).toContain("getInventoryPurchaseBatches")
  })

  it("expects finance to hand off inventory purchases to the restock tab", async () => {
    const fs = await import("node:fs/promises")
    const financeSource = await fs.readFile("components/finance/finance-client.tsx", "utf8")

    expect(financeSource).toContain('href="/restock"')
    expect(financeSource).not.toContain("createInventoryPurchase")
    expect(financeSource).not.toContain("Record Inventory Purchase")
  })
})

describe("dashboard restock guidance integration", () => {
  it("expects reorder recommendations to use learned lead-time helpers", async () => {
    const fs = await import("node:fs/promises")
    const ordersSource = await fs.readFile("lib/actions/orders.ts", "utf8")
    const reorderSection = ordersSource.slice(
      ordersSource.indexOf("export async function getReorderRecommendations"),
      ordersSource.indexOf("/**", ordersSource.indexOf("export async function getReorderRecommendations")),
    )

    expect(reorderSection).toContain("RESTOCK_GUIDANCE_CONFIG")
    expect(reorderSection).toContain("averageLatestLeadTimes")
    expect(reorderSection).toContain("buildReorderWindow")
    expect(reorderSection).toContain("buildLeadBufferLabel")
  })

  it("expects the dashboard to render the computed lead-time label", async () => {
    const fs = await import("node:fs/promises")
    const dashboardSource = await fs.readFile("app/(dashboard)/dashboard/page.tsx", "utf8")

    expect(dashboardSource).toContain("rec.leadTimeLabel")
    expect(dashboardSource).not.toContain("rec.leadMin + rec.buffer")
  })
})
