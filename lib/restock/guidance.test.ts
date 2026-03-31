import { describe, expect, expectTypeOf, it } from "vitest"

import {
  averageLatestLeadTimes,
  buildLeadBufferLabel,
  buildReorderWindow,
} from "./guidance"
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
