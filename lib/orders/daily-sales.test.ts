import { describe, expect, it } from "vitest"

import { buildDailySalesSummary } from "./daily-sales"

describe("buildDailySalesSummary", () => {
  it("expands bundles and combines product quantities across channels", () => {
    const result = buildDailySalesSummary({
      date: "2026-08-01",
      orders: [
        {
          channel_fees: 10000,
          order_line_items: [
            { sku: "Lumi-001", quantity: 1, pack_size: "single", selling_price: 100000 },
          ],
        },
        {
          channel_fees: 20000,
          order_line_items: [
            { sku: "Lumi-Calmi-Kit", quantity: 1, pack_size: "single", selling_price: 250000 },
          ],
        },
        {
          channel_fees: 0,
          order_line_items: [
            { sku: "Lumi-001", quantity: 1, pack_size: "bundle_2", selling_price: 180000 },
          ],
        },
      ],
      products: [
        { sku: "Lumi-001", name: "LumiCloud Eye Mask", variant: "Standard" },
        { sku: "Calmi-001", name: "CalmiCloud Ear Plug", variant: "Standard" },
        { sku: "Lumi-Calmi-Kit", name: "Silence & Darkness Kit", variant: null },
      ],
      bundleCompositions: [
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Lumi-001", quantity: 1 },
        { bundle_sku: "Lumi-Calmi-Kit", component_sku: "Calmi-001", quantity: 1 },
      ],
    })

    expect(result).toEqual({
      date: "2026-08-01",
      totalOrders: 3,
      totalUnits: 5,
      totalGmv: 530000,
      totalRevenue: 500000,
      items: [
        { sku: "Lumi-001", productName: "LumiCloud Eye Mask - Standard", quantity: 4 },
        { sku: "Calmi-001", productName: "CalmiCloud Ear Plug - Standard", quantity: 1 },
      ],
    })
  })

  it("keeps an unmapped SKU visible and falls back to its SKU for the name", () => {
    const result = buildDailySalesSummary({
      date: "2026-08-01",
      orders: [
        {
          channel_fees: null,
          order_line_items: [
            { sku: "Unknown-Kit", quantity: 2, pack_size: "single", selling_price: 50000 },
          ],
        },
      ],
      products: [],
      bundleCompositions: [],
    })

    expect(result.items).toEqual([
      { sku: "Unknown-Kit", productName: "Unknown-Kit", quantity: 2 },
    ])
  })
})
