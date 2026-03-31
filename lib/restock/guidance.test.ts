import { describe, expect, it } from "vitest"

import {
  averageLatestLeadTimes,
  buildLeadBufferLabel,
  buildReorderWindow,
} from "./guidance"

describe("averageLatestLeadTimes", () => {
  it("uses the latest 3 completed shipments for one sku and mode", () => {
    const result = averageLatestLeadTimes([
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
    ])

    expect(result).toBe(13)
  })

  it("returns null when no completed shipments exist", () => {
    const result = averageLatestLeadTimes([
      {
        sku: "Calmi-001",
        shipping_mode: "air",
        order_date: "2026-04-01",
        arrival_date: null,
      },
    ])

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
