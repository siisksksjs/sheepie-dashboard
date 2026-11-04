import { isValidPackSize } from "@/lib/products/pack-sizes"
import type { PackSize } from "@/lib/types/database.types"
import type { UnmappedShopeeItem } from "./build-order"

/** One `shopee_listing_map` row as the settings page saves it. */
export type ListingMappingInput = {
  item_id: number
  model_id: number
  item_name: string
  model_name: string
  sku: string
  pack_size: PackSize
}

/** A Shopee item/model that open orders are waiting on, listed once. */
export type UnmappedItem = UnmappedShopeeItem & { orderCount: number }

type Validation = { ok: true; value: ListingMappingInput } | { ok: false; error: string }

function isShopeeId(value: unknown, min: number): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= min
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

/** Checks a mapping from the settings form. Shopee uses model_id 0 for items without variants. */
export function validateListingMapping(input: Record<string, unknown>): Validation {
  if (!isShopeeId(input.item_id, 1) || !isShopeeId(input.model_id, 0)) {
    return { ok: false, error: "Shopee 商品编号无效" }
  }
  const sku = text(input.sku)
  if (!sku) return { ok: false, error: "请选择 SKU" }
  const packSize = typeof input.pack_size === "string" ? input.pack_size : ""
  if (!isValidPackSize(packSize)) return { ok: false, error: "请选择有效的包装数量" }

  return {
    ok: true,
    value: {
      item_id: input.item_id,
      model_id: input.model_id,
      item_name: text(input.item_name),
      model_name: text(input.model_name),
      sku,
      pack_size: packSize,
    },
  }
}

type QueueRow = { order_sn: string; reason: string | null; detail: unknown }
type MappedKey = { item_id: number | string; model_id: number | string }

function keyOf(itemId: number | string, modelId: number | string) {
  return `${Number(itemId)}:${Number(modelId)}`
}

function isUnmappedItem(value: unknown): value is UnmappedShopeeItem {
  if (!value || typeof value !== "object") return false
  const item = value as Record<string, unknown>
  return Number.isSafeInteger(item.item_id) && Number.isSafeInteger(item.model_id)
}

/**
 * Flattens open `unmapped_item` queue rows into one entry per Shopee
 * item/model, in first-seen order, leaving out ones that already have a
 * mapping (their orders retry on the next sync).
 */
export function collectUnmappedItems(rows: QueueRow[], mapped: MappedKey[]): UnmappedItem[] {
  const done = new Set(mapped.map((row) => keyOf(row.item_id, row.model_id)))
  const found = new Map<string, UnmappedItem>()

  for (const row of rows) {
    if (row.reason !== "unmapped_item") continue
    const items = (row.detail as { items?: unknown } | null)?.items
    if (!Array.isArray(items)) continue

    const seenInOrder = new Set<string>()
    for (const item of items) {
      if (!isUnmappedItem(item)) continue
      const key = keyOf(item.item_id, item.model_id)
      if (done.has(key) || seenInOrder.has(key)) continue
      seenInOrder.add(key)

      const existing = found.get(key)
      if (existing) existing.orderCount += 1
      else
        found.set(key, {
          item_id: item.item_id,
          model_id: item.model_id,
          item_name: String(item.item_name ?? ""),
          model_name: String(item.model_name ?? ""),
          orderCount: 1,
        })
    }
  }

  return [...found.values()]
}

/** "上次同步" wording for `last_synced_until`. */
export function formatSyncAge(lastSyncedUntil: string | null, now: Date): string {
  if (!lastSyncedUntil) return "从未同步"
  const minutes = Math.floor((now.getTime() - new Date(lastSyncedUntil).getTime()) / 60_000)
  if (minutes < 1) return "刚刚"
  if (minutes < 60) return `${minutes} 分钟前`
  const hours = Math.floor(minutes / 60)
  if (hours < 48) return `${hours} 小时前`
  return `${Math.floor(hours / 24)} 天前`
}
