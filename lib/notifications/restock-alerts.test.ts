import { describe, expect, it } from "vitest"

import {
  RESTOCK_ALERT_ROUTES,
  buildRestockAlertRouteKey,
  didCrossReorderThreshold,
  getConservativeReorderThreshold,
  getRestockAlertRoutesForSku,
} from "./restock-alerts"

describe("restock alert routes", () => {
  it("limits notification scope to the requested SKU/mode routes", () => {
    expect(RESTOCK_ALERT_ROUTES).toEqual([
      { sku: "Cervi-001", mode: "sea" },
      { sku: "Lumi-001", mode: "air" },
      { sku: "Lumi-001", mode: "sea" },
      { sku: "Calmi-001", mode: "air" },
      { sku: "Calmi-001", mode: "sea" },
    ])
    expect(getRestockAlertRoutesForSku("Cervi-001").map((route) => route.mode)).toEqual(["sea"])
    expect(getRestockAlertRoutesForSku("Lumi-001").map((route) => route.mode)).toEqual(["air", "sea"])
    expect(getRestockAlertRoutesForSku("Calmi-001").map((route) => route.mode)).toEqual(["air", "sea"])
    expect(getRestockAlertRoutesForSku("Cervi-002")).toEqual([])
  })

  it("builds stable route keys", () => {
    expect(buildRestockAlertRouteKey("Lumi-001", "sea")).toBe("Lumi-001:sea")
  })
})

describe("getConservativeReorderThreshold", () => {
  it("uses reorderMax for fallback ranges", () => {
    expect(getConservativeReorderThreshold({ reorderMin: 31, reorderMax: 38 })).toBe(38)
  })

  it("uses the learned single threshold when min and max match", () => {
    expect(getConservativeReorderThreshold({ reorderMin: 44, reorderMax: 44 })).toBe(44)
  })
})

describe("didCrossReorderThreshold", () => {
  it("fires only when stock crosses from above to at or below threshold", () => {
    expect(didCrossReorderThreshold({ previousStock: 41, currentStock: 40, threshold: 40 })).toBe(true)
    expect(didCrossReorderThreshold({ previousStock: 40, currentStock: 39, threshold: 40 })).toBe(false)
    expect(didCrossReorderThreshold({ previousStock: 45, currentStock: 41, threshold: 40 })).toBe(false)
    expect(didCrossReorderThreshold({ previousStock: 35, currentStock: 42, threshold: 40 })).toBe(false)
  })
})
