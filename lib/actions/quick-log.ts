"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { duplicateOrder, updateOrderStatus } from "@/lib/actions/orders"
import { getPackSizeLabel, DEFAULT_PACK_SIZE, type PackSize } from "@/lib/products/pack-sizes"
import type { Channel } from "@/lib/types/database.types"

export type QuickLogLine = {
  sku: string
  name: string
  variant: string | null
  packSize: PackSize
  packLabel: string
  quantity: number
  sellingPrice: number
  imageUrl: string | null
}

export type QuickLogTemplate = {
  key: string
  sourceOrderId: string
  channel: Channel
  lines: QuickLogLine[]
  total: number
  timesThisMonth: number
  timesTotal: number
  lastLoggedOn: string
}

type TemplateOrderRow = {
  id: string
  channel: Channel
  order_date: string
  created_at: string
  order_line_items: { sku: string; pack_size: string | null; quantity: number; selling_price: number }[] | null
}

const LOOKBACK_DAYS = 90

function jakartaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
}

/** Listing thumbnails keyed `${sku}:${packSize}`. */
export async function getListingImageMap(): Promise<Record<string, string>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from("product_pack_sizes").select("sku, pack_size, image_url").not("image_url", "is", null)
  if (error) {
    console.error("Error loading listing images:", error)
    return {}
  }
  return Object.fromEntries((data ?? []).map((r) => [`${r.sku}:${r.pack_size}`, r.image_url as string]))
}

/**
 * The orders you log again and again: identical channel + items + prices from the last 90 days,
 * most frequent first. Each carries the newest matching order as the source to duplicate.
 */
export async function getQuickLogTemplates(): Promise<QuickLogTemplate[]> {
  const supabase = await createClient()
  const today = jakartaToday()
  const since = new Date(`${today}T00:00:00+07:00`)
  since.setUTCDate(since.getUTCDate() - LOOKBACK_DAYS)
  const sinceDay = since.toISOString().slice(0, 10)
  const monthPrefix = today.slice(0, 7)

  const [{ data: orders, error }, { data: products }, images] = await Promise.all([
    fetchAllRows<TemplateOrderRow>(() =>
      supabase
        .from("orders")
        .select("id, channel, order_date, created_at, order_line_items(sku, pack_size, quantity, selling_price)")
        .in("status", ["paid", "shipped"])
        .gte("order_date", sinceDay)
        .order("created_at", { ascending: false })
        .order("id", { ascending: true }),
    ),
    supabase.from("products").select("sku, name, variant, status"),
    getListingImageMap(),
  ])
  if (error) throw new Error(error.message)

  const productBySku = new Map((products ?? []).map((p) => [p.sku as string, p]))
  const templates = new Map<string, QuickLogTemplate>()

  for (const order of orders) {
    const items = order.order_line_items ?? []
    if (items.length === 0) continue
    if (items.some((i) => productBySku.get(i.sku)?.status !== "active")) continue
    const sorted = [...items].sort((a, b) => `${a.sku}${a.pack_size}`.localeCompare(`${b.sku}${b.pack_size}`))
    const key = `${order.channel}|${sorted.map((i) => `${i.sku}:${i.pack_size ?? DEFAULT_PACK_SIZE}:${i.quantity}:${Number(i.selling_price)}`).join(",")}`
    const existing = templates.get(key)
    if (existing) {
      existing.timesTotal += 1
      if (order.order_date.startsWith(monthPrefix)) existing.timesThisMonth += 1
      continue
    }
    const lines: QuickLogLine[] = sorted.map((i) => {
      const pack = (i.pack_size ?? DEFAULT_PACK_SIZE) as PackSize
      const product = productBySku.get(i.sku)
      return {
        sku: i.sku,
        name: (product?.name as string) ?? i.sku,
        variant: (product?.variant as string | null) ?? null,
        packSize: pack,
        packLabel: getPackSizeLabel(pack),
        quantity: i.quantity,
        sellingPrice: Number(i.selling_price),
        imageUrl: images[`${i.sku}:${pack}`] ?? images[`${i.sku}:single`] ?? null,
      }
    })
    templates.set(key, {
      key,
      sourceOrderId: order.id,
      channel: order.channel,
      lines,
      total: lines.reduce((s, l) => s + l.sellingPrice * l.quantity, 0),
      timesThisMonth: order.order_date.startsWith(monthPrefix) ? 1 : 0,
      timesTotal: 1,
      lastLoggedOn: order.order_date,
    })
  }

  return [...templates.values()].sort((a, b) => b.timesTotal - a.timesTotal || b.lastLoggedOn.localeCompare(a.lastLoggedOn)).slice(0, 60)
}

export type QuickLogResult = { success: true; id: string; orderId: string } | { success: false; error: string }

/** Logs a copy of the template's source order, dated today (WIB), as paid. */
export async function quickLogOrder(sourceOrderId: string): Promise<QuickLogResult> {
  const result = await duplicateOrder(sourceOrderId)
  if (!result.success) return { success: false, error: result.error ?? "Couldn't log the order" }
  revalidatePath("/dashboard")
  return { success: true, id: result.data.id, orderId: result.data.order_id }
}

/** Undo = cancel through the normal status flow, which puts the stock back. Nothing is hard-deleted. */
export async function undoQuickLog(orderId: string): Promise<{ success: boolean; error?: string }> {
  const result = await updateOrderStatus(orderId, "cancelled", "paid")
  revalidatePath("/dashboard")
  return result.success ? { success: true } : { success: false, error: (result as { error?: string }).error ?? "Couldn't undo" }
}
