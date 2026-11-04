import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  checkShopeeAlerts,
  pickShopeeAlert,
  sendOrderFailureEmail,
  sendPollEmails,
  sendSafely,
  sendShopeeAlert,
  sendSyncFailureEmail,
  type ShopeeAlert,
} from "./alerts"
import type { ShopeeConnection, ShopeeStore } from "./store"
import type { ShopeeFailedOrder } from "./sync"

const NOW = new Date("2026-11-04T08:00:00.000Z")
const HOUR = 60 * 60 * 1000

const healthy = {
  syncLive: true,
  lastPushAt: null,
  pollCreatedLast24h: 0,
  lastAlertAt: null,
  lastAlertKind: null,
  now: NOW,
}

describe("pickShopeeAlert", () => {
  it("returns null when everything is healthy", () => {
    expect(pickShopeeAlert(healthy)).toBeNull()
  })

  it("picks push_silent when the poll applied orders and no push arrived in 24 hours", () => {
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2 })).toBe("push_silent")
    const lastPushAt = new Date(NOW.getTime() - 25 * HOUR)
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, lastPushAt })).toBe("push_silent")
  })

  it("push received recently suppresses push_silent even if orders came via poll", () => {
    const lastPushAt = new Date(NOW.getTime() - HOUR)
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 3, lastPushAt })).toBeNull()
  })

  it("does not flag push_silent when the poll applied nothing or sync is not live", () => {
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 0 })).toBeNull()
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, syncLive: false })).toBeNull()
  })

  it("stays quiet when push_silent went out within the last 24 hours", () => {
    const lastAlertAt = new Date(NOW.getTime() - 23 * HOUR)
    expect(
      pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, lastAlertAt, lastAlertKind: "push_silent" })
    ).toBeNull()
  })

  it("alerts again once push_silent is 24 hours old or older", () => {
    const lastAlertAt = new Date(NOW.getTime() - 24 * HOUR)
    expect(pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, lastAlertAt, lastAlertKind: "push_silent" })).toBe(
      "push_silent"
    )
  })
})

type Users = { data: { users: { email?: string | null }[] } | null; error: { message: string } | null }

function fakeSupabase(users: Users) {
  const listUsers = vi.fn(async () => users)
  const supabase = { auth: { admin: { listUsers } } } as unknown as SupabaseClient
  return { supabase, listUsers }
}

function fakeStore(overrides: Partial<ShopeeStore> = {}) {
  return {
    markAlerted: vi.fn(async () => {}),
    countRecentSyncedVia: vi.fn(async () => ({ push: 0, poll: 0 })),
    getConnection: vi.fn(async () => null),
    ...overrides,
  } as unknown as ShopeeStore
}

function okFetch() {
  return vi.fn(async () => new Response(JSON.stringify({ id: "email-1" }), { status: 200 }))
}

