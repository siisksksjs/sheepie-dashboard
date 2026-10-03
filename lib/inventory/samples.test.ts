import { describe, expect, it } from "vitest"
import { parseSample, prepareSample, type SampleInput } from "./samples"
import { buildInventoryLedgerRows } from "./ledger-entries"

const sample: SampleInput = {
  sku: "Lumi-001",
  quantity: 2,
  sentDate: "2026-10-03",
  recipient: "  Creator name  ",
  handle: " @creator ",
  platform: "TikTok",
  reason: "Influencer seeding",
  notes: 'Blue sample · campaign "Sleep"'
}

describe("sample inventory records", () => {
  it("deducts physical stock as Promo Out and preserves recipient details", () => {
    const result = prepareSample(sample)
    expect(result.error).toBeUndefined()
    expect(result.entry).toMatchObject({
      sku: "Lumi-001",
      movement_type: "OUT_PROMO",
      quantity: -2,
      entry_date: "2026-10-03"
    })
    expect(parseSample(result.entry!.reference)).toEqual({
      recipient: "Creator name",
      handle: "@creator",
      platform: "TikTok",
      reason: "Influencer seeding",
      notes: sample.notes
    })
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10001])(
    "rejects invalid quantity %s",
    (quantity) => {
      expect(prepareSample({ ...sample, quantity }).error).toBeTruthy()
    }
  )

  it.each(["2026-02-30", "2026-13-01", "10/03/2026", ""])(
    'rejects invalid sent date "%s"',
    (sentDate) => {
      expect(prepareSample({ ...sample, sentDate }).error).toBeTruthy()
    }
  )

  it("rejects malformed action input and missing required information", () => {
    for (const input of [
      null,
      {},
      "sample",
      { ...sample, recipient: " " },
      { ...sample, sku: " " },
      { ...sample, notes: null },
      { ...sample, reason: "Sale" },
      { ...sample, platform: "unknown" },
      { ...sample, recipient: "a".repeat(121) },
      { ...sample, notes: "a".repeat(501) }
    ]) {
      expect(prepareSample(input).error).toBeTruthy()
    }
  })

  it("expands a kit without losing its sample recipient or inflating sales", () => {
    const prepared = prepareSample({
      ...sample,
      sku: "DeepSleepKit",
      quantity: 3
    })
    const result = buildInventoryLedgerRows({
      formData: prepared.entry!,
      createdBy: "user-1",
      isBundle: true,
      compositions: [
        { component_sku: "Calmi-001", quantity: 1 },
        { component_sku: "Lumi-001", quantity: 2 }
      ]
    })
    expect(result.error).toBeNull()
    expect(
      result.rows.map((row) => [row.sku, row.movement_type, row.quantity])
    ).toEqual([
      ["Calmi-001", "OUT_PROMO", -3],
      ["Lumi-001", "OUT_PROMO", -6]
    ])
    for (const row of result.rows)
      expect(parseSample(row.reference)?.recipient).toBe("Creator name")
  })

  it("keeps legacy free-text references and malformed metadata readable", () => {
    for (const value of [
      null,
      "holla.iiz KOL TK",
      "Sample · null",
      "Sample · {}",
      "Sample · broken"
    ])
      expect(parseSample(value)).toBeNull()
  })
})
