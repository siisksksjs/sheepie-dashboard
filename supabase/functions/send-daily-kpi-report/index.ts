// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"
import { renderDailyKpiReportEmailHtml } from "../_shared/email-html.ts"
import { sendEmail } from "../_shared/resend.ts"

const JAKARTA_TIME_ZONE = "Asia/Jakarta"
const KPI_BASE_SKUS = ["Cervi-001", "Lumi-001", "Calmi-001"]
const KPI_BASE_SKU_SET = new Set(KPI_BASE_SKUS)
const KPI_BASE_SKU_ORDER = new Map(KPI_BASE_SKUS.map((sku, index) => [sku, index]))

type OrderRow = {
  channel?: string
  order_date?: string
  channel_fees: number | null
  order_line_items: Array<{
    sku: string
    quantity: number
    pack_size: "single" | "bundle_2" | "bundle_3" | "bundle_4" | null
    selling_price: number
  }>
}

function uniqueEmails(users: Array<{ email?: string | null }>) {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

function getPackMultiplier(packSize: string | null) {
  if (packSize === "bundle_2") return 2
  if (packSize === "bundle_3") return 3
  if (packSize === "bundle_4") return 4
  return 1
}

function getJakartaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  }
}

function dateKeyFromParts(parts: { year: number; month: number; day: number }) {
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`
}

function addMonths(monthStart: string, months: number) {
  const [year, month] = monthStart.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1 + months, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function addDays(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number)
  const date = new Date(Date.UTC(year, month - 1, day + days))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function progressPercent(actual: number, target: number) {
  if (target <= 0) return actual > 0 ? 100 : 0
  return Math.min((actual / target) * 100, 100)
}

function formatProductName(row: { sku: string; name: string }) {
  const sku = row.sku.toLowerCase()
  if (sku.startsWith("cervi")) return "CerviCloud"
  if (sku.startsWith("lumi")) return "LumiCloud"
  if (sku.startsWith("calmi")) return "CalmiCloud"
  return row.name
}

function formatChannel(value: string | undefined) {
  if (value === "shopee") return "Shopee"
  if (value === "tokopedia") return "Tokopedia"
  if (value === "tiktok") return "TikTok"
  if (value === "offline") return "Offline"
  return value || "Unknown"
}

async function createDailyKpiEventIfMissing(supabase: ReturnType<typeof createClient>, dateKey: string) {
  const idempotencyKey = `daily_kpi_report:${dateKey}`
  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      event_type: "daily_kpi_report",
      idempotency_key: idempotencyKey,
      payload: { date: dateKey },
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

async function buildDailyKpiReport(supabase: ReturnType<typeof createClient>, now = new Date()) {
  const jakarta = getJakartaDateParts(now)
  const dateKey = dateKeyFromParts(jakarta)
  const completedSalesDateKey = addDays(dateKey, -1)
  const monthStart = `${jakarta.year}-${String(jakarta.month).padStart(2, "0")}-01`
  const nextMonthStart = addMonths(monthStart, 1)
  const orderQueryStart = completedSalesDateKey < monthStart ? completedSalesDateKey : monthStart
  const daysRemaining = Math.max(1, daysInMonth(jakarta.year, jakarta.month) - jakarta.day + 1)

  const [productsResult, catalogResult, targetsResult, ordersResult, compositionsResult] = await Promise.all([
    supabase
      .from("products")
      .select("sku, name, variant, is_bundle")
      .eq("status", "active")
      .in("sku", KPI_BASE_SKUS),
    supabase
      .from("products")
      .select("sku, name, variant, is_bundle"),
    supabase
      .from("monthly_kpi_targets")
      .select("*")
      .eq("month", monthStart),
    supabase
      .from("orders")
      .select(`
        channel,
        order_date,
        channel_fees,
        order_line_items (
          sku,
          quantity,
          pack_size,
          selling_price
        )
      `)
      .in("status", ["paid", "shipped"])
      .gte("order_date", `${orderQueryStart}T00:00:00.000+07:00`)
      .lt("order_date", `${nextMonthStart}T00:00:00.000+07:00`),
    supabase
      .from("bundle_compositions")
      .select("bundle_sku, component_sku, quantity"),
  ])

  for (const result of [productsResult, catalogResult, targetsResult, ordersResult, compositionsResult]) {
    if (result.error) throw new Error(result.error.message)
  }

  const products = productsResult.data || []
  const catalogBySku = new Map((catalogResult.data || []).map((product) => [product.sku, product]))
  const targetsBySku = new Map((targetsResult.data || []).map((target) => [target.sku, target]))
  const compositionsByBundle = new Map<string, Array<{ component_sku: string; quantity: number }>>()
  for (const composition of compositionsResult.data || []) {
    const existing = compositionsByBundle.get(composition.bundle_sku) || []
    existing.push(composition)
    compositionsByBundle.set(composition.bundle_sku, existing)
  }

  const actualsBySku = new Map<string, { units: number; revenue: number }>()
  const dailySalesByProductChannel = new Map<string, {
    label: string
    channel: string
    units: number
    revenue: number
  }>()
  let dailySalesOrders = 0
  let dailySalesUnits = 0
  let dailySalesRevenue = 0
  const addActual = (sku: string, units: number, revenue: number) => {
    if (!KPI_BASE_SKU_SET.has(sku)) return
    const existing = actualsBySku.get(sku) || { units: 0, revenue: 0 }
    actualsBySku.set(sku, {
      units: existing.units + units,
      revenue: existing.revenue + revenue,
    })
  }

  for (const order of ordersResult.data as OrderRow[]) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce((sum, item) => sum + item.selling_price * item.quantity, 0)
    const orderDateKey = order.order_date
      ? dateKeyFromParts(getJakartaDateParts(new Date(order.order_date)))
      : ""
    let orderHasTodaySales = false

    for (const item of lineItems) {
      const unitCount = item.quantity * getPackMultiplier(item.pack_size)
      const itemTotalPrice = item.selling_price * item.quantity
      const allocatedFee = totalOrderValue > 0 && order.channel_fees
        ? (order.channel_fees * itemTotalPrice) / totalOrderValue
        : 0
      const itemRevenue = itemTotalPrice - allocatedFee
      const recordDailySales = (sku: string, label: string, units: number, revenue: number) => {
        if (orderDateKey !== completedSalesDateKey) {
          return
        }

        const key = `${sku}__${order.channel || "unknown"}`
        const existing = dailySalesByProductChannel.get(key) || {
          label,
          channel: formatChannel(order.channel),
          units: 0,
          revenue: 0,
        }

        dailySalesByProductChannel.set(key, {
          ...existing,
          units: existing.units + units,
          revenue: existing.revenue + revenue,
        })
        dailySalesUnits += units
        dailySalesRevenue += revenue
        orderHasTodaySales = true
      }

      if (KPI_BASE_SKU_SET.has(item.sku)) {
        addActual(item.sku, unitCount, itemRevenue)
        recordDailySales(item.sku, formatProductName(catalogBySku.get(item.sku) || { sku: item.sku, name: item.sku }), unitCount, itemRevenue)
        continue
      }

      const product = catalogBySku.get(item.sku)
      if (!product?.is_bundle) continue

      const componentRows = (compositionsByBundle.get(item.sku) || [])
        .filter((component) => KPI_BASE_SKU_SET.has(component.component_sku))
      const totalComponentUnits = componentRows.reduce((sum, component) => sum + component.quantity * unitCount, 0)

      for (const component of componentRows) {
        const componentUnits = component.quantity * unitCount
        const revenueShare = totalComponentUnits > 0 ? (itemRevenue * componentUnits) / totalComponentUnits : 0
        const componentProduct = catalogBySku.get(component.component_sku)
        addActual(component.component_sku, componentUnits, revenueShare)
        recordDailySales(
          component.component_sku,
          formatProductName(componentProduct || { sku: component.component_sku, name: component.component_sku }),
          componentUnits,
          revenueShare,
        )
      }
    }

    if (orderHasTodaySales) {
      dailySalesOrders += 1
    }
  }

  const rows = products
    .map((product) => {
      const target = targetsBySku.get(product.sku)
      const actual = actualsBySku.get(product.sku) || { units: 0, revenue: 0 }
      const targetUnits = Number(target?.target_units || 0)
      const targetRevenue = Number(target?.target_revenue || 0)
      const remainingUnits = Math.max(0, targetUnits - actual.units)
      const remainingRevenue = Math.max(0, targetRevenue - actual.revenue)

      return {
        sku: product.sku,
        name: formatProductName(product),
        targetUnits,
        actualUnits: actual.units,
        targetRevenue,
        actualRevenue: actual.revenue,
        remainingUnits,
        remainingRevenue,
        todayUnitPace: Math.ceil(remainingUnits / daysRemaining),
        todayRevenuePace: remainingRevenue / daysRemaining,
        unitProgress: progressPercent(actual.units, targetUnits),
        revenueProgress: progressPercent(actual.revenue, targetRevenue),
      }
    })
    .sort((a, b) => (KPI_BASE_SKU_ORDER.get(a.sku) ?? 999) - (KPI_BASE_SKU_ORDER.get(b.sku) ?? 999))

  const totalsBase = rows.reduce(
    (acc, row) => ({
      targetUnits: acc.targetUnits + row.targetUnits,
      actualUnits: acc.actualUnits + row.actualUnits,
      targetRevenue: acc.targetRevenue + row.targetRevenue,
      actualRevenue: acc.actualRevenue + row.actualRevenue,
      remainingUnits: acc.remainingUnits + row.remainingUnits,
      remainingRevenue: acc.remainingRevenue + row.remainingRevenue,
    }),
    { targetUnits: 0, actualUnits: 0, targetRevenue: 0, actualRevenue: 0, remainingUnits: 0, remainingRevenue: 0 },
  )

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(
    new Date(`${monthStart}T00:00:00.000+07:00`),
  )
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(now)

  return {
    dateKey,
    dateLabel,
    monthLabel,
    daysRemaining,
    rows,
    dailySales: {
      dateLabel: new Intl.DateTimeFormat("en-US", {
        timeZone: JAKARTA_TIME_ZONE,
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(new Date(`${completedSalesDateKey}T00:00:00.000+07:00`)),
      totalOrders: dailySalesOrders,
      totalUnits: dailySalesUnits,
      totalRevenue: dailySalesRevenue,
      items: Array.from(dailySalesByProductChannel.values()).sort((a, b) => b.revenue - a.revenue),
    },
    totals: {
      ...totalsBase,
      todayUnitPace: Math.ceil(totalsBase.remainingUnits / daysRemaining),
      todayRevenuePace: totalsBase.remainingRevenue / daysRemaining,
      unitProgress: progressPercent(totalsBase.actualUnits, totalsBase.targetUnits),
      revenueProgress: progressPercent(totalsBase.actualRevenue, totalsBase.targetRevenue),
      gmvProgress: progressPercent(totalsBase.actualRevenue, totalsBase.targetRevenue),
    },
  }
}

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const report = await buildDailyKpiReport(supabase)
  const eventId = await createDailyKpiEventIfMissing(supabase, report.dateKey)

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

    const recipients = uniqueEmails(userPage.users)
    const title = "Daily KPI report"
    const html = renderDailyKpiReportEmailHtml({
      title,
      dateLabel: report.dateLabel,
      monthLabel: report.monthLabel,
      daysRemaining: report.daysRemaining,
      totals: report.totals,
      rows: report.rows,
      dailySales: report.dailySales,
    })

    await sendEmail({
      to: recipients,
      subject: `${title}: ${report.dateLabel}`,
      html,
    })

    await supabase.from("notification_events").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      payload: {
        date: report.dateKey,
        monthLabel: report.monthLabel,
        totals: report.totals,
      },
    }).eq("id", eventId)

    return jsonResponse({ sent: 1, date: report.dateKey })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown daily KPI email failure"
    await supabase.from("notification_events").update({
      status: "failed",
      error_message: message,
    }).eq("id", eventId)

    return jsonResponse({ error: message }, 500)
  }
})
