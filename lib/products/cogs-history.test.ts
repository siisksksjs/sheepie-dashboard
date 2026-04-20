import { describe, expect, it } from "vitest"

import { buildProductCogsHistory } from "./cogs-history"

describe("buildProductCogsHistory", () => {
  it("merges restock and direct product cost changes in reverse chronology", () => {
    const history = buildProductCogsHistory({
      product: {
        sku: "Calmi-001",
        cost_per_unit: 14000,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      productCostChanges: [
        {
          id: "entry-1",
          logged_at: "2026-04-01T00:00:00.000Z",
          action_summary: "Updated product",
          notes: "Shipping cost increased.",
          changelog_items: [
            {
              id: "item-1",
              entry_id: "entry-1",
              field_name: "Cost per unit",
              old_value: "12000",
              new_value: "14000",
              display_order: 0,
              created_at: "2026-04-01T00:00:00.000Z",
            },
          ],
        },
      ],
      restockItems: [
        {
          id: "restock-item-1",
          batch_id: "batch-1",
          sku: "Calmi-001",
          quantity: 50,
          unit_cost: 12500,
          total_cost: 625000,
          batch: {
            id: "batch-1",
            entry_date: "2026-03-15",
            order_date: "2026-03-01",
            arrival_date: "2026-03-15",
            shipping_mode: "sea",
            vendor: "Sheepie CN",
            notes: "Freight adjusted",
          },
        },
      ],
    })

    expect(history.map((entry) => entry.source)).toEqual([
      "product_edit",
      "restock_batch",
    ])
    expect(history[0].previous_cost).toBe(12000)
    expect(history[0].next_cost).toBe(14000)
    expect(history[1].unit_cost).toBe(12500)
    expect(history[1].quantity).toBe(50)
  })

  it("adds a catalog snapshot when direct edit history does not exist", () => {
    const history = buildProductCogsHistory({
      product: {
        sku: "Lumi-001",
        cost_per_unit: 33000,
        created_at: "2026-02-10T00:00:00.000Z",
      },
      productCostChanges: [],
      restockItems: [],
    })

    expect(history).toHaveLength(1)
    expect(history[0].source).toBe("catalog_snapshot")
    expect(history[0].next_cost).toBe(33000)
  })
})
