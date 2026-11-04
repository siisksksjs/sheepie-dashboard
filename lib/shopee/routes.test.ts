import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { ShopeePushDeps } from "./push"
import type { PollResult, ShopeeFailedOrder } from "./sync"

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  createSyncDeps: vi.fn(),
  createServiceClient: vi.fn(),
  pollShopeeOrders: vi.fn(),
  handleShopeePush: vi.fn(),
  sendPollEmails: vi.fn(),
  sendOrderFailureEmail: vi.fn(),
  createClient: vi.fn(),
}))

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }))
vi.mock("@/lib/shopee/deps", () => ({ createSyncDeps: mocks.createSyncDeps }))
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: mocks.createServiceClient }))
vi.mock("@/lib/shopee/sync", () => ({ pollShopeeOrders: mocks.pollShopeeOrders }))
vi.mock("@/lib/shopee/push", () => ({ handleShopeePush: mocks.handleShopeePush }))
vi.mock("@/lib/shopee/alerts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./alerts")>()),
  sendPollEmails: mocks.sendPollEmails,
  sendOrderFailureEmail: mocks.sendOrderFailureEmail,
}))

const { POST: syncPOST } = await import("@/app/api/shopee/sync/route")
const { POST: pushPOST } = await import("@/app/api/shopee/push/route")
const { syncShopeeNow } = await import("@/lib/actions/shopee")

const store = { markAlerted: vi.fn(), getConnection: vi.fn(), countRecentSyncedVia: vi.fn() }
const supabase = { tag: "service-client" }
const failedOrders: ShopeeFailedOrder[] = [{ orderSn: "SN1", reason: "error", message: "boom" }]

beforeEach(() => {
  vi.stubEnv("SHOPEE_SYNC_SECRET", "sync_secret")
  vi.stubEnv("SHOPEE_PUSH_PARTNER_KEY", "push_key")
  mocks.createSyncDeps.mockReturnValue({ store, shopee: {}, now: () => new Date("2026-11-04T10:00:00Z") })
  mocks.createServiceClient.mockReturnValue(supabase)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetAllMocks()
})

function syncRequest() {
  return new NextRequest("https://dashboard.sheepiesleep.com/api/shopee/sync", {
    method: "POST",
    headers: { "x-shopee-sync-secret": "sync_secret" },
  })
}

describe("POST /api/shopee/sync", () => {
  const failed: PollResult = {
    status: "failed",
    consecutiveFailures: 2,
    error: "Shopee API timed out",
    summary: { created: 0, updated: 0, queued: 1, skipped: 0, ledgerEntries: 0, failedOrders },
  }

  it("sends the poll emails with the poll result and returns the result", async () => {
    mocks.pollShopeeOrders.mockResolvedValue(failed)

    const response = await syncPOST(syncRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(failed)
    expect(mocks.sendPollEmails).toHaveBeenCalledWith(failed, expect.objectContaining({ supabase, store }))
  })

  it("an email problem does not change the result", async () => {
    mocks.pollShopeeOrders.mockResolvedValue(failed)
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    mocks.sendPollEmails.mockRejectedValue(new Error("Resend failed with 500"))

    const response = await syncPOST(syncRequest())
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(failed)

    mocks.sendPollEmails.mockReset()
    mocks.createServiceClient.mockImplementation(() => {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set")
    })
    const again = await syncPOST(syncRequest())
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual(failed)
    expect(errorLog.mock.calls).toEqual([
      ["Shopee failure emails failed: Resend failed with 500"],
      ["Shopee failure emails failed: SUPABASE_SERVICE_ROLE_KEY is not set"],
    ])
  })
})

function pushRequest() {
  return new NextRequest("https://dashboard.sheepiesleep.com/api/shopee/push", {
    method: "POST",
    headers: { authorization: "sig" },
    body: "{}",
  })
}

describe("POST /api/shopee/push", () => {
  it("schedules the order failure email with after() and answers Shopee first", async () => {
    mocks.handleShopeePush.mockImplementation(async (_input: unknown, deps: ShopeePushDeps) => {
      deps.onFailedOrders?.(failedOrders)
      return { status: 200, body: { ok: false, reason: "queued_for_retry" } }
    })

    const response = await pushPOST(pushRequest())

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: false, reason: "queued_for_retry" })
    expect(mocks.after).toHaveBeenCalledTimes(1)
    expect(mocks.sendOrderFailureEmail).not.toHaveBeenCalled()

    await mocks.after.mock.calls[0][0]()
    expect(mocks.sendOrderFailureEmail).toHaveBeenCalledWith(failedOrders, { supabase })
  })

  it("a failing email send is logged, not thrown", async () => {
    mocks.handleShopeePush.mockImplementation(async (_input: unknown, deps: ShopeePushDeps) => {
      deps.onFailedOrders?.(failedOrders)
      return { status: 200, body: { ok: true } }
    })
    mocks.sendOrderFailureEmail.mockRejectedValue(new Error("Resend failed with 500"))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})

    const response = await pushPOST(pushRequest())
    expect(response.status).toBe(200)
    await expect(mocks.after.mock.calls[0][0]()).resolves.toBeUndefined()
    expect(errorLog).toHaveBeenCalledWith("Shopee order failure email failed: Resend failed with 500")
  })

  it("schedules nothing when no order newly failed", async () => {
    mocks.handleShopeePush.mockResolvedValue({ status: 200, body: { ok: true } })
    await pushPOST(pushRequest())
    expect(mocks.after).not.toHaveBeenCalled()
  })
})

describe("syncShopeeNow", () => {
  beforeEach(() => {
    mocks.createClient.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: { id: "u1" } }, error: null }) },
    })
  })

  const summary = { created: 0, updated: 0, queued: 1, skipped: 0, ledgerEntries: 0, failedOrders }

  it("emails orders that newly failed during a manual sync, after responding", async () => {
    mocks.pollShopeeOrders.mockResolvedValue({ status: "ok", consecutiveFailures: 0, summary })

    expect(await syncShopeeNow()).toEqual({ success: true, message: "Sync finished: 0 new, 0 updated, 1 pending." })
    expect(mocks.after).toHaveBeenCalledTimes(1)
    await mocks.after.mock.calls[0][0]()
    expect(mocks.sendOrderFailureEmail).toHaveBeenCalledWith(failedOrders, { supabase })
  })

  it("schedules nothing when no order newly failed", async () => {
    mocks.pollShopeeOrders.mockResolvedValue({ status: "ok", consecutiveFailures: 0, summary: { ...summary, failedOrders: [] } })
    await syncShopeeNow()
    expect(mocks.after).not.toHaveBeenCalled()
  })
})
