import type { PackSize } from "@/lib/types/database.types"
import type { ShopeeOrderDetail } from "./client"

export type ListingKey = `${number}:${number}`
export type ListingMap = Map<ListingKey, { sku: string; pack_size: PackSize }>

/** Matches the `p_order` argument of the `apply_shopee_order` RPC. */
export type ShopeeOrderPayload = {
  order_sn: string
  status: "paid" | "shipped" | "cancelled"
  external_status: string
  order_date: string
  external_created_at: string
  external_updated_at: string
  lines: {
    sku: string
    pack_size: PackSize
    quantity: number
    selling_price: number
  }[]
}

export type UnmappedShopeeItem = {
  item_id: number
  model_id: number
  item_name: string
  model_name: string
}

export type BuildShopeeOrderResult =
  | { kind: "ok"; payload: ShopeeOrderPayload }
  | { kind: "unmapped"; items: UnmappedShopeeItem[] }

/** Jakarta calendar day (YYYY-MM-DD) for a unix timestamp in seconds. */
export function jakartaDate(unixSeconds: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(unixSeconds * 1000))

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  return `${year}-${month}-${day}`
}

export function buildShopeeOrderPayload(
  detail: ShopeeOrderDetail,
  status: "paid" | "shipped" | "cancelled",
  map: ListingMap
): BuildShopeeOrderResult {
  const lines: ShopeeOrderPayload["lines"] = []
  const unmapped: UnmappedShopeeItem[] = []

  for (const item of detail.item_list) {
    const listing = map.get(`${item.item_id}:${item.model_id}`)
    if (!listing) {
      unmapped.push({
        item_id: item.item_id,
        model_id: item.model_id,
        item_name: item.item_name,
        model_name: item.model_name,
      })
      continue
    }
    lines.push({
      sku: listing.sku,
      pack_size: listing.pack_size,
      quantity: item.model_quantity_purchased,
      // Seller-discounted price per pack, never total_amount (buyer-paid).
      selling_price: item.model_discounted_price,
    })
  }

  if (unmapped.length > 0) return { kind: "unmapped", items: unmapped }

  return {
    kind: "ok",
    payload: {
      order_sn: detail.order_sn,
      status,
      external_status: detail.order_status,
      order_date: jakartaDate(detail.create_time),
      external_created_at: new Date(detail.create_time * 1000).toISOString(),
      external_updated_at: new Date(detail.update_time * 1000).toISOString(),
      lines,
    },
  }
}
