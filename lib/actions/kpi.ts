"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { BundleComposition, MonthlyKpiTarget, OrderLineItem, Product } from "@/lib/types/database.types"
import { DEFAULT_PACK_SIZE, getPackMultiplier } from "@/lib/products/pack-sizes"

const KPI_BASE_SKUS = ["Cervi-001", "Lumi-001", "Calmi-001"] as const
const KPI_BASE_SKU_SET = new Set<string>(KPI_BASE_SKUS)
const KPI_BASE_SKU_ORDER = new Map<string, number>(
  KPI_BASE_SKUS.map((sku, index) => [sku, index]),
)

export type KpiProductRow = {
  sku: string
  name: string
  variant: string | null
  target_units: number
  target_revenue: number
  actual_units: number
  actual_revenue: number
}

export type KpiWorkspace = {
  month: string
  rows: KpiProductRow[]
  totals: {
    target_units: number
    target_revenue: number
    actual_units: number
    actual_revenue: number
    units_progress: number
    revenue_progress: number
    overall_progress: number
  }
}

type SaveKpiInput = {
  month: string
  rows: Array<{
    sku: string
    target_units: number
    target_revenue: number
  }>
}

type SaveKpiResult =
  | { success: true }
  | { success: false; error: string }

type KpiOrder = {
  channel_fees: number | null
  order_line_items?: Array<Pick<OrderLineItem, "sku" | "quantity" | "pack_size" | "selling_price">>
}

type KpiProductCatalogRow = Pick<Product, "sku" | "name" | "variant" | "is_bundle">

function normalizeMonth(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return null
  }

  return `${value}-01`
}

