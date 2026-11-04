import { createHmac } from "node:crypto"

import { beforeEach, describe, expect, it, vi } from "vitest"

import type { ListingMap } from "./build-order"
import type { ShopeeOrderDetail, ShopeeTokens, createShopeeClient } from "./client"
import { handleShopeePush } from "./push"
import type { ShopeeConnection, ShopeeStore } from "./store"
import type { SyncDeps } from "./sync"

const { triggerNotificationSender } = vi.hoisted(() => ({
  triggerNotificationSender: vi.fn(async () => ({ success: true, skipped: false })),
}))
vi.mock("@/lib/notifications/trigger-sender", () => ({ triggerNotificationSender }))

const NOW = new Date("2026-11-04T10:00:00Z")
const HOUR_MS = 3600_000
const SYNC_START = new Date("2026-11-01T00:00:00Z")
const AFTER_START = Math.floor(SYNC_START.getTime() / 1000) + 86400
const CALLBACK_URL = "https://dashboard.sheepiesleep.com/api/shopee/push"
const PUSH_KEY = "push_key_secret"
const SHOP_ID = 555

function connection(overrides: Partial<ShopeeConnection> = {}): ShopeeConnection {
  return {
    channel: "shopee",
    shopId: SHOP_ID,
    accessToken: "access_live_secret",
    refreshToken: "refresh_live_secret",
    accessExpiresAt: new Date(NOW.getTime() + 3 * HOUR_MS),
    refreshExpiresAt: new Date(NOW.getTime() + 20 * 24 * HOUR_MS),
    syncStartAt: SYNC_START,
    lastSyncedUntil: null,
    consecutiveFailures: 0,
    lastSyncError: null,
    lastAlertAt: null,
    lastAlertKind: null,
    lastPushAt: null,
    updatedAt: NOW,
    ...overrides,
  }
}

function detail(sn: string, status: string): ShopeeOrderDetail {
  return {
    order_sn: sn,
    order_status: status,
    create_time: AFTER_START,
    update_time: AFTER_START + 600,
    item_list: [
      {
        item_id: 1,
        model_id: 10,
        item_name: "Sleep Mask",
        model_name: "Black",
        model_quantity_purchased: 1,
        model_discounted_price: 99000,
      },
    ],
  }
}

function makeDeps(conn: ShopeeConnection | null, details: ShopeeOrderDetail[] = []) {
  const store = {
    getConnection: vi.fn(async () => conn),
    saveTokens: vi.fn(async () => {}),
    saveCursor: vi.fn(async () => {}),
    recordFailure: vi.fn(async () => 1),
    resetFailures: vi.fn(async () => {}),
    loadListingMap: vi.fn(async () => new Map([["1:10", { sku: "SLP-001", pack_size: "single" }]]) as ListingMap),
    queue: vi.fn(async () => ({ opened: true })),
    resolveQueue: vi.fn(async () => {}),
    openRetryableSns: vi.fn(async () => []),
    findOrder: vi.fn(async () => null),
    applyOrder: vi.fn(async () => ({ action: "created" as const, orderId: "order-uuid", ledgerEntries: 1 })),
    countRecentSyncedVia: vi.fn(async () => ({ push: 0, poll: 0 })),
    markAlerted: vi.fn(async () => {}),
    markPushReceived: vi.fn(async () => {}),
  } satisfies ShopeeStore

  const shopee = {
    buildAuthUrl: vi.fn(() => ""),
    getTokens: vi.fn(),
    refreshTokens: vi.fn(
      async (): Promise<ShopeeTokens> => ({
        accessToken: "access_new",
        refreshToken: "refresh_new",
        accessExpiresAt: new Date(NOW.getTime() + 4 * HOUR_MS),
        refreshExpiresAt: new Date(NOW.getTime() + 30 * 24 * HOUR_MS),
      })
    ),
    listOrderSns: vi.fn(async () => []),
    getOrderDetails: vi.fn(async (_auth: unknown, sns: string[]) => details.filter((d) => sns.includes(d.order_sn))),
  }

  const deps: SyncDeps & { pushKey: string; callbackUrl: string } = {
    store,
    shopee: shopee as unknown as ReturnType<typeof createShopeeClient>,
    now: () => NOW,
    pushKey: PUSH_KEY,
    callbackUrl: CALLBACK_URL,
  }
  return { deps, store, shopee }
}

function orderPush(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    code: 3,
    shop_id: SHOP_ID,
    timestamp: AFTER_START + 600,
    data: { ordersn: "SN1", status: "PROCESSED", update_time: AFTER_START + 600 },
    ...overrides,
  })
}

function sign(rawBody: string, key = PUSH_KEY): string {
  return createHmac("sha256", key).update(`${CALLBACK_URL}|${rawBody}`).digest("hex")
}

