import { beforeEach, describe, expect, it, vi } from "vitest"
import { recordSample } from "./samples"
import { parseSample, type SampleInput } from "@/lib/inventory/samples"

const mocks = vi.hoisted(() => ({ client: vi.fn(), ledger: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("@/lib/actions/inventory", () => ({ createLedgerEntry: mocks.ledger }))
const input: SampleInput = {
  sku: "Lumi-001",
  quantity: 2,
  sentDate: "2026-10-03",
  recipient: "Creator",
  handle: "@creator",
  platform: "TikTok",
  reason: "Influencer seeding",
  notes: "Blue"
}
function client({ signedIn = true, active = true } = {}) {
  const query = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi
      .fn()
      .mockResolvedValue({
        data: { status: active ? "active" : "discontinued" },
        error: null
      })
  }
  return {
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({
          data: { user: signedIn ? { id: "user-1" } : null },
          error: null
        })
    },
    from: vi.fn(() => query)
  }
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.ledger.mockResolvedValue({ success: true })
})
describe("recordSample", () => {
  it("rejects malformed input before any database call", async () => {
    expect(await recordSample({ ...input, quantity: -2 })).toMatchObject({
      success: false
    })
    expect(mocks.client).not.toHaveBeenCalled()
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it("requires an authenticated user before stock is deducted", async () => {
    mocks.client.mockResolvedValue(client({ signedIn: false }))
    expect(await recordSample(input)).toMatchObject({ success: false })
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it("rejects discontinued products", async () => {
    mocks.client.mockResolvedValue(client({ active: false }))
    expect(await recordSample(input)).toMatchObject({ success: false })
    expect(mocks.ledger).not.toHaveBeenCalled()
  })
  it("writes one promo movement through the existing inventory path", async () => {
    const db = client()
    mocks.client.mockResolvedValue(db)
    expect(await recordSample(input)).toEqual({ success: true })
    expect(db.from).toHaveBeenCalledWith("products")
    expect(mocks.ledger).toHaveBeenCalledTimes(1)
    const [entry, options] = mocks.ledger.mock.calls[0]
    expect(entry).toMatchObject({
      sku: "Lumi-001",
      movement_type: "OUT_PROMO",
      quantity: -2,
      entry_date: "2026-10-03"
    })
    expect(parseSample(entry.reference)?.recipient).toBe("Creator")
    expect(options).toMatchObject({
      actionSummary: "Sample sent to Creator",
      notes: "Blue"
    })
  })
  it("returns inventory errors without retrying the stock mutation", async () => {
    mocks.client.mockResolvedValue(client())
    mocks.ledger.mockResolvedValue({
      success: false,
      error: "Inventory unavailable"
    })
    expect(await recordSample(input)).toEqual({
      success: false,
      error: "Inventory unavailable"
    })
    expect(mocks.ledger).toHaveBeenCalledTimes(1)
  })
})