function getNextMonthStart(month: string) {
  const [year, monthNumber] = month.split("-").map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1))

  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-01`
}

function clampNumber(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }

  return value
}

function progressPercent(actual: number, target: number) {
  if (target <= 0) {
    return actual > 0 ? 100 : 0
  }

  return Math.min((actual / target) * 100, 100)
}

export async function getKpiWorkspace(monthValue: string): Promise<KpiWorkspace> {
  const month = normalizeMonth(monthValue) ?? normalizeMonth(getCurrentMonthKey())!
  const monthKey = month.substring(0, 7)
  const supabase = await createClient()

  const [productsResult, productCatalogResult, targetsResult, ordersResult, bundleCompositionsResult] = await Promise.all([
    supabase
      .from("products")
      .select("sku, name, variant, is_bundle")
      .eq("status", "active")
      .in("sku", KPI_BASE_SKUS)
      .order("name", { ascending: true }),
    supabase
      .from("products")
      .select("sku, name, variant, is_bundle"),
    supabase
      .from("monthly_kpi_targets")
      .select("*")
      .eq("month", month),
    supabase
      .from("orders")
      .select(`
        channel_fees,
        order_line_items (
          sku,
          quantity,
          pack_size,
          selling_price
        )
      `)
      .in("status", ["paid", "shipped"])
      .gte("order_date", month)
      .lt("order_date", getNextMonthStart(monthKey)),
    supabase
      .from("bundle_compositions")
      .select("bundle_sku, component_sku, quantity"),
  ])

  if (productsResult.error) {
    console.error("Error fetching KPI products:", productsResult.error)
  }

  if (targetsResult.error) {
    console.error("Error fetching KPI targets:", targetsResult.error)
  }

  if (productCatalogResult.error) {
    console.error("Error fetching KPI product catalog:", productCatalogResult.error)
  }

  if (ordersResult.error) {
    console.error("Error fetching KPI actuals:", ordersResult.error)
  }

  if (bundleCompositionsResult.error) {
    console.error("Error fetching KPI bundle compositions:", bundleCompositionsResult.error)
  }

  const products = (productsResult.data || []) as KpiProductCatalogRow[]
  const productCatalog = (productCatalogResult.data || []) as KpiProductCatalogRow[]
  const targets = (targetsResult.data || []) as MonthlyKpiTarget[]
  const orders = (ordersResult.data || []) as KpiOrder[]
  const targetsBySku = new Map(targets.map((target) => [target.sku, target]))
  const productsBySku = new Map(productCatalog.map((product) => [product.sku, product]))
  const bundleCompositionsBySku = ((bundleCompositionsResult.data || []) as Pick<
    BundleComposition,
    "bundle_sku" | "component_sku" | "quantity"
  >[]).reduce((groups, composition) => {
    const existing = groups.get(composition.bundle_sku) || []
    existing.push(composition)
    groups.set(composition.bundle_sku, existing)
    return groups
  }, new Map<string, Pick<BundleComposition, "bundle_sku" | "component_sku" | "quantity">[]>())
  const actualsBySku = new Map<string, { actual_units: number; actual_revenue: number }>()

  const addActual = (sku: string, units: number, revenue: number) => {
    if (!KPI_BASE_SKU_SET.has(sku)) {
      return
    }

    const existing = actualsBySku.get(sku) || { actual_units: 0, actual_revenue: 0 }

    actualsBySku.set(sku, {
      actual_units: existing.actual_units + units,
      actual_revenue: existing.actual_revenue + revenue,
    })
  }

  for (const order of orders) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce(
      (sum, item) => sum + ((item.selling_price || 0) * (item.quantity || 0)),
      0,
    )

    for (const item of lineItems) {
      const unitCount = (item.quantity || 0) * getPackMultiplier(item.pack_size ?? DEFAULT_PACK_SIZE)
      const itemTotalPrice = (item.selling_price || 0) * (item.quantity || 0)
      const allocatedChannelFee = totalOrderValue > 0 && order.channel_fees
        ? (order.channel_fees * itemTotalPrice) / totalOrderValue
        : 0
      const itemRevenue = itemTotalPrice - allocatedChannelFee
      const product = productsBySku.get(item.sku)

      if (KPI_BASE_SKU_SET.has(item.sku)) {
        addActual(item.sku, unitCount, itemRevenue)
        continue
      }

      if (!product?.is_bundle) {
        continue
      }

      const componentRows = (bundleCompositionsBySku.get(item.sku) || [])
        .filter((component) => KPI_BASE_SKU_SET.has(component.component_sku))
      const totalComponentUnits = componentRows.reduce(
        (sum, component) => sum + (component.quantity * unitCount),
        0,
      )

      for (const component of componentRows) {
        const componentUnits = component.quantity * unitCount
        const revenueShare = totalComponentUnits > 0
          ? (itemRevenue * componentUnits) / totalComponentUnits
          : 0

        addActual(component.component_sku, componentUnits, revenueShare)
      }
    }
  }

  const rows = products
    .map((product) => {
      const target = targetsBySku.get(product.sku)
      const actual = actualsBySku.get(product.sku) || { actual_units: 0, actual_revenue: 0 }

      return {
        sku: product.sku,
        name: product.name,
        variant: product.variant,
        target_units: target?.target_units || 0,
        target_revenue: Number(target?.target_revenue || 0),
        actual_units: actual.actual_units,
        actual_revenue: actual.actual_revenue,
      }
    })
    .sort((a, b) => (KPI_BASE_SKU_ORDER.get(a.sku) ?? 999) - (KPI_BASE_SKU_ORDER.get(b.sku) ?? 999))

  const totals = rows.reduce(
    (acc, row) => ({
      target_units: acc.target_units + row.target_units,
      target_revenue: acc.target_revenue + row.target_revenue,
      actual_units: acc.actual_units + row.actual_units,
      actual_revenue: acc.actual_revenue + row.actual_revenue,
    }),
    { target_units: 0, target_revenue: 0, actual_units: 0, actual_revenue: 0 },
  )

  const unitsProgress = progressPercent(totals.actual_units, totals.target_units)
  const revenueProgress = progressPercent(totals.actual_revenue, totals.target_revenue)

  return {
    month: monthKey,
    rows,
    totals: {
      ...totals,
      units_progress: unitsProgress,
      revenue_progress: revenueProgress,
      overall_progress: (unitsProgress + revenueProgress) / 2,
    },
  }
}

export async function saveMonthlyKpiTargets(input: SaveKpiInput): Promise<SaveKpiResult> {
  const month = normalizeMonth(input.month)

  if (!month) {
    return { success: false, error: "Invalid month." }
  }

  const rows = input.rows
    .filter((row) => KPI_BASE_SKU_SET.has(row.sku))
    .map((row) => ({
      month,
      sku: row.sku,
      target_units: Math.round(clampNumber(row.target_units)),
      target_revenue: clampNumber(row.target_revenue),
    }))

  const supabase = await createClient()
  const { error } = await supabase
    .from("monthly_kpi_targets")
    .upsert(rows, { onConflict: "month,sku" })

  if (error) {
    console.error("Error saving KPI targets:", error)
    return { success: false, error: error.message || "Failed to save KPI targets." }
  }

  revalidatePath("/kpi")
  return { success: true }
}

function getCurrentMonthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
}

export async function getCurrentMonth() {
  return getCurrentMonthKey()
}
