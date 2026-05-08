// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"
import { renderSalesReportEmailHtml } from "../_shared/email-html.ts"
import {
  getCompletedMonthlyReportPeriod,
  getCompletedWeeklyReportPeriod,
} from "../_shared/report-periods.ts"
import { sendEmail } from "../_shared/resend.ts"

type ReportKind = "weekly" | "monthly"

type OrderRow = {
  id: string
  channel: string
  order_date: string
  status: string
  channel_fees: number | null
  order_line_items: Array<{
    sku: string
    quantity: number
    pack_size: "single" | "bundle_2" | "bundle_3" | "bundle_4" | null
    selling_price: number
    cost_per_unit_snapshot: number | null
  }>
}

type ProductRow = {
  sku: string
  name: string
  cost_per_unit: number
}

function getPackMultiplier(packSize: string | null) {
  if (packSize === "bundle_2") return 2
  if (packSize === "bundle_3") return 3
  if (packSize === "bundle_4") return 4
  return 1
}

function uniqueEmails(users: Array<{ email?: string | null }>) {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

async function createReportEventIfMissing(supabase: ReturnType<typeof createClient>, kind: ReportKind, periodStart: string, periodEnd: string) {
  const eventType = kind === "weekly" ? "weekly_sales_report" : "monthly_sales_report"
  const idempotencyKey = `${eventType}:${periodStart}:${periodEnd}`

  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      event_type: eventType,
      idempotency_key: idempotencyKey,
      payload: { periodStart, periodEnd },
    })
    .select("id")
    .single()

  if (!error) return data.id as string
  if (error.code !== "23505") throw new Error(error.message)

  const { data: existing, error: existingError } = await supabase
    .from("notification_events")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .single()

  if (existingError) throw new Error(existingError.message)
  return existing.id as string
}

async function buildReport(supabase: ReturnType<typeof createClient>, periodStart: string, periodEnd: string) {
  const [ordersResult, productsResult, lowStockResult] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        channel,
        order_date,
        status,
        channel_fees,
        order_line_items (
          sku,
          quantity,
          pack_size,
          selling_price,
          cost_per_unit_snapshot
        )
      `)
      .in("status", ["paid", "shipped", "returned"])
      .gte("order_date", `${periodStart}T00:00:00.000+07:00`)
      .lte("order_date", `${periodEnd}T23:59:59.999+07:00`),
    supabase.from("products").select("sku, name, cost_per_unit"),
    supabase
      .from("notification_events")
      .select("payload")
      .eq("event_type", "restock_alert")
      .in("status", ["pending", "sending", "sent", "failed"])
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (ordersResult.error) throw new Error(ordersResult.error.message)
  if (productsResult.error) throw new Error(productsResult.error.message)
  if (lowStockResult.error) throw new Error(lowStockResult.error.message)

  const products = new Map((productsResult.data as ProductRow[]).map((product) => [product.sku, product]))
  const bySku = new Map<string, { sku: string; name: string; unitsSold: number; revenue: number; profit: number }>()
  const byChannel = new Map<string, { channel: string; orders: number; revenue: number; profit: number }>()
  let orders = 0
  let unitsSold = 0
  let revenue = 0
  let cost = 0
  let profit = 0
  let returnedUnits = 0

  for (const order of ordersResult.data as OrderRow[]) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce((sum, item) => sum + item.selling_price * item.quantity, 0)

    if (order.status === "returned") {
      for (const item of lineItems) {
        returnedUnits += item.quantity * getPackMultiplier(item.pack_size)
      }
      continue
    }

    orders += 1
    let orderRevenue = 0
    let orderCost = 0

    for (const item of lineItems) {
      const unitCount = item.quantity * getPackMultiplier(item.pack_size)
      const itemTotal = item.selling_price * item.quantity
      const allocatedFee = totalOrderValue > 0 && order.channel_fees
        ? (order.channel_fees * itemTotal) / totalOrderValue
        : 0
      const itemRevenue = itemTotal - allocatedFee
      const product = products.get(item.sku)
      const unitCost = item.cost_per_unit_snapshot ?? product?.cost_per_unit ?? 0
      const itemCost = unitCost * unitCount
      const itemProfit = itemRevenue - itemCost
      const existingSku = bySku.get(item.sku) || {
        sku: item.sku,
        name: product?.name || item.sku,
        unitsSold: 0,
        revenue: 0,
        profit: 0,
      }

      bySku.set(item.sku, {
        ...existingSku,
        unitsSold: existingSku.unitsSold + unitCount,
        revenue: existingSku.revenue + itemRevenue,
        profit: existingSku.profit + itemProfit,
      })

      unitsSold += unitCount
      orderRevenue += itemRevenue
      orderCost += itemCost
    }

    const orderProfit = orderRevenue - orderCost
    const existingChannel = byChannel.get(order.channel) || {
      channel: order.channel,
      orders: 0,
      revenue: 0,
      profit: 0,
    }
    byChannel.set(order.channel, {
      channel: order.channel,
      orders: existingChannel.orders + 1,
      revenue: existingChannel.revenue + orderRevenue,
      profit: existingChannel.profit + orderProfit,
    })

    revenue += orderRevenue
    cost += orderCost
    profit += orderProfit
  }

  const lowStock = (lowStockResult.data || []).map((row: { payload: Record<string, unknown> }) => ({
    sku: String(row.payload.sku),
    productName: String(row.payload.productName),
    shippingMode: row.payload.shippingMode as "air" | "sea",
    threshold: Number(row.payload.threshold),
    currentStock: Number(row.payload.currentStock),
  }))

  return {
    totals: { orders, unitsSold, revenue, cost, profit, returnedUnits },
    bySku: Array.from(bySku.values()).sort((a, b) => b.revenue - a.revenue),
    byChannel: Array.from(byChannel.values()).sort((a, b) => b.revenue - a.revenue),
    lowStock,
  }
}

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const kind = body.kind === "monthly" ? "monthly" : "weekly"
  const period = kind === "monthly"
    ? getCompletedMonthlyReportPeriod()
    : getCompletedWeeklyReportPeriod()
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const eventId = await createReportEventIfMissing(supabase, kind, period.periodStart, period.periodEnd)

  const { data: existingEvent, error: eventError } = await supabase
    .from("notification_events")
    .select("status")
    .eq("id", eventId)
    .single()

  if (eventError) return jsonResponse({ error: eventError.message }, 500)
  if (existingEvent.status === "sent") return jsonResponse({ sent: 0, skipped: "already sent" })

  await supabase.from("notification_events").update({ status: "sending", error_message: null }).eq("id", eventId)

  try {
    const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) throw new Error(usersError.message)

    const report = await buildReport(supabase, period.periodStart, period.periodEnd)
    const recipients = uniqueEmails(userPage.users)
    const title = kind === "monthly" ? "Monthly sales report" : "Weekly sales report"
    const html = renderSalesReportEmailHtml({
      title,
      periodLabel: period.label,
      ...report,
    })

    await sendEmail({
      to: recipients,
      subject: `${title}: ${period.label}`,
      html,
    })

    await supabase.from("notification_events").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      payload: { periodStart: period.periodStart, periodEnd: period.periodEnd, label: period.label },
    }).eq("id", eventId)

    return jsonResponse({ sent: 1, report: kind, period })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report email failure"
    await supabase.from("notification_events").update({
      status: "failed",
      error_message: message,
    }).eq("id", eventId)

    return jsonResponse({ error: message }, 500)
  }
})