describe("sendShopeeAlert", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("posts the exact subject and a link to every unique recipient, then marks the alert", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "Sheepie <alerts@example.com>")
    const { supabase } = fakeSupabase({
      data: { users: [{ email: "a@x.com" }, { email: "b@x.com" }, { email: "a@x.com" }, { email: null }, {}] },
      error: null,
    })
    const store = fakeStore()
    const fetchImpl = okFetch()

    await sendShopeeAlert("push_silent", { supabase, store, fetchImpl, now: () => NOW })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test")
    const body = JSON.parse(init.body as string)
    expect(body.from).toBe("Sheepie <alerts@example.com>")
    expect(body.to).toEqual(["a@x.com", "b@x.com"])
    expect(body.subject).toBe("Sheepie Dashboard: no Shopee push received in 24 hours")
    expect(body.html).toContain("https://dashboard.sheepiesleep.com/more/shopee")
    expect(store.markAlerted).toHaveBeenCalledWith(NOW, "push_silent")
  })

  it("throws a clear error without secrets when the Resend env is missing, and does not mark", async () => {
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const store = fakeStore()
    const fetchImpl = okFetch()

    await expect(sendShopeeAlert("push_silent", { supabase, store, fetchImpl })).rejects.toThrow(
      "RESEND_API_KEY is not configured"
    )
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "")
    await expect(sendShopeeAlert("push_silent", { supabase, store, fetchImpl })).rejects.toThrow(
      "EMAIL_FROM is not configured"
    )
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(store.markAlerted).not.toHaveBeenCalled()
  })

  it("throws when there is nobody to email", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: null }] }, error: null })
    const store = fakeStore()
    await expect(sendShopeeAlert("push_silent", { supabase, store, fetchImpl: okFetch() })).rejects.toThrow(
      "No recipients found"
    )
    expect(store.markAlerted).not.toHaveBeenCalled()
  })

  it("throws on a Resend failure without leaking the key and releases the claim", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_secret_key")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const store = fakeStore()
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }))

    const error = await sendShopeeAlert("push_silent", { supabase, store, fetchImpl }).catch((e: Error) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("429")
    expect((error as Error).message).not.toContain("re_secret_key")
    expect(store.markAlerted).toHaveBeenLastCalledWith(null, null)
  })

  it("does not send when claiming the alert window fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const store = fakeStore({ markAlerted: vi.fn(async () => Promise.reject(new Error("db down"))) })
    const fetchImpl = okFetch()

    await expect(sendShopeeAlert("push_silent", { supabase, store, fetchImpl })).rejects.toThrow("db down")
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("send failure releases the claim back to the previous last_alert_at and kind so the next run retries", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const store = fakeStore()
    const previousAlertAt = new Date(NOW.getTime() - 48 * HOUR)
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }))

    await expect(
      sendShopeeAlert("push_silent", {
        supabase,
        store,
        fetchImpl,
        previousAlertAt,
        previousAlertKind: "push_silent",
        now: () => NOW,
      })
    ).rejects.toThrow("Resend failed with 500")
    expect(vi.mocked(store.markAlerted).mock.calls).toEqual([
      [NOW, "push_silent"],
      [previousAlertAt, "push_silent"],
    ])
  })

  it("send failure still surfaces the send error when the release also fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const markAlerted = vi.fn(async (at: Date | null, kind: ShopeeAlert | null) => {
      void kind
      if (at === null) throw new Error("release failed")
    })
    const store = fakeStore({ markAlerted })
    const fetchImpl = vi.fn(async () => new Response("boom", { status: 500 }))

    await expect(sendShopeeAlert("push_silent", { supabase, store, fetchImpl, now: () => NOW })).rejects.toThrow(
      "Resend failed with 500"
    )
    vi.restoreAllMocks()
  })

  it("throws when listing users fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: null, error: { message: "boom" } })
    await expect(
      sendShopeeAlert("push_silent", { supabase, store: fakeStore(), fetchImpl: okFetch() })
    ).rejects.toThrow("boom")
  })
})

