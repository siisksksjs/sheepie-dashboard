import type { SupabaseClient } from "@supabase/supabase-js"

import type { OrderStatus, PackSize } from "@/lib/types/database.types"
import type { ShopeeAlert } from "./alerts"
import type { ListingKey, ListingMap, ShopeeOrderPayload } from "./build-order"
import type { ShopeeTokens } from "./client"

/** The `marketplace_connections` row for Shopee, in camelCase. */
export type ShopeeConnection = {
  channel: "shopee"
  shopId: number | null
  accessToken: string | null
  refreshToken: string | null
  accessExpiresAt: Date | null
  refreshExpiresAt: Date | null
  syncStartAt: Date | null
  lastSyncedUntil: Date | null
  consecutiveFailures: number
  lastSyncError: string | null
  lastAlertAt: Date | null
  /** Which alert `lastAlertAt` belongs to. */
  lastAlertKind: ShopeeAlert | null
  /** Last verified order-status push for our shop. */
  lastPushAt: Date | null
  updatedAt: Date
}

export type ShopeeQueueReason = "unmapped_item" | "return_review" | "error"

/** The `apply_shopee_order` RPC result, in camelCase. */
export type ApplyResult = {
  action: "created" | "updated" | "unchanged" | "skipped"
  orderId: string | null
  ledgerEntries: number
}

export interface ShopeeStore {
  getConnection(): Promise<ShopeeConnection | null>
  saveTokens(shopId: number, tokens: ShopeeTokens): Promise<void>
  saveCursor(until: Date): Promise<void>
  /** Stores the message and returns the new consecutive failure count. */
  recordFailure(message: string): Promise<number>
  resetFailures(): Promise<void>
  loadListingMap(): Promise<ListingMap>
  /**
   * Upserts on order_sn. Re-queued unmapped_item / error rows reopen.
   * return_review takes over a stale unmapped_item / error row, otherwise only
   * inserts: an existing return_review row is never changed or reopened.
   * `opened` is true when the row was inserted, reopened from resolved, or
   * changed reason; false when it was already open with this reason (a retry).
   */
  queue(
    sn: string,
    reason: ShopeeQueueReason,
    detail: Record<string, unknown>,
    orderId?: string
  ): Promise<{ opened: boolean }>
  /** Resolves only `unmapped_item` / `error` rows; `return_review` is a staff decision. */
  resolveQueue(sn: string): Promise<void>
  openRetryableSns(): Promise<string[]>
  findOrder(sn: string): Promise<{ id: string; status: OrderStatus } | null>
  applyOrder(payload: ShopeeOrderPayload, via: "push" | "poll"): Promise<ApplyResult>
  /** Shopee API orders created since `since`, counted by how they arrived. */
  countRecentSyncedVia(since: Date): Promise<{ push: number; poll: number }>
  /**
   * Sets `last_alert_at` and `last_alert_kind` (nulls clear them), so the same
   * alert is not repeated within 24 hours.
   */
  markAlerted(at: Date | null, kind: ShopeeAlert | null): Promise<void>
  /** Sets `last_push_at`: a verified order-status push for our shop arrived. */
  markPushReceived(at: Date): Promise<void>
}

const CHANNEL = "shopee"
const RETRYABLE_REASONS: ShopeeQueueReason[] = ["unmapped_item", "error"]

type ConnectionRow = {
  channel: "shopee"
  shop_id: number | string | null
  access_token: string | null
  refresh_token: string | null
  access_expires_at: string | null
  refresh_expires_at: string | null
  sync_start_at: string | null
  last_synced_until: string | null
  consecutive_failures: number
  last_sync_error: string | null
  last_alert_at: string | null
  last_alert_kind: ShopeeAlert | null
  last_push_at: string | null
  updated_at: string
}

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

function fail(action: string, error: { message: string }): never {
  throw new Error(`Shopee store ${action} failed: ${error.message}`)
}

