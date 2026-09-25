"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { BundleComposition, MonthlyKpiTarget, OrderLineItem, Product } from "@/lib/types/database.types"
import { buildKpiActuals, KPI_BASE_SKUS } from "@/lib/kpi/workspace"
import { KPI_VARIANT_SKUS } from "@/supabase/functions/_shared/kpi-skus"
import { formatJakartaDate } from "@/lib/bio-analytics/range"

const KPI_BASE_SKU_SET = new Set<string>(KPI_BASE_SKUS)
const KPI_BASE_SKU_ORDER = new Map<string, number>(
  KPI_BASE_SKUS.map((sku, index) => [sku, index]),
)

export type KpiProductRow = {
  sku: string
  name: string
  variant: string | null
  /** Colour-variant SKUs whose sales count toward this row. */
  variant_skus: string[]
  target_units: number
  target_gmv: number
  actual_units: number
  actual_gmv: number
  actual_revenue: number
}

export type KpiWorkspace = {
  month: string
  rows: KpiProductRow[]
  totals: {
    target_units: number
    target_gmv: number
    actual_units: number
    actual_gmv: number
    actual_revenue: number
    units_progress: number
    gmv_progress: number
    overall_progress: number
  }
}

type SaveKpiInput = {
  month: string
  rows: Array<{
    sku: string
    target_units: number
    target_gmv: number
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
  const bundleCompositions = (bundleCompositionsResult.data || []) as Pick<
    BundleComposition,
    "bundle_sku" | "component_sku" | "quantity"
  >[]
  const actuals = buildKpiActuals({ orders, products: productCatalog, bundleCompositions })

  const rows = products
    .map((product) => {
      const target = targetsBySku.get(product.sku)
      const actual = actuals.bySku.get(product.sku) || { actual_units: 0, actual_gmv: 0, actual_revenue: 0 }

      return {
        sku: product.sku,
        name: product.name,
        variant: product.variant,
        variant_skus: Object.keys(KPI_VARIANT_SKUS).filter((sku) => KPI_VARIANT_SKUS[sku] === product.sku),
        target_units: target?.target_units || 0,
        target_gmv: Number(target?.target_gmv || 0),
        ...actual,
      }
    })
    .sort((a, b) => (KPI_BASE_SKU_ORDER.get(a.sku) ?? 999) - (KPI_BASE_SKU_ORDER.get(b.sku) ?? 999))

  const totals = rows.reduce(
    (acc, row) => ({
      target_units: acc.target_units + row.target_units,
      target_gmv: acc.target_gmv + row.target_gmv,
      actual_units: acc.actual_units + row.actual_units,
      actual_gmv: acc.actual_gmv + row.actual_gmv,
      actual_revenue: acc.actual_revenue + row.actual_revenue,
    }),
    { target_units: 0, target_gmv: 0, actual_units: 0, actual_gmv: 0, actual_revenue: 0 },
  )

  const unitsProgress = progressPercent(totals.actual_units, totals.target_units)
  const gmvProgress = progressPercent(totals.actual_gmv, totals.target_gmv)

  return {
    month: monthKey,
    rows,
    totals: {
      ...totals,
      units_progress: unitsProgress,
      gmv_progress: gmvProgress,
      overall_progress: (unitsProgress + gmvProgress) / 2,
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
      target_gmv: clampNumber(row.target_gmv),
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
  return formatJakartaDate(new Date()).slice(0, 7)
}

export async function getCurrentMonth() {
  return getCurrentMonthKey()
}
