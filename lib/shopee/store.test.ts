import type { SupabaseClient } from "@supabase/supabase-js"
import { describe, expect, it } from "vitest"

import { createShopeeStore } from "./store"

type Upsert = { table: string; values: Record<string, unknown>; options: Record<string, unknown> }
type Update = { table: string; values: Record<string, unknown>; filters: unknown[][] }

/** Records the `upsert` and `update().eq().in()` calls queue() makes. */
function fakeSupabase() {
  const upserts: Upsert[] = []
  const updates: Update[] = []
  const supabase = {
    from(table: string) {
      return {
        upsert(values: Record<string, unknown>, options: Record<string, unknown>) {
          upserts.push({ table, values, options })
          return Promise.resolve({ error: null })
        },
        update(values: Record<string, unknown>) {
          const update: Update = { table, values, filters: [] }
          updates.push(update)
          const builder = {
            eq: (...args: unknown[]) => (update.filters.push(["eq", ...args]), builder),
            in: (...args: unknown[]) => (update.filters.push(["in", ...args]), builder),
            then: (resolve: (value: { error: null }) => unknown) => resolve({ error: null }),
          }
          return builder
        },
      }
    },
  } as unknown as SupabaseClient
  return { supabase, upserts, updates }
}

describe("createShopeeStore queue", () => {
  it("resolved return_review is not reopened", async () => {
    const { supabase, upserts } = fakeSupabase()

    await createShopeeStore(supabase).queue("A", "return_review", {}, "order-a")

    // INSERT ... ON CONFLICT DO NOTHING: an existing row, resolved or not, is left alone.
    expect(upserts).toHaveLength(1)
    expect(upserts[0].table).toBe("shopee_sync_queue")
    expect(upserts[0].options).toEqual({ onConflict: "order_sn", ignoreDuplicates: true })
    expect(upserts[0].values).toMatchObject({ order_sn: "A", reason: "return_review", order_id: "order-a" })
    expect(upserts[0].values).not.toHaveProperty("resolved_at")
  })

  it("return_review replaces a stale unmapped or error row", async () => {
    const { supabase, updates } = fakeSupabase()

    await createShopeeStore(supabase).queue("A", "return_review", {}, "order-a")

    // Only rows with a retryable reason are converted; an existing return_review row is not matched.
    expect(updates).toHaveLength(1)
    expect(updates[0].table).toBe("shopee_sync_queue")
    expect(updates[0].values).toMatchObject({
      reason: "return_review",
      order_id: "order-a",
      resolved_at: null,
    })
    expect(updates[0].filters).toEqual([
      ["eq", "order_sn", "A"],
      ["in", "reason", ["unmapped_item", "error"]],
    ])
  })

  it("re-queued unmapped and error rows reopen", async () => {
    const { supabase, upserts } = fakeSupabase()
    const store = createShopeeStore(supabase)

    await store.queue("A", "unmapped_item", { items: [] })
    await store.queue("B", "error", { message: "boom" })

    expect(upserts).toHaveLength(2)
    for (const upsert of upserts) {
      expect(upsert.options).toEqual({ onConflict: "order_sn" })
      expect(upsert.values).toMatchObject({ resolved_at: null })
      expect(upsert.values.last_seen_at).toEqual(expect.any(String))
    }
  })
})

describe("createShopeeStore alert helpers", () => {
  it("markAlerted(null, null) clears last_alert_at and last_alert_kind", async () => {
    const { supabase, updates } = fakeSupabase()
    await createShopeeStore(supabase).markAlerted(null, null)
    expect(updates[0].values).toEqual({ last_alert_at: null, last_alert_kind: null })
  })

  it("countRecentSyncedVia counts shopee_api orders since the cutoff by synced_via", async () => {
    const calls: unknown[][] = []
    const rows = [{ synced_via: "push" }, { synced_via: "poll" }, { synced_via: "poll" }, { synced_via: null }]
    const builder = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
      gte: (...args: unknown[]) => (calls.push(["gte", ...args]), builder),
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
    }
    const supabase = {
      from: (table: string) => (calls.push(["from", table]), builder),
    } as unknown as SupabaseClient
    const since = new Date("2026-11-03T08:00:00.000Z")

    expect(await createShopeeStore(supabase).countRecentSyncedVia(since)).toEqual({ push: 1, poll: 2 })
    expect(calls).toContainEqual(["from", "orders"])
    expect(calls).toContainEqual(["eq", "source", "shopee_api"])
    expect(calls).toContainEqual(["gte", "created_at", since.toISOString()])
  })

  it("markAlerted sets last_alert_at and last_alert_kind on the shopee connection", async () => {
    const { supabase, updates } = fakeSupabase()
    const at = new Date("2026-11-04T08:00:00.000Z")
    await createShopeeStore(supabase).markAlerted(at, "push_silent")
    expect(updates).toEqual([
      {
        table: "marketplace_connections",
        values: { last_alert_at: at.toISOString(), last_alert_kind: "push_silent" },
        filters: [["eq", "channel", "shopee"]],
      },
    ])
  })

  it("markPushReceived sets last_push_at on the shopee connection", async () => {
    const { supabase, updates } = fakeSupabase()
    const at = new Date("2026-11-04T09:30:00.000Z")
    await createShopeeStore(supabase).markPushReceived(at)
    expect(updates).toEqual([
      {
        table: "marketplace_connections",
        values: { last_push_at: at.toISOString() },
        filters: [["eq", "channel", "shopee"]],
      },
    ])
  })

  it("getConnection maps last_push_at and last_alert_kind", async () => {
    const row = {
      channel: "shopee",
      shop_id: "555",
      access_token: "a",
      refresh_token: "r",
      access_expires_at: null,
      refresh_expires_at: null,
      sync_start_at: null,
      last_synced_until: null,
      consecutive_failures: 0,
      last_sync_error: null,
      last_alert_at: "2026-11-04T07:00:00.000Z",
      last_alert_kind: "needs_reconnect",
      last_push_at: "2026-11-04T06:00:00.000Z",
      updated_at: "2026-11-04T08:00:00.000Z",
    }
    const builder = {
      select: () => builder,
      eq: () => builder,
      maybeSingle: async () => ({ data: row, error: null }),
    }
    const supabase = { from: () => builder } as unknown as SupabaseClient

    const conn = await createShopeeStore(supabase).getConnection()

    expect(conn).toMatchObject({
      shopId: 555,
      lastAlertAt: new Date("2026-11-04T07:00:00.000Z"),
      lastAlertKind: "needs_reconnect",
      lastPushAt: new Date("2026-11-04T06:00:00.000Z"),
    })
  })
})
