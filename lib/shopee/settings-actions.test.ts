import { describe, expect, it } from "vitest"

import { collectUnmappedItems, formatSyncAge, validateListingMapping } from "./settings-actions"

const valid = {
  item_id: 2200001,
  model_id: 0,
  item_name: " Lumi Sleep Mask ",
  model_name: "Navy",
  sku: " LUMI-NAVY ",
  pack_size: "bundle_2",
}

describe("validateListingMapping", () => {
  it("accepts a complete mapping and trims text", () => {
    expect(validateListingMapping(valid)).toEqual({
      ok: true,
      value: {
        item_id: 2200001,
        model_id: 0,
        item_name: "Lumi Sleep Mask",
        model_name: "Navy",
        sku: "LUMI-NAVY",
        pack_size: "bundle_2",
      },
    })
  })

  it("rejects an invalid pack size", () => {
    for (const pack_size of ["bundle_5", "", "Single", undefined]) {
      expect(validateListingMapping({ ...valid, pack_size })).toEqual({ ok: false, error: "Choose a valid pack size." })
    }
  })

  it("rejects an empty sku", () => {
    for (const sku of ["", "   ", undefined, null]) {
      expect(validateListingMapping({ ...valid, sku })).toEqual({ ok: false, error: "Choose a SKU." })
    }
  })

  it("rejects missing or invalid Shopee ids", () => {
    for (const item_id of [0, -1, 1.5, Number.NaN, "12", undefined]) {
      expect(validateListingMapping({ ...valid, item_id })).toEqual({ ok: false, error: "This Shopee item ID is not valid." })
    }
    for (const model_id of [-1, 1.5, "0", undefined]) {
      expect(validateListingMapping({ ...valid, model_id })).toEqual({ ok: false, error: "This Shopee item ID is not valid." })
    }
  })
})

describe("collectUnmappedItems", () => {
  const item = (item_id: number, model_id: number, item_name = `Item ${item_id}`, model_name = `Model ${model_id}`) => ({
    item_id,
    model_id,
    item_name,
    model_name,
  })

  it("lists each item/model once with the number of waiting orders", () => {
    const rows = [
      { order_sn: "A", reason: "unmapped_item", detail: { items: [item(1, 10), item(2, 0)] } },
      { order_sn: "B", reason: "unmapped_item", detail: { items: [item(1, 10), item(1, 10)] } },
      { order_sn: "C", reason: "unmapped_item", detail: { items: [item(1, 11)] } },
    ]
    expect(collectUnmappedItems(rows, [])).toEqual([
      { ...item(1, 10), orderCount: 2 },
      { ...item(2, 0), orderCount: 1 },
      { ...item(1, 11), orderCount: 1 },
    ])
  })

  it("skips other reasons, malformed details and items that are already mapped", () => {
    const rows = [
      { order_sn: "A", reason: "error", detail: { message: "boom" } },
      { order_sn: "B", reason: "return_review", detail: {} },
      { order_sn: "C", reason: "unmapped_item", detail: { items: "nope" } },
      { order_sn: "D", reason: "unmapped_item", detail: null },
      { order_sn: "E", reason: "unmapped_item", detail: { items: [item(5, 50), { item_id: "x" }, item(6, 60)] } },
    ]
    expect(collectUnmappedItems(rows, [{ item_id: 5, model_id: 50 }])).toEqual([{ ...item(6, 60), orderCount: 1 }])
  })

  it("accepts bigint ids that arrive as strings", () => {
    const rows = [{ order_sn: "A", reason: "unmapped_item", detail: { items: [item(7, 70)] } }]
    expect(collectUnmappedItems(rows, [{ item_id: "7", model_id: "70" }])).toEqual([])
  })
})

describe("formatSyncAge", () => {
  const now = new Date("2026-11-04T10:00:00Z")

  it("says never synced when there is no cursor", () => {
    expect(formatSyncAge(null, now)).toBe("Never synced")
  })

  it("counts minutes, then hours, then days", () => {
    expect(formatSyncAge("2026-11-04T09:59:40Z", now)).toBe("Just now")
    expect(formatSyncAge("2026-11-04T09:45:00Z", now)).toBe("15 minutes ago")
    expect(formatSyncAge("2026-11-04T07:00:00Z", now)).toBe("3 hours ago")
    expect(formatSyncAge("2026-11-01T10:00:00Z", now)).toBe("3 days ago")
    expect(formatSyncAge("2026-11-04T09:59:00Z", now)).toBe("1 minute ago")
    expect(formatSyncAge("2026-11-04T09:00:00Z", now)).toBe("1 hour ago")
  })
})