function connection(overrides: Partial<ShopeeConnection> = {}): ShopeeConnection {
  return {
    channel: "shopee",
    shopId: 1,
    accessToken: "t",
    refreshToken: "r",
    accessExpiresAt: null,
    refreshExpiresAt: null,
    syncStartAt: NOW,
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

describe("checkShopeeAlerts", () => {
  afterEach(() => vi.unstubAllEnvs())

  function setup(conn: ShopeeConnection | null, counts = { push: 0, poll: 0 }) {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    const store = fakeStore({
      getConnection: vi.fn(async () => conn),
      countRecentSyncedVia: vi.fn(async () => counts),
    })
    const fetchImpl = okFetch()
    return { store, fetchImpl, deps: { supabase, store, fetchImpl, now: () => NOW } }
  }

  it("skips everything for not_connected and not_started", async () => {
    for (const status of ["not_connected", "not_started"] as const) {
      const { store, fetchImpl, deps } = setup(connection())
      expect(await checkShopeeAlerts({ status, consecutiveFailures: 9 }, deps)).toBeNull()
      expect(store.getConnection).not.toHaveBeenCalled()
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it("leaves failed and needs_reconnect polls to the failure emails", async () => {
    for (const status of ["failed", "needs_reconnect"] as const) {
      const { fetchImpl, deps, store } = setup(connection())
      expect(await checkShopeeAlerts({ status, consecutiveFailures: 5 }, deps)).toBeNull()
      expect(fetchImpl).not.toHaveBeenCalled()
      expect(store.markAlerted).not.toHaveBeenCalled()
    }
  })

  it("sends push_silent when the poll applied orders in the last 24 hours and no push arrived", async () => {
    const { deps, store } = setup(connection({ lastPushAt: new Date(NOW.getTime() - 30 * HOUR) }), {
      push: 0,
      poll: 2,
    })
    expect(await checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, deps)).toBe("push_silent")
    expect(store.countRecentSyncedVia).toHaveBeenCalledWith(new Date(NOW.getTime() - 24 * HOUR))
  })

  it("push received recently suppresses push_silent even if orders came via poll", async () => {
    const { deps, fetchImpl } = setup(connection({ lastPushAt: new Date(NOW.getTime() - HOUR) }), {
      push: 0,
      poll: 3,
    })
    expect(await checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, deps)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("sends nothing when healthy or recently alerted", async () => {
    const healthyRun = setup(connection())
    expect(await checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, healthyRun.deps)).toBeNull()
    expect(healthyRun.fetchImpl).not.toHaveBeenCalled()

    const recent = setup(connection({ lastAlertAt: new Date(NOW.getTime() - HOUR), lastAlertKind: "push_silent" }), {
      push: 0,
      poll: 2,
    })
    expect(await checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, recent.deps)).toBeNull()
    expect(recent.fetchImpl).not.toHaveBeenCalled()
  })

  it("a sent alert is not resent on the next run, whatever else fails afterwards", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
    let lastAlertAt: Date | null = null
    let lastAlertKind: ShopeeAlert | null = null
    const store = fakeStore({
      getConnection: vi.fn(async () => connection({ lastAlertAt, lastAlertKind })),
      countRecentSyncedVia: vi.fn(async () => ({ push: 0, poll: 2 })),
      markAlerted: vi.fn(async (at: Date | null, kind: ShopeeAlert | null) => {
        lastAlertAt = at
        lastAlertKind = kind
      }),
    })
    const fetchImpl = okFetch()
    let clock = NOW
    const deps = { supabase, store, fetchImpl, now: () => clock }
    const ok = { status: "ok", consecutiveFailures: 0 } as const

    expect(await checkShopeeAlerts(ok, deps)).toBe("push_silent")
    clock = new Date(NOW.getTime() + 15 * 60 * 1000)
    expect(await checkShopeeAlerts(ok, deps)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("passes the connection's previous last_alert_at and kind so a failed send restores them", async () => {
    const previous = new Date(NOW.getTime() - 30 * HOUR)
    const { deps, store } = setup(connection({ lastAlertAt: previous, lastAlertKind: "push_silent" }), {
      push: 0,
      poll: 2,
    })
    deps.fetchImpl = vi.fn(async () => new Response("no", { status: 503 }))
    await expect(checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, deps)).rejects.toThrow()
    expect(store.markAlerted).toHaveBeenLastCalledWith(previous, "push_silent")
  })

  it("returns null when the connection row is gone", async () => {
    const { deps, fetchImpl } = setup(null)
    expect(await checkShopeeAlerts({ status: "failed", consecutiveFailures: 5 }, deps)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

function sentBodies(fetchImpl: ReturnType<typeof okFetch>) {
  return fetchImpl.mock.calls.map((call) => {
    const [url, init] = call as unknown as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    return JSON.parse(init.body as string) as { from: string; to: string[]; subject: string; html: string }
  })
}

function emailSetup() {
  vi.stubEnv("RESEND_API_KEY", "re_secret_key")
  vi.stubEnv("EMAIL_FROM", "alerts@example.com")
  const { supabase, listUsers } = fakeSupabase({
    data: { users: [{ email: "a@x.com" }, { email: "b@x.com" }, { email: "a@x.com" }] },
    error: null,
  })
  const fetchImpl = okFetch()
  return { listUsers, fetchImpl, deps: { supabase, fetchImpl } }
}

describe("sendSyncFailureEmail", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("emails every dashboard user on every failed run, with the error and failure count", async () => {
    const { fetchImpl, deps } = emailSetup()

    await sendSyncFailureEmail({ status: "failed", consecutiveFailures: 1, error: "Shopee API timed out" }, deps)
    await sendSyncFailureEmail({ status: "failed", consecutiveFailures: 2, error: "Shopee API timed out" }, deps)

    const bodies = sentBodies(fetchImpl)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(body.subject).toBe("Sheepie Dashboard: Shopee sync failed")
      expect(body.to).toEqual(["a@x.com", "b@x.com"])
      expect(body.from).toBe("alerts@example.com")
      expect(body.html).toContain("Shopee API timed out")
      expect(body.html).toContain("https://dashboard.sheepiesleep.com/more/shopee")
      expect(body.html).not.toContain("re_secret_key")
    }
    expect(bodies[0].html).toContain("1 time in a row")
    expect(bodies[1].html).toContain("2 times in a row")
  })

  it("asks them to reconnect on every needs_reconnect run", async () => {
    const { fetchImpl, deps } = emailSetup()

    await sendSyncFailureEmail({ status: "needs_reconnect", consecutiveFailures: 1, error: "invalid_token" }, deps)
    await sendSyncFailureEmail({ status: "needs_reconnect", consecutiveFailures: 2, error: "invalid_token" }, deps)

    const bodies = sentBodies(fetchImpl)
    expect(bodies).toHaveLength(2)
    for (const body of bodies) {
      expect(body.subject).toBe("Sheepie Dashboard: Shopee needs reconnecting")
      expect(body.html).toMatch(/reconnect Shopee/i)
      expect(body.html).toContain("https://dashboard.sheepiesleep.com/more/shopee")
    }
  })

  it("sends nothing for runs that did not fail", async () => {
    const { fetchImpl, listUsers, deps } = emailSetup()
    for (const status of ["ok", "not_connected", "not_started"] as const) {
      await sendSyncFailureEmail({ status, consecutiveFailures: 0 }, deps)
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(listUsers).not.toHaveBeenCalled()
  })

  it("HTML-escapes the error message", async () => {
    const { fetchImpl, deps } = emailSetup()
    await sendSyncFailureEmail({ status: "failed", consecutiveFailures: 1, error: '<script>alert("x")</script>' }, deps)
    const [body] = sentBodies(fetchImpl)
    expect(body.html).not.toContain("<script>")
    expect(body.html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;")
  })

  it("throws on a Resend failure without leaking the key", async () => {
    const { deps } = emailSetup()
    const fetchImpl = vi.fn(async () => new Response("rate limited", { status: 429 }))
    const error = await sendSyncFailureEmail(
      { status: "failed", consecutiveFailures: 1, error: "boom" },
      { ...deps, fetchImpl }
    ).catch((e: Error) => e)
    expect((error as Error).message).toContain("429")
    expect((error as Error).message).not.toContain("re_secret_key")
  })
})

describe("sendOrderFailureEmail", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("does nothing for an empty list", async () => {
    const { fetchImpl, listUsers, deps } = emailSetup()
    await sendOrderFailureEmail([], deps)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(listUsers).not.toHaveBeenCalled()
  })

  it("sends one email for one order with a singular subject", async () => {
    const { fetchImpl, deps } = emailSetup()
    await sendOrderFailureEmail([{ orderSn: "2611040001", reason: "error", message: "Shopee returned no detail" }], deps)
    const bodies = sentBodies(fetchImpl)
    expect(bodies).toHaveLength(1)
    expect(bodies[0].subject).toBe("Sheepie Dashboard: 1 Shopee order failed to sync")
    expect(bodies[0].to).toEqual(["a@x.com", "b@x.com"])
    expect(bodies[0].html).toContain("2611040001: Shopee returned no detail")
    expect(bodies[0].html).toContain("https://dashboard.sheepiesleep.com/more/shopee")
  })

  it("batches several orders into one email, one line each", async () => {
    const { fetchImpl, deps } = emailSetup()
    const failed: ShopeeFailedOrder[] = [
      { orderSn: "A1", reason: "error", message: "apply failed" },
      { orderSn: "B2", reason: "error" },
      {
        orderSn: "C3",
        reason: "unmapped_item",
        items: [
          { item_name: "Sleep Mask", model_name: "Black" },
          { item_name: "Pillow", model_name: "" },
        ],
      },
    ]
    await sendOrderFailureEmail(failed, deps)

    const bodies = sentBodies(fetchImpl)
    expect(bodies).toHaveLength(1)
    expect(bodies[0].subject).toBe("Sheepie Dashboard: 3 Shopee orders failed to sync")
    expect(bodies[0].html).toContain("A1: apply failed")
    expect(bodies[0].html).toContain("B2: Unknown error")
    expect(bodies[0].html).toContain("C3: needs product mapping in /more/shopee: Sleep Mask (Black), Pillow")
  })

  it("HTML-escapes Shopee-provided names, messages and order numbers", async () => {
    const { fetchImpl, deps } = emailSetup()
    await sendOrderFailureEmail(
      [
        { orderSn: "<b>SN</b>", reason: "error", message: "<img src=x onerror=alert(1)>" },
        { orderSn: "SN2", reason: "unmapped_item", items: [{ item_name: "<script>x</script>", model_name: "A & B" }] },
      ],
      deps
    )
    const [body] = sentBodies(fetchImpl)
    expect(body.html).not.toContain("<script>")
    expect(body.html).not.toContain("<img")
    expect(body.html).not.toContain("<b>SN")
    expect(body.html).toContain("&lt;script&gt;x&lt;/script&gt; (A &amp; B)")
    expect(body.html).toContain("&lt;b&gt;SN&lt;/b&gt;")
  })
})

describe("sendSafely", () => {
  it("logs one line instead of throwing", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    await expect(sendSafely("Shopee test email failed", async () => Promise.reject(new Error("boom")))).resolves.toBe(
      undefined
    )
    await sendSafely("Shopee test email failed", () => {
      throw "not an error"
    })
    expect(errorLog.mock.calls).toEqual([["Shopee test email failed: boom"], ["Shopee test email failed: Unknown error"]])
    errorLog.mockRestore()
  })
})

describe("sendPollEmails", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  function pollSetup(conn: ShopeeConnection | null = connection(), counts = { push: 0, poll: 0 }) {
    const email = emailSetup()
    const store = fakeStore({
      getConnection: vi.fn(async () => conn),
      countRecentSyncedVia: vi.fn(async () => counts),
    })
    return { fetchImpl: email.fetchImpl, store, deps: { ...email.deps, store, now: () => NOW } }
  }

  const failedOrders: ShopeeFailedOrder[] = [{ orderSn: "A1", reason: "error", message: "apply failed" }]
  const summary = { created: 0, updated: 0, queued: 1, skipped: 0, ledgerEntries: 0, failedOrders }

  it("a failed poll that also queued orders sends the sync email and the order email", async () => {
    const { fetchImpl, deps } = pollSetup()
    await sendPollEmails({ status: "failed", consecutiveFailures: 1, error: "db down", summary }, deps)
    expect(sentBodies(fetchImpl).map((body) => body.subject)).toEqual([
      "Sheepie Dashboard: Shopee sync failed",
      "Sheepie Dashboard: 1 Shopee order failed to sync",
    ])
  })

  it("an ok poll sends only the order email for newly failed orders, then checks push_silent", async () => {
    const { fetchImpl, deps } = pollSetup(connection(), { push: 0, poll: 2 })
    await sendPollEmails({ status: "ok", consecutiveFailures: 0, summary }, deps)
    expect(sentBodies(fetchImpl).map((body) => body.subject)).toEqual([
      "Sheepie Dashboard: 1 Shopee order failed to sync",
      "Sheepie Dashboard: no Shopee push received in 24 hours",
    ])
  })

  it("an ok poll with no new failures sends nothing", async () => {
    const { fetchImpl, deps } = pollSetup()
    await sendPollEmails({ status: "ok", consecutiveFailures: 0, summary: { ...summary, failedOrders: [] } }, deps)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("one email failing does not stop the others and never throws", async () => {
    const { deps } = pollSetup(connection(), { push: 0, poll: 2 })
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("down", { status: 500 }))
      .mockResolvedValue(new Response("{}", { status: 200 }))

    await expect(
      sendPollEmails(
        { status: "failed", consecutiveFailures: 2, error: "db down", summary },
        { ...deps, fetchImpl: fetchImpl as unknown as typeof fetch }
      )
    ).resolves.toBeUndefined()

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(errorLog.mock.calls).toEqual([["Shopee sync failure email failed: Resend failed with 500: down"]])
  })
})
