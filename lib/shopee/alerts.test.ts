import type { SupabaseClient } from "@supabase/supabase-js"
import { afterEach, describe, expect, it, vi } from "vitest"

import { checkShopeeAlerts, pickShopeeAlert, sendShopeeAlert, type ShopeeAlert } from "./alerts"
import type { ShopeeConnection, ShopeeStore } from "./store"

const NOW = new Date("2026-11-04T08:00:00.000Z")
const HOUR = 60 * 60 * 1000

const healthy = {
  needsReconnect: false,
  consecutiveFailures: 0,
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

  it("picks needs_reconnect", () => {
    expect(pickShopeeAlert({ ...healthy, needsReconnect: true })).toBe("needs_reconnect")
  })

  it("picks repeated_failures from 3 consecutive failures, not 2", () => {
    expect(pickShopeeAlert({ ...healthy, consecutiveFailures: 2 })).toBeNull()
    expect(pickShopeeAlert({ ...healthy, consecutiveFailures: 3 })).toBe("repeated_failures")
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

  it("prefers needs_reconnect over repeated_failures over push_silent", () => {
    const all = { ...healthy, consecutiveFailures: 5, pollCreatedLast24h: 4 }
    expect(pickShopeeAlert({ ...all, needsReconnect: true })).toBe("needs_reconnect")
    expect(pickShopeeAlert(all)).toBe("repeated_failures")
    expect(pickShopeeAlert({ ...all, consecutiveFailures: 0 })).toBe("push_silent")
  })

  it("stays quiet when the same kind went out within the last 24 hours", () => {
    const lastAlertAt = new Date(NOW.getTime() - 23 * HOUR)
    expect(pickShopeeAlert({ ...healthy, needsReconnect: true, lastAlertAt, lastAlertKind: "needs_reconnect" })).toBeNull()
    expect(
      pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, lastAlertAt, lastAlertKind: "push_silent" })
    ).toBeNull()
  })

  it("needs_reconnect is sent even within another kind's quiet window", () => {
    const lastAlertAt = new Date(NOW.getTime() - HOUR)
    for (const lastAlertKind of ["repeated_failures", "push_silent"] as const) {
      expect(pickShopeeAlert({ ...healthy, needsReconnect: true, lastAlertAt, lastAlertKind })).toBe("needs_reconnect")
    }
  })

  it("other kinds are only quieted by their own kind", () => {
    const lastAlertAt = new Date(NOW.getTime() - HOUR)
    expect(
      pickShopeeAlert({ ...healthy, consecutiveFailures: 3, lastAlertAt, lastAlertKind: "push_silent" })
    ).toBe("repeated_failures")
    expect(
      pickShopeeAlert({ ...healthy, pollCreatedLast24h: 2, lastAlertAt, lastAlertKind: "repeated_failures" })
    ).toBe("push_silent")
  })

  it("a quieted alert does not fall through to a lower-priority kind", () => {
    const lastAlertAt = new Date(NOW.getTime() - HOUR)
    const input = { ...healthy, consecutiveFailures: 5, pollCreatedLast24h: 2, lastAlertAt }
    expect(pickShopeeAlert({ ...input, needsReconnect: true, lastAlertKind: "needs_reconnect" })).toBeNull()
    expect(pickShopeeAlert({ ...input, lastAlertKind: "repeated_failures" })).toBeNull()
  })

  it("alerts again once the same kind is 24 hours old or older", () => {
    const lastAlertAt = new Date(NOW.getTime() - 24 * HOUR)
    expect(pickShopeeAlert({ ...healthy, needsReconnect: true, lastAlertAt, lastAlertKind: "needs_reconnect" })).toBe(
      "needs_reconnect"
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

    await sendShopeeAlert("needs_reconnect", { supabase, store, fetchImpl, now: () => NOW })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("https://api.resend.com/emails")
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer re_test")
    const body = JSON.parse(init.body as string)
    expect(body.from).toBe("Sheepie <alerts@example.com>")
    expect(body.to).toEqual(["a@x.com", "b@x.com"])
    expect(body.subject).toBe("Sheepie Dashboard: Shopee needs reconnecting")
    expect(body.html).toContain("https://dashboard.sheepiesleep.com/more/shopee")
    expect(store.markAlerted).toHaveBeenCalledWith(NOW, "needs_reconnect")
  })

  it("uses the exact subject for each alert", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "alerts@example.com")
    const subjects: Record<string, string> = {}
    for (const alert of ["needs_reconnect", "repeated_failures", "push_silent"] as const) {
      const fetchImpl = okFetch()
      const { supabase } = fakeSupabase({ data: { users: [{ email: "a@x.com" }] }, error: null })
      await sendShopeeAlert(alert, { supabase, store: fakeStore(), fetchImpl, now: () => NOW })
      const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
      subjects[alert] = JSON.parse(init.body as string).subject
    }
    expect(subjects).toEqual({
      needs_reconnect: "Sheepie Dashboard: Shopee needs reconnecting",
      repeated_failures: "Sheepie Dashboard: Shopee sync keeps failing",
      push_silent: "Sheepie Dashboard: no Shopee push received in 24 hours",
    })
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
        previousAlertKind: "repeated_failures",
        now: () => NOW,
      })
    ).rejects.toThrow("Resend failed with 500")
    expect(vi.mocked(store.markAlerted).mock.calls).toEqual([
      [NOW, "push_silent"],
      [previousAlertAt, "repeated_failures"],
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

  it("sends needs_reconnect for a needs_reconnect poll", async () => {
    const { fetchImpl, deps, store } = setup(connection())
    expect(await checkShopeeAlerts({ status: "needs_reconnect", consecutiveFailures: 0 }, deps)).toBe(
      "needs_reconnect"
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(store.markAlerted).toHaveBeenCalledWith(NOW, "needs_reconnect")
  })

  it("sends repeated_failures from the poll's failure count", async () => {
    const { deps } = setup(connection())
    expect(await checkShopeeAlerts({ status: "failed", consecutiveFailures: 3 }, deps)).toBe("repeated_failures")
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

  it("needs_reconnect is sent even within another kind's quiet window", async () => {
    const { deps, fetchImpl, store } = setup(
      connection({ lastAlertAt: new Date(NOW.getTime() - HOUR), lastAlertKind: "push_silent" })
    )
    expect(await checkShopeeAlerts({ status: "needs_reconnect", consecutiveFailures: 4 }, deps)).toBe(
      "needs_reconnect"
    )
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(store.markAlerted).toHaveBeenCalledWith(NOW, "needs_reconnect")
  })

  it("sends nothing when healthy or recently alerted", async () => {
    const healthyRun = setup(connection())
    expect(await checkShopeeAlerts({ status: "ok", consecutiveFailures: 0 }, healthyRun.deps)).toBeNull()
    expect(healthyRun.fetchImpl).not.toHaveBeenCalled()

    const recent = setup(connection({ lastAlertAt: new Date(NOW.getTime() - HOUR), lastAlertKind: "needs_reconnect" }))
    expect(await checkShopeeAlerts({ status: "needs_reconnect", consecutiveFailures: 0 }, recent.deps)).toBeNull()
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
      markAlerted: vi.fn(async (at: Date | null, kind: ShopeeAlert | null) => {
        lastAlertAt = at
        lastAlertKind = kind
      }),
    })
    const fetchImpl = okFetch()
    let clock = NOW
    const deps = { supabase, store, fetchImpl, now: () => clock }
    const failed = { status: "needs_reconnect", consecutiveFailures: 0 } as const

    expect(await checkShopeeAlerts(failed, deps)).toBe("needs_reconnect")
    clock = new Date(NOW.getTime() + 15 * 60 * 1000)
    expect(await checkShopeeAlerts(failed, deps)).toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("passes the connection's previous last_alert_at and kind so a failed send restores them", async () => {
    const previous = new Date(NOW.getTime() - 30 * HOUR)
    const { deps, store } = setup(connection({ lastAlertAt: previous, lastAlertKind: "repeated_failures" }))
    deps.fetchImpl = vi.fn(async () => new Response("no", { status: 503 }))
    await expect(checkShopeeAlerts({ status: "needs_reconnect", consecutiveFailures: 0 }, deps)).rejects.toThrow()
    expect(store.markAlerted).toHaveBeenLastCalledWith(previous, "repeated_failures")
  })

  it("returns null when the connection row is gone", async () => {
    const { deps, fetchImpl } = setup(null)
    expect(await checkShopeeAlerts({ status: "failed", consecutiveFailures: 5 }, deps)).toBeNull()
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
