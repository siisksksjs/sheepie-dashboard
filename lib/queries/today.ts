import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import { getKpiWorkspace, type KpiProductRow } from "@/lib/actions/kpi"
import { getReorderRecommendations } from "@/lib/actions/orders"
import { getStockOnHand } from "@/lib/actions/inventory"
import { getListingImageMap } from "@/lib/actions/quick-log"
import { calculateSalesOrder, resolveSalesUnitCost, type SalesPackSize } from "@/supabase/functions/_shared/sales-metrics"
import type { Channel } from "@/lib/types/database.types"

export type SkyOrder = {
  id: string
  orderId: string
  channel: Channel
  createdAt: string
  units: number
  gmv: number
  summary: string
  imageUrl: string | null
  imageSku: string
  imageName: string
}

export type StockLine = {
  sku: string
  name: string
  stock: number
  reorderAt: number | null
  needsReorder: boolean
  imageUrl: string | null
}

export type TodayData = {
  today: string
  hourNow: number
  orders: SkyOrder[]
  totals: { orders: number; units: number; gmv: number; revenue: number; profit: number; costComplete: boolean }
  month: {
    key: string
    label: string
    elapsed: number
    targetGmv: number
    actualGmv: number
    targetUnits: number
    actualUnits: number
  }
  productKpis: Array<KpiProductRow & { imageUrl: string | null }>
  stock: StockLine[]
  reorder: Awaited<ReturnType<typeof getReorderRecommendations>>
  byChannel: { channel: Channel; orders: number; gmv: number }[]
}

type TodayOrderRow = {
  id: string
  order_id: string
  channel: Channel
  created_at: string
  channel_fees: number | null
  order_line_items: { sku: string; pack_size: string | null; quantity: number; selling_price: number; cost_per_unit_snapshot: number | null }[] | null
}

function jakartaParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now)
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00"
  const hour = Number(g("hour")) % 24
  return { date: `${g("year")}-${g("month")}-${g("day")}`, hour: hour + Number(g("minute")) / 60 }
}

export async function getTodayData(now = new Date()): Promise<TodayData> {
  const supabase = await createClient()
  const { date: today, hour } = jakartaParts(now)
  const monthKey = today.slice(0, 7)

  const [{ data: rows, error }, products, kpi, stockRows, reorder, images] = await Promise.all([
    fetchAllRows<TodayOrderRow>(() =>
      supabase
        .from("orders")
        .select("id, order_id, channel, created_at, channel_fees, order_line_items(sku, pack_size, quantity, selling_price, cost_per_unit_snapshot)")
        .eq("order_date", today)
        .in("status", ["paid", "shipped"])
        .order("created_at", { ascending: true }),
    ),
    supabase.from("products").select("sku, name, cost_per_unit"),
    getKpiWorkspace(monthKey),
    getStockOnHand(),
    getReorderRecommendations(),
    getListingImageMap(),
  ])
  if (error) throw new Error(error.message)

  const productBySku = new Map((products.data ?? []).map((p) => [p.sku as string, p]))
  let costComplete = true
  const totals = { orders: 0, units: 0, gmv: 0, revenue: 0, profit: 0 }
  const channelMap = new Map<Channel, { channel: Channel; orders: number; gmv: number }>()

  const orders: SkyOrder[] = rows.map((o) => {
    const items = o.order_line_items ?? []
    const metrics = calculateSalesOrder({
      channelFees: o.channel_fees,
      lines: items.map((i, idx) => ({
        key: String(idx),
        quantity: i.quantity,
        packSize: (i.pack_size ?? "single") as SalesPackSize,
        sellingPrice: Number(i.selling_price),
        unitCost: resolveSalesUnitCost(i.cost_per_unit_snapshot, productBySku.get(i.sku)?.cost_per_unit as number | null | undefined),
      })),
    })
    const t = { ...metrics.totals, units: metrics.lines.reduce((sum, line) => sum + line.units, 0) }
    totals.orders += 1
    totals.units += t.units
    totals.gmv += t.gmv
    totals.revenue += t.revenue
    totals.profit += t.profit
    if (!t.hasCompleteCostData) costComplete = false
    const ch = channelMap.get(o.channel) ?? { channel: o.channel, orders: 0, gmv: 0 }
    ch.orders += 1
    ch.gmv += t.gmv
    channelMap.set(o.channel, ch)
    return {
      id: o.id,
      orderId: o.order_id,
      channel: o.channel,
      imageUrl: items[0] ? images[`${items[0].sku}:${items[0].pack_size ?? "single"}`] ?? images[`${items[0].sku}:single`] ?? null : null,
      imageSku: items[0]?.sku ?? "",
      imageName: (productBySku.get(items[0]?.sku)?.name as string) ?? "Order",
      createdAt: o.created_at,
      units: t.units,
      gmv: t.gmv,
      summary: items.map((i) => `${(productBySku.get(i.sku)?.name as string) ?? i.sku}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(" + "),
    }
  })

  const [y, m] = monthKey.split("-").map(Number)
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const elapsed = Math.min(1, (Number(today.slice(8, 10)) - 1 + hour / 24) / daysInMonth)

  const reorderAtBySku = new Map<string, number>()
  for (const rec of reorder.recommendations) {
    reorderAtBySku.set(rec.sku, Math.max(reorderAtBySku.get(rec.sku) ?? 0, rec.reorderMax))
  }

  const stock: StockLine[] = stockRows
    .filter((s) => !s.is_bundle && s.status === "active")
    .map((s) => {
      const reorderAt = reorderAtBySku.get(s.sku) ?? (s.reorder_point || null)
      return {
        sku: s.sku,
        name: s.name,
        stock: s.current_stock,
        reorderAt,
        needsReorder: reorderAt !== null && s.current_stock <= reorderAt,
        imageUrl: images[`${s.sku}:single`] ?? null,
      }
    })

  return {
    today,
    hourNow: hour,
    orders,
    totals: { ...totals, costComplete },
    month: {
      key: monthKey,
      label: new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(new Date(`${monthKey}-01T00:00:00Z`)),
      elapsed,
      targetGmv: kpi.totals.target_gmv,
      actualGmv: kpi.totals.actual_gmv,
      targetUnits: kpi.totals.target_units,
      actualUnits: kpi.totals.actual_units,
    },
    productKpis: kpi.rows.map((row) => ({
      ...row,
      imageUrl: images[`${row.sku}:single`] ?? null,
    })),
    stock,
    reorder,
    byChannel: [...channelMap.values()].sort((a, b) => b.gmv - a.gmv),
  }
}
