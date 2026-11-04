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
