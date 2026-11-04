import { describe, expect, it } from "vitest"
import type { ShopeeOrderDetail } from "./client"
import { buildShopeeOrderPayload, jakartaDate, type ListingMap } from "./build-order"

function item(
  overrides: Partial<ShopeeOrderDetail["item_list"][number]> = {}
): ShopeeOrderDetail["item_list"][number] {
  return {
    item_id: 111,
    model_id: 222,
    item_name: "Lumi Sleep Mask",
    model_name: "Blue Single",
    model_quantity_purchased: 1,
    model_discounted_price: 218000,
    ...overrides,
  }
}

function detail(items: ShopeeOrderDetail["item_list"]): ShopeeOrderDetail {
  return {
    order_sn: "2611040ABC",
    order_status: "PROCESSED",
    create_time: 1793813400,
    update_time: 1793817000,
    item_list: items,
  }
}

describe("jakartaDate", () => {
  it("uses the Jakarta calendar day, not UTC", () => {
    // 2026-11-04 17:30 UTC is already 2026-11-05 00:30 in Jakarta.
    expect(jakartaDate(1793813400)).toBe("2026-11-05")
  })
})

describe("buildShopeeOrderPayload", () => {
  const map: ListingMap = new Map([
    ["111:222", { sku: "Lumi-001", pack_size: "single" }],
    ["111:333", { sku: "Lumi-001", pack_size: "bundle_2" }],
    ["444:0", { sku: "Eye-001", pack_size: "single" }],
  ])

  it("builds lines from model_discounted_price and pack map", () => {
    const result = buildShopeeOrderPayload(detail([item()]), "paid", map)
    expect(result).toEqual({
      kind: "ok",
      payload: {
        order_sn: "2611040ABC",
        status: "paid",
        external_status: "PROCESSED",
        order_date: "2026-11-05",
        external_created_at: new Date(1793813400 * 1000).toISOString(),
        external_updated_at: new Date(1793817000 * 1000).toISOString(),
        lines: [
          { sku: "Lumi-001", pack_size: "single", quantity: 1, selling_price: 218000 },
        ],
      },
    })
  })

  it("one unmapped item makes whole order unmapped", () => {
    const unmapped = item({
      item_id: 999,
      model_id: 888,
      item_name: "Mystery",
      model_name: "Red",
    })
    const result = buildShopeeOrderPayload(detail([item(), unmapped]), "paid", map)
    expect(result).toEqual({
      kind: "unmapped",
      items: [
        { item_id: 999, model_id: 888, item_name: "Mystery", model_name: "Red" },
      ],
    })
  })

  it("model_id 0 is a valid key", () => {
    const result = buildShopeeOrderPayload(
      detail([item({ item_id: 444, model_id: 0, model_quantity_purchased: 2, model_discounted_price: 99000 })]),
      "shipped",
      map
    )
    expect(result.kind).toBe("ok")
    if (result.kind === "ok") {
      expect(result.payload.status).toBe("shipped")
      expect(result.payload.lines).toEqual([
        { sku: "Eye-001", pack_size: "single", quantity: 2, selling_price: 99000 },
      ])
    }
  })
})
