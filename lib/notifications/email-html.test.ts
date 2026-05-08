import { describe, expect, it } from "vitest"

import {
  renderRestockAlertEmailHtml,
  renderSalesReportEmailHtml,
} from "./email-html"

describe("renderRestockAlertEmailHtml", () => {
  it("renders mobile-readable restock details without CSV dependency", () => {
    const html = renderRestockAlertEmailHtml({
      title: "Restock reorder alert",
      events: [
        {
          sku: "Lumi-001",
          productName: "LumiCloud Eye Mask",
          shippingMode: "sea",
          threshold: 160,
          previousStock: 185,
          currentStock: 158,
          leadTimeLabel: "Fallback 28-42d + Buffer 14d",
        },
      ],
    })

    expect(html).toContain("Restock reorder alert")
    expect(html).toContain("LumiCloud Eye Mask")
    expect(html).toContain("Lumi-001")
    expect(html).toContain("Sea")
    expect(html).toContain("158")
    expect(html).toContain("160")
    expect(html).toContain("Fallback 28-42d + Buffer 14d")
    expect(html).toContain("<table")
    expect(html).not.toContain(".csv")
  })
})

describe("renderSalesReportEmailHtml", () => {
  it("renders report totals and breakdowns", () => {
    const html = renderSalesReportEmailHtml({
      title: "Weekly sales report",
      periodLabel: "May 4-10, 2026",
      totals: {
        orders: 12,
        unitsSold: 45,
        revenue: 9_500_000,
        cost: 3_000_000,
        profit: 6_500_000,
        returnedUnits: 2,
      },
      bySku: [
        {
          sku: "Calmi-001",
          name: "CalmiCloud Ear Plug",
          unitsSold: 25,
          revenue: 2_500_000,
          profit: 1_600_000,
        },
      ],
      byChannel: [
        {
          channel: "shopee",
          orders: 8,
          revenue: 6_000_000,
          profit: 4_100_000,
        },
      ],
      lowStock: [
        {
          sku: "Lumi-001",
          productName: "LumiCloud Eye Mask",
          shippingMode: "air",
          threshold: 45,
          currentStock: 11,
        },
      ],
    })

    expect(html).toContain("Weekly sales report")
    expect(html).toContain("May 4-10, 2026")
    expect(html).toContain("Rp9.500.000")
    expect(html).toContain("CalmiCloud Ear Plug")
    expect(html).toContain("shopee")
    expect(html).toContain("Low stock")
    expect(html).toContain("Lumi-001")
  })
})
