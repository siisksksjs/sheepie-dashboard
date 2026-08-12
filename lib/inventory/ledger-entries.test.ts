import { describe, expect, it } from "vitest"

import { buildInventoryLedgerRows } from "./ledger-entries"

const compositions = [
  { component_sku: "Mabele-001", quantity: 1 },
  { component_sku: "Lumi-001", quantity: 2 },
]

describe("buildInventoryLedgerRows", () => {
  it.each(["OUT_SALE", "OUT_PROMO", "OUT_DAMAGE"] as const)(
    "expands a bundle for %s",
    (movementType) => {
      const result = buildInventoryLedgerRows({
        formData: {
          sku: "DeepSleepKit",
          movement_type: movementType,
          quantity: -3,
          reference: "Campaign sample",
          entry_date: "2026-08-04",
        },
        createdBy: "user-1",
        isBundle: true,
        compositions,
      })

      expect(result).toEqual({
        rows: [
          {
            sku: "Mabele-001",
            movement_type: movementType,
            quantity: -3,
            reference: "Campaign sample (Bundle: DeepSleepKit)",
            entry_date: "2026-08-04",
            created_by: "user-1",
          },
          {
            sku: "Lumi-001",
            movement_type: movementType,
            quantity: -6,
            reference: "Campaign sample (Bundle: DeepSleepKit)",
            entry_date: "2026-08-04",
            created_by: "user-1",
          },
        ],
        error: null,
      })
    },
  )

  it("keeps normal products and non-outbound bundle movements SKU-specific", () => {
    const directProduct = buildInventoryLedgerRows({
      formData: {
        sku: "Mabele-001",
        movement_type: "OUT_PROMO",
        quantity: -2,
        reference: null,
      },
      createdBy: null,
      isBundle: false,
      compositions: [],
    })
    const bundleAdjustment = buildInventoryLedgerRows({
      formData: {
        sku: "DeepSleepKit",
        movement_type: "ADJUSTMENT",
        quantity: 1,
        reference: "Correction",
      },
      createdBy: null,
      isBundle: true,
      compositions,
    })

    expect(directProduct.rows).toEqual([{
      sku: "Mabele-001",
      movement_type: "OUT_PROMO",
      quantity: -2,
      reference: null,
      created_by: null,
    }])
    expect(bundleAdjustment.rows).toEqual([{
      sku: "DeepSleepKit",
      movement_type: "ADJUSTMENT",
      quantity: 1,
      reference: "Correction",
      created_by: null,
    }])
  })

  it("rejects an outbound bundle without compositions", () => {
    const result = buildInventoryLedgerRows({
      formData: {
        sku: "DeepSleepKit",
        movement_type: "OUT_PROMO",
        quantity: -1,
        reference: null,
      },
      createdBy: null,
      isBundle: true,
      compositions: [],
    })

    expect(result).toEqual({
      rows: [],
      error: "Bundle DeepSleepKit has no component composition",
    })
  })
})
