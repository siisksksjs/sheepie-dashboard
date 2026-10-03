import { describe, expect, it } from "vitest"
import { buildIncomingStockBySku, getRestockCoverage } from "./coverage"

describe("incoming restock coverage", () => {
  it("sums multiple incoming batches while keeping colours separate and excluding arrived stock", () => {
    const result = buildIncomingStockBySku([
      { restock_status: "in_transit", items: [{ sku: "Lumi-001", quantity: 100 }, { sku: "Lumi-002", quantity: 200 }] },
      { restock_status: "in_transit", items: [{ sku: "Lumi-001", quantity: 50 }] },
      { restock_status: "arrived", items: [{ sku: "Lumi-001", quantity: 500 }] },
    ])
    expect(result.get("Lumi-001")).toBe(150)
    expect(result.get("Lumi-002")).toBe(200)
  })

  it("stops recommending another pillow purchase when 108 incoming units cover the reorder level", () => {
    expect(getRestockCoverage({ stock: 0, incoming: 108, reorderAt: 68 })).toMatchObject({
      incoming: 108, inventoryPosition: 108, additionalUnits: 0, needsReorder: false, coveredByIncoming: true,
    })
  })

  it("only reports the remaining blue-mask gap and preserves current sellable stock", () => {
    const input = { stock: 161, incoming: 100, reorderAt: 322 }
    expect(getRestockCoverage(input)).toMatchObject({ additionalUnits: 61, needsReorder: true, coveredByIncoming: false })
    expect(input.stock).toBe(161)
  })

  it("reports the full gap when no purchase is on the way", () => {
    expect(getRestockCoverage({ stock: 0, incoming: 0, reorderAt: 5 })).toMatchObject({ additionalUnits: 5, needsReorder: true })
  })

  it("does not double count a shipment after its quantity moves into on-hand stock", () => {
    const afterArrival = buildIncomingStockBySku([{ restock_status: "arrived", items: [{ sku: "Cervi-001", quantity: 108 }] }])
    expect(getRestockCoverage({ stock: 108, incoming: afterArrival.get("Cervi-001") ?? 0, reorderAt: 68 })).toMatchObject({
      inventoryPosition: 108, additionalUnits: 0, needsReorder: false, coveredByIncoming: false,
    })
  })

  it("covers the exact reorder level without proposing zero-unit orders", () => {
    expect(getRestockCoverage({ stock: 20, incoming: 30, reorderAt: 50 })).toMatchObject({ additionalUnits: 0, needsReorder: false, coveredByIncoming: true })
  })

  it("includes negative stock in the outstanding gap", () => {
    expect(getRestockCoverage({ stock: -5, incoming: 10, reorderAt: 20 }).additionalUnits).toBe(15)
  })

  it("does not invent zero incoming stock when the source is unavailable", () => {
    expect(getRestockCoverage({ stock: 0, incoming: null, reorderAt: 68 })).toMatchObject({
      inventoryPosition: null, additionalUnits: null, needsReorder: true, coveredByIncoming: false,
    })
  })

  it("does not invent a target for products without a reorder point", () => {
    expect(getRestockCoverage({ stock: 0, incoming: 100, reorderAt: null })).toMatchObject({ additionalUnits: null, needsReorder: false, coveredByIncoming: false })
  })
})
