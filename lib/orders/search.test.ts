import { describe, expect, it } from "vitest"
import { filterOrdersForSearch } from "@/lib/orders/search"

const orders = [
  {
    id: "order-lumi",
    gmv: 500_000,
    revenue: 430_000,
    profit: 275_000,
    order_line_items: [{ product_name: "LumiCloud Eye Mask" }],
  },
  {
    id: "order-cervi",
    gmv: 780_000,
    revenue: 700_000,
    profit: 500_000,
    order_line_items: [{ product_name: "CerviCloud Pillow" }],
  },
  {
    id: "order-calmi",
    gmv: 1_500_000,
    revenue: 1_500_000,
    profit: 820_000,
    order_line_items: [{ product_name: "CalmiCloud Ear Plug" }],
  },
]

describe("order smart search", () => {
  it("returns every loaded order for an empty query", () => {
    expect(filterOrdersForSearch(orders, "   ")).toEqual(orders)
  })

  it("matches partial product names without case sensitivity", () => {
    expect(filterOrdersForSearch(orders, "lumicloud").map((order) => order.id)).toEqual(["order-lumi"])
    expect(filterOrdersForSearch(orders, "PILLOW").map((order) => order.id)).toEqual(["order-cervi"])
  })

  it.each(["Rp500.000", "500.000", "500000"])("matches revenue containing %s", (query) => {
    expect(filterOrdersForSearch(orders, query).map((order) => order.id)).toEqual([
      "order-calmi",
    ])
  })

  it("matches partial revenue digits", () => {
    expect(filterOrdersForSearch(orders, "50000").map((order) => order.id)).toEqual([
      "order-calmi",
    ])
  })

  it("does not match GMV or profit when revenue does not contain the query", () => {
    expect(filterOrdersForSearch(orders, "500000").map((order) => order.id)).not.toContain("order-lumi")
    expect(filterOrdersForSearch(orders, "500000").map((order) => order.id)).not.toContain("order-cervi")
  })
})
