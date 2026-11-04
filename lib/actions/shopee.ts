"use server"

import { revalidatePath } from "next/cache"

import { createSyncDeps } from "@/lib/shopee/deps"
import { collectUnmappedItems, validateListingMapping, type ListingMappingInput, type UnmappedItem } from "@/lib/shopee/settings-actions"
import { pollShopeeOrders, type PollResult } from "@/lib/shopee/sync"
import { createClient } from "@/lib/supabase/server"
import type { PackSize } from "@/lib/types/database.types"

const PAGE = "/more/shopee"

/** `get_shopee_connection_status()`: the connection without its tokens. */
export type ShopeeConnectionStatus = {
  connected: boolean
  shop_id: number | null
  refresh_expires_at: string | null
  sync_start_at: string | null
  last_synced_until: string | null
  consecutive_failures: number
  last_sync_error: string | null
}

export type ShopeeListingMapping = ListingMappingInput

/** An open return_review / error row in `shopee_sync_queue`. */
export type ShopeeQueueItem = {
  order_sn: string
  reason: "return_review" | "error"
  order_id: string | null
  message: string | null
}

export type ShopeeSettings = {
  status: ShopeeConnectionStatus
  mappings: ShopeeListingMapping[]
  unmappedItems: UnmappedItem[]
  queue: ShopeeQueueItem[]
  products: { sku: string; name: string; variant: string | null; status: string }[]
}

type ActionResult = { success: true; message?: string } | { success: false; error: string }

const SIGN_IN_AGAIN = "请重新登录"

async function signedInClient() {
  const supabase = await createClient()
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()
  return error || !user ? null : supabase
}

/** Everything the settings page shows, read through the signed-in user's client. */
export async function getShopeeSettings(): Promise<ShopeeSettings> {
  const supabase = await signedInClient()
  if (!supabase) throw new Error(SIGN_IN_AGAIN)

  const [statusResult, mapResult, queueResult, productsResult] = await Promise.all([
    supabase.rpc("get_shopee_connection_status"),
    supabase
      .from("shopee_listing_map")
      .select("item_id, model_id, item_name, model_name, sku, pack_size")
      .order("item_name")
      .order("model_name"),
    supabase
      .from("shopee_sync_queue")
      .select("order_sn, reason, detail, order_id, last_seen_at")
      .is("resolved_at", null)
      .order("last_seen_at", { ascending: false }),
    supabase.from("products").select("sku, name, variant, status").order("name"),
  ])
  for (const result of [statusResult, mapResult, queueResult, productsResult]) {
    if (result.error) throw new Error(`读取 Shopee 设置失败：${result.error.message}`)
  }

  const rawStatus = (statusResult.data as (Omit<ShopeeConnectionStatus, "shop_id"> & { shop_id: number | string | null })[])[0]
  const status: ShopeeConnectionStatus = {
    ...rawStatus,
    shop_id: rawStatus.shop_id === null ? null : Number(rawStatus.shop_id),
  }

  // A row without a sku or pack size does not map anything yet (the sync skips it too).
  const mappings: ShopeeListingMapping[] = (mapResult.data ?? [])
    .filter((row) => row.sku && row.pack_size)
    .map((row) => ({
      item_id: Number(row.item_id),
      model_id: Number(row.model_id),
      item_name: row.item_name ?? "",
      model_name: row.model_name ?? "",
      sku: row.sku,
      pack_size: row.pack_size as PackSize,
    }))

  const queueRows = queueResult.data ?? []
  const queue: ShopeeQueueItem[] = queueRows
    .filter((row) => row.reason === "return_review" || row.reason === "error")
    .map((row) => ({
      order_sn: row.order_sn,
      reason: row.reason,
      order_id: row.order_id,
      message: typeof row.detail?.message === "string" ? row.detail.message : null,
    }))

  return {
    status,
    mappings,
    unmappedItems: collectUnmappedItems(queueRows, mappings),
    queue,
    products: productsResult.data ?? [],
  }
}

/** The go-live switch. From now on Shopee orders sync instead of being logged by hand. */
export async function startShopeeSync(): Promise<ActionResult> {
  const supabase = await signedInClient()
  if (!supabase) return { success: false, error: SIGN_IN_AGAIN }

  const { error } = await supabase.rpc("start_shopee_sync")
  if (error) {
    return {
      success: false,
      error: /not connected/i.test(error.message) ? "请先连接 Shopee" : "开始自动同步失败，请再试一次",
    }
  }

  revalidatePath(PAGE)
  return { success: true, message: "自动同步已开始" }
}

function describePoll(result: PollResult): ActionResult {
  switch (result.status) {
    case "ok": {
      const s = result.summary
      const parts = s ? [`新增 ${s.created}`, `更新 ${s.updated}`, `待处理 ${s.queued}`] : []
      return { success: true, message: `同步完成${parts.length ? `：${parts.join("，")}` : ""}` }
    }
    case "not_connected":
      return { success: false, error: "还没连接 Shopee" }
    case "not_started":
      return { success: false, error: "还没开始自动同步" }
    case "needs_reconnect":
      return { success: false, error: "需要重新连接 Shopee" }
    case "failed":
      return { success: false, error: `同步失败：${result.error ?? "未知错误"}` }
  }
}

/** Catch-up sync on demand. Never refreshes tokens: only the cron poll does. */
export async function syncShopeeNow(): Promise<ActionResult> {
  if (!(await signedInClient())) return { success: false, error: SIGN_IN_AGAIN }

  let result: PollResult
  try {
    result = await pollShopeeOrders(createSyncDeps(), { allowRefresh: false })
  } catch (error) {
    // Client, store and env errors never carry keys or tokens.
    console.error(`Shopee sync now failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    return { success: false, error: "同步失败，请稍后再试" }
  }

  revalidatePath(PAGE)
  return describePoll(result)
}

export async function saveListingMapping(input: {
  item_id: number
  model_id: number
  item_name: string
  model_name: string
  sku: string
  pack_size: PackSize
}): Promise<ActionResult> {
  const checked = validateListingMapping(input)
  if (!checked.ok) return { success: false, error: checked.error }

  const supabase = await signedInClient()
  if (!supabase) return { success: false, error: SIGN_IN_AGAIN }

  const { error } = await supabase.from("shopee_listing_map").upsert(checked.value, { onConflict: "item_id,model_id" })
  if (error) {
    return { success: false, error: error.code === "23503" ? "找不到这个 SKU" : `保存失败：${error.message}` }
  }

  revalidatePath(PAGE)
  return { success: true, message: "已保存，下次同步会重试这些订单" }
}

export async function resolveSyncQueueItem(orderSn: string): Promise<ActionResult> {
  const sn = typeof orderSn === "string" ? orderSn.trim() : ""
  if (!sn) return { success: false, error: "订单编号无效" }

  const supabase = await signedInClient()
  if (!supabase) return { success: false, error: SIGN_IN_AGAIN }

  const { error } = await supabase
    .from("shopee_sync_queue")
    .update({ resolved_at: new Date().toISOString() })
    .eq("order_sn", sn)
    .is("resolved_at", null)
  if (error) return { success: false, error: `操作失败：${error.message}` }

  revalidatePath(PAGE)
  return { success: true, message: "已标记为处理完毕" }
}