export function createShopeeStore(supabase: SupabaseClient): ShopeeStore {
  return {
    async getConnection() {
      const { data, error } = await supabase
        .from("marketplace_connections")
        .select("*")
        .eq("channel", CHANNEL)
        .maybeSingle<ConnectionRow>()
      if (error) fail("getConnection", error)
      if (!data) return null
      return {
        channel: data.channel,
        shopId: data.shop_id === null ? null : Number(data.shop_id),
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        accessExpiresAt: toDate(data.access_expires_at),
        refreshExpiresAt: toDate(data.refresh_expires_at),
        syncStartAt: toDate(data.sync_start_at),
        lastSyncedUntil: toDate(data.last_synced_until),
        consecutiveFailures: data.consecutive_failures,
        lastSyncError: data.last_sync_error,
        lastAlertAt: toDate(data.last_alert_at),
        lastAlertKind: data.last_alert_kind,
        lastPushAt: toDate(data.last_push_at),
        updatedAt: new Date(data.updated_at),
      }
    },

    async saveTokens(shopId, tokens) {
      const { error } = await supabase.from("marketplace_connections").upsert(
        {
          channel: CHANNEL,
          shop_id: shopId,
          access_token: tokens.accessToken,
          refresh_token: tokens.refreshToken,
          access_expires_at: tokens.accessExpiresAt.toISOString(),
          refresh_expires_at: tokens.refreshExpiresAt.toISOString(),
        },
        { onConflict: "channel" }
      )
      if (error) fail("saveTokens", error)
    },

    async saveCursor(until) {
      const { error } = await supabase
        .from("marketplace_connections")
        .update({ last_synced_until: until.toISOString() })
        .eq("channel", CHANNEL)
      if (error) fail("saveCursor", error)
    },

    async recordFailure(message) {
      const { data, error } = await supabase
        .from("marketplace_connections")
        .select("consecutive_failures")
        .eq("channel", CHANNEL)
        .maybeSingle<{ consecutive_failures: number }>()
      if (error) fail("recordFailure", error)
      const count = (data?.consecutive_failures ?? 0) + 1

      const { error: updateError } = await supabase
        .from("marketplace_connections")
        .update({ consecutive_failures: count, last_sync_error: message })
        .eq("channel", CHANNEL)
      if (updateError) fail("recordFailure", updateError)
      return count
    },

    async resetFailures() {
      const { error } = await supabase
        .from("marketplace_connections")
        .update({ consecutive_failures: 0, last_sync_error: null })
        .eq("channel", CHANNEL)
      if (error) fail("resetFailures", error)
    },

    async loadListingMap() {
      const { data, error } = await supabase
        .from("shopee_listing_map")
        .select("item_id, model_id, sku, pack_size")
        .not("sku", "is", null)
        .not("pack_size", "is", null)
      if (error) fail("loadListingMap", error)

      const map: ListingMap = new Map()
      for (const row of (data ?? []) as { item_id: number; model_id: number; sku: string; pack_size: PackSize }[]) {
        const key: ListingKey = `${Number(row.item_id)}:${Number(row.model_id)}`
        map.set(key, { sku: row.sku, pack_size: row.pack_size })
      }
      return map
    },

    async queue(sn, reason, detail, orderId) {
      const { data: current, error: readError } = await supabase
        .from("shopee_sync_queue")
        .select("reason, resolved_at")
        .eq("order_sn", sn)
        .maybeSingle<{ reason: ShopeeQueueReason; resolved_at: string | null }>()
      if (readError) fail("queue", readError)

      const row = {
        order_sn: sn,
        reason,
        detail,
        ...(orderId ? { order_id: orderId } : {}),
        last_seen_at: new Date().toISOString(),
      }
      if (reason !== "return_review") {
        // A re-queued unmapped_item / error row reopens.
        const { error } = await supabase
          .from("shopee_sync_queue")
          .upsert({ ...row, resolved_at: null }, { onConflict: "order_sn" })
        if (error) fail("queue", error)
        return { opened: !current || current.resolved_at !== null || current.reason !== reason }
      }

      // A stale unmapped_item / error row for this order becomes the review...
      const { error: convertError } = await supabase
        .from("shopee_sync_queue")
        .update({ ...row, resolved_at: null })
        .eq("order_sn", sn)
        .in("reason", RETRYABLE_REASONS)
      if (convertError) fail("queue", convertError)
      // ...otherwise insert-if-absent, so an existing return_review row (and a
      // staff resolution of it) is never touched.
      const { error } = await supabase
        .from("shopee_sync_queue")
        .upsert(row, { onConflict: "order_sn", ignoreDuplicates: true })
      if (error) fail("queue", error)
      return { opened: current?.reason !== "return_review" }
    },

    async resolveQueue(sn) {
      const { error } = await supabase
        .from("shopee_sync_queue")
        .update({ resolved_at: new Date().toISOString() })
        .eq("order_sn", sn)
        .in("reason", RETRYABLE_REASONS)
        .is("resolved_at", null)
      if (error) fail("resolveQueue", error)
    },

    async openRetryableSns() {
      const { data, error } = await supabase
        .from("shopee_sync_queue")
        .select("order_sn")
        .in("reason", RETRYABLE_REASONS)
        .is("resolved_at", null)
      if (error) fail("openRetryableSns", error)
      return ((data ?? []) as { order_sn: string }[]).map((row) => row.order_sn)
    },

    async findOrder(sn) {
      const { data, error } = await supabase
        .from("orders")
        .select("id, status")
        .eq("order_id", sn)
        .maybeSingle<{ id: string; status: OrderStatus }>()
      if (error) fail("findOrder", error)
      return data ?? null
    },

    async applyOrder(payload, via) {
      const { data, error } = await supabase.rpc("apply_shopee_order", { p_order: payload, p_via: via })
      if (error) fail("applyOrder", error)
      const result = data as { action: ApplyResult["action"]; order_id: string | null; ledger_entries: number }
      return {
        action: result.action,
        orderId: result.order_id,
        ledgerEntries: Number(result.ledger_entries ?? 0),
      }
    },

    async countRecentSyncedVia(since) {
      const { data, error } = await supabase
        .from("orders")
        .select("synced_via")
        .eq("source", "shopee_api")
        .gte("created_at", since.toISOString())
      if (error) fail("countRecentSyncedVia", error)
      const counts = { push: 0, poll: 0 }
      for (const row of (data ?? []) as { synced_via: "push" | "poll" | null }[]) {
        if (row.synced_via === "push") counts.push += 1
        else if (row.synced_via === "poll") counts.poll += 1
      }
      return counts
    },

    async markAlerted(at, kind) {
      const { error } = await supabase
        .from("marketplace_connections")
        .update({ last_alert_at: at ? at.toISOString() : null, last_alert_kind: kind })
        .eq("channel", CHANNEL)
      if (error) fail("markAlerted", error)
    },

    async markPushReceived(at) {
      const { error } = await supabase
        .from("marketplace_connections")
        .update({ last_push_at: at.toISOString() })
        .eq("channel", CHANNEL)
      if (error) fail("markPushReceived", error)
    },
  }
}