beforeEach(() => {
  triggerNotificationSender.mockClear()
})

describe("handleShopeePush", () => {
  it("bad signature returns 401 and does not sync", async () => {
    const { deps, store, shopee } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
    const rawBody = orderPush()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    for (const authorization of [null, "", sign(rawBody, "wrong_key"), sign(rawBody + " ")]) {
      const result = await handleShopeePush({ rawBody, authorization }, deps)
      expect(result.status).toBe(401)
      expect(result.body.ok).toBe(false)
    }

    // One safe line per rejection: no body, no header value.
    expect(warn.mock.calls).toEqual(Array(4).fill(["Shopee push rejected: invalid signature"]))
    warn.mockRestore()
    expect(store.getConnection).not.toHaveBeenCalled()
    expect(shopee.getOrderDetails).not.toHaveBeenCalled()
    expect(store.applyOrder).not.toHaveBeenCalled()
  })

  it("rejects every push when the push key is empty", async () => {
    const { deps, store } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
    const rawBody = orderPush()
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody, "") }, { ...deps, pushKey: "" })

    expect(result.status).toBe(401)
    expect(warn).toHaveBeenCalledWith("Shopee push rejected: invalid signature")
    warn.mockRestore()
    expect(store.getConnection).not.toHaveBeenCalled()
  })

  it("non-order push is ignored with 200", async () => {
    const { deps, store, shopee } = makeDeps(connection(), [detail("SN1", "PROCESSED")])

    for (const rawBody of [
      orderPush({ code: 0, data: {} }),
      orderPush({ code: 4 }),
      orderPush({ data: { status: "PROCESSED" } }),
      "not json",
    ]) {
      const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)
      expect(result).toEqual({ status: 200, body: { ok: true, reason: "ignored" } })
    }

    expect(shopee.getOrderDetails).not.toHaveBeenCalled()
    expect(store.applyOrder).not.toHaveBeenCalled()
    expect(store.queue).not.toHaveBeenCalled()
  })

  it("other shop is ignored", async () => {
    for (const conn of [connection(), null, connection({ syncStartAt: null })]) {
      const { deps, store, shopee } = makeDeps(conn, [detail("SN1", "PROCESSED")])
      const rawBody = orderPush(conn?.syncStartAt ? { shop_id: 999 } : {})

      const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

      expect(result).toEqual({ status: 200, body: { ok: true, reason: "ignored" } })
      expect(shopee.getOrderDetails).not.toHaveBeenCalled()
      expect(store.applyOrder).not.toHaveBeenCalled()
      expect(store.queue).not.toHaveBeenCalled()
      expect(store.markPushReceived).not.toHaveBeenCalled()
    }
  })

  it("expired token queues instead of refreshing", async () => {
    const { deps, store, shopee } = makeDeps(connection({ accessExpiresAt: new Date(NOW.getTime() - 1000) }), [
      detail("SN1", "PROCESSED"),
    ])
    const rawBody = orderPush()

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(false)
    expect(shopee.refreshTokens).not.toHaveBeenCalled()
    expect(store.saveTokens).not.toHaveBeenCalled()
    expect(shopee.getOrderDetails).not.toHaveBeenCalled()
    expect(store.queue).toHaveBeenCalledTimes(1)
    expect(store.queue).toHaveBeenCalledWith("SN1", "error", { message: expect.any(String) })
    const message = (store.queue.mock.calls[0] as unknown[])[2] as { message: string }
    expect(message.message).not.toContain("access_live_secret")
    expect(message.message).not.toContain("refresh_live_secret")
    expect(message.message).not.toContain(PUSH_KEY)
  })

  it("still returns 200 when queueing the failed order also fails", async () => {
    const { deps, store } = makeDeps(connection())
    store.getConnection.mockRejectedValueOnce(new Error("db down"))
    store.queue.mockRejectedValueOnce(new Error("db still down"))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const rawBody = orderPush()

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(result.status).toBe(200)
    expect(result.body.ok).toBe(false)
    expect(store.queue).toHaveBeenCalledWith("SN1", "error", { message: "db down" })
    expect(errorLog).toHaveBeenCalled()
    errorLog.mockRestore()
  })

  it("valid push syncs the ordersn via push", async () => {
    const { deps, store, shopee } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
    const rawBody = orderPush()

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(shopee.getOrderDetails).toHaveBeenCalledWith({ shopId: SHOP_ID, accessToken: "access_live_secret" }, [
      "SN1",
    ])
    expect(store.applyOrder).toHaveBeenCalledTimes(1)
    expect(store.applyOrder).toHaveBeenCalledWith(expect.objectContaining({ order_sn: "SN1", status: "paid" }), "push")
    expect(shopee.refreshTokens).not.toHaveBeenCalled()
  })

  it("records the push time for a verified order push before syncing", async () => {
    const { deps, store, shopee } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
    const rawBody = orderPush()

    await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(store.markPushReceived).toHaveBeenCalledTimes(1)
    expect(store.markPushReceived).toHaveBeenCalledWith(NOW)
    expect(store.markPushReceived.mock.invocationCallOrder[0]).toBeLessThan(
      shopee.getOrderDetails.mock.invocationCallOrder[0]
    )
  })

  it("records the push time even when the sync then fails", async () => {
    const { deps, store } = makeDeps(connection({ accessExpiresAt: new Date(NOW.getTime() - 1000) }))
    const rawBody = orderPush()

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(result.body).toEqual({ ok: false, reason: "queued_for_retry" })
    expect(store.markPushReceived).toHaveBeenCalledWith(NOW)
  })

  it("a failure to record the push time does not fail the push", async () => {
    const { deps, store } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
    store.markPushReceived.mockRejectedValueOnce(new Error("db down"))
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const rawBody = orderPush()

    const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, deps)

    expect(result).toEqual({ status: 200, body: { ok: true } })
    expect(store.applyOrder).toHaveBeenCalledTimes(1)
    expect(store.queue).not.toHaveBeenCalled()
    expect(errorLog).toHaveBeenCalledWith("Shopee push: could not record the push time: db down")
    errorLog.mockRestore()
  })

  describe("newly failed orders", () => {
    it("a push whose sync queues a new error hands it to onFailedOrders", async () => {
      const { deps, store } = makeDeps(connection({ accessExpiresAt: new Date(NOW.getTime() - 1000) }))
      const onFailedOrders = vi.fn()
      const rawBody = orderPush()

      const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(result).toEqual({ status: 200, body: { ok: false, reason: "queued_for_retry" } })
      expect(store.queue).toHaveBeenCalledWith("SN1", "error", { message: "Shopee access token has expired" })
      expect(onFailedOrders).toHaveBeenCalledTimes(1)
      expect(onFailedOrders).toHaveBeenCalledWith([
        { orderSn: "SN1", reason: "error", message: "Shopee access token has expired" },
      ])
    })

    it("an order the sync itself queues (apply error) is handed over too", async () => {
      const { deps, store } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
      store.applyOrder.mockRejectedValueOnce(new Error("Bundle SLP-001 has no component composition."))
      const onFailedOrders = vi.fn()
      const rawBody = orderPush()

      const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(result).toEqual({ status: 200, body: { ok: true } })
      expect(onFailedOrders).toHaveBeenCalledWith([
        { orderSn: "SN1", reason: "error", message: "Bundle SLP-001 has no component composition." },
      ])
    })

    it("an order already open in the queue is not handed over again", async () => {
      const { deps, store } = makeDeps(connection({ accessExpiresAt: new Date(NOW.getTime() - 1000) }))
      store.queue.mockResolvedValue({ opened: false })
      const onFailedOrders = vi.fn()
      const rawBody = orderPush()

      await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(store.queue).toHaveBeenCalledTimes(1)
      expect(onFailedOrders).not.toHaveBeenCalled()
    })

    it("a successful push hands nothing over", async () => {
      const { deps } = makeDeps(connection(), [detail("SN1", "PROCESSED")])
      const onFailedOrders = vi.fn()
      const rawBody = orderPush()

      await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(onFailedOrders).not.toHaveBeenCalled()
    })

    it("onFailedOrders throwing does not change the push response", async () => {
      const { deps } = makeDeps(connection({ accessExpiresAt: new Date(NOW.getTime() - 1000) }))
      const onFailedOrders = vi.fn(() => {
        throw new Error("Resend failed with 500")
      })
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
      const rawBody = orderPush()

      const result = await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(result).toEqual({ status: 200, body: { ok: false, reason: "queued_for_retry" } })
      expect(errorLog).toHaveBeenCalledWith("Shopee push: failure email could not be scheduled: Resend failed with 500")
      errorLog.mockRestore()
    })

    it("hands nothing over when queueing the failed order also fails", async () => {
      const { deps, store } = makeDeps(connection())
      store.getConnection.mockRejectedValueOnce(new Error("db down"))
      store.queue.mockRejectedValueOnce(new Error("db still down"))
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
      const onFailedOrders = vi.fn()
      const rawBody = orderPush()

      await handleShopeePush({ rawBody, authorization: sign(rawBody) }, { ...deps, onFailedOrders })

      expect(onFailedOrders).not.toHaveBeenCalled()
      errorLog.mockRestore()
    })
  })
})
