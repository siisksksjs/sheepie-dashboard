import fs from "node:fs"
import path from "node:path"
import { createClient } from "@supabase/supabase-js"

const MS_PER_DAY = 86_400_000
const PACK_MULTIPLIERS = {
  single: 1,
  bundle_2: 2,
  bundle_3: 3,
  bundle_4: 4,
}

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return

  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue

    const index = trimmed.indexOf("=")
    if (index === -1) continue

    const key = trimmed.slice(0, index)
    let value = trimmed.slice(index + 1)
    if (
      (value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }

    process.env[key] ||= value
  }
}

function parseArgs() {
  const args = process.argv.slice(2)
  const options = {
    from: null,
    to: new Date().toISOString().slice(0, 10),
    lastMonths: null,
  }

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]
    if (arg === "--from") options.from = args[++index]
    else if (arg === "--to") options.to = args[++index]
    else if (arg === "--last-months") options.lastMonths = Number(args[++index])
  }

  if (options.lastMonths && Number.isFinite(options.lastMonths)) {
    const date = new Date(`${options.to}T00:00:00.000Z`)
    date.setUTCMonth(date.getUTCMonth() - options.lastMonths)
    options.from = date.toISOString().slice(0, 10)
  }

  options.from ||= "2026-01-01"
  return options
}

async function fetchAll(queryFactory) {
  const pageSize = 1000
  const rows = []

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await queryFactory().range(from, to)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) break
  }

  return rows
}

function toIsoDay(value) {
  return String(value).slice(0, 10)
}

function calculateInStockDays({ currentStock, startDate, endDate, deltas }) {
  const start = new Date(`${toIsoDay(startDate)}T00:00:00.000Z`)
  const end = new Date(`${toIsoDay(endDate)}T00:00:00.000Z`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0

  const deltaByDate = new Map()
  let postStartDelta = 0

  for (const delta of deltas) {
    const day = toIsoDay(delta.entry_date)
    deltaByDate.set(day, (deltaByDate.get(day) || 0) + Number(delta.quantity || 0))
    postStartDelta += Number(delta.quantity || 0)
  }

  let openingStock = Number(currentStock || 0) - postStartDelta
  let inStockDays = 0

  for (let cursor = start.getTime(); cursor <= end.getTime(); cursor += MS_PER_DAY) {
    const day = new Date(cursor).toISOString().slice(0, 10)
    const dayDelta = deltaByDate.get(day) || 0

    if (openingStock > 0 || openingStock + dayDelta > 0) {
      inStockDays += 1
    }

    openingStock += dayDelta
  }

  return inStockDays
}

function getLineItemUnits(item) {
  return Number(item.quantity || 0) * (PACK_MULTIPLIERS[item.pack_size || "single"] || 1)
}

function buildEffectiveUnitsBySku({ skus, lineItems, bundleCompositions }) {
  const skuSet = new Set(skus)
  const units = new Map(skus.map((sku) => [sku, 0]))
  const compositionsByBundle = new Map()

  for (const composition of bundleCompositions) {
    const existing = compositionsByBundle.get(composition.bundle_sku) || []
    existing.push(composition)
    compositionsByBundle.set(composition.bundle_sku, existing)
  }

  for (const item of lineItems) {
    if (Number(item.selling_price || 0) <= 0) continue

    const itemUnits = getLineItemUnits(item)
    if (skuSet.has(item.sku)) {
      units.set(item.sku, (units.get(item.sku) || 0) + itemUnits)
      continue
    }

    for (const composition of compositionsByBundle.get(item.sku) || []) {
      if (!skuSet.has(composition.component_sku)) continue
      units.set(
        composition.component_sku,
        (units.get(composition.component_sku) || 0) + Number(composition.quantity || 0) * itemUnits,
      )
    }
  }

  return units
}

function formatNumber(value, decimals = 2) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

async function main() {
  loadEnvFile(path.resolve(".env"))
  loadEnvFile(path.resolve(".env.local"))

  const { from, to } = parseArgs()
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_ACCESS_TOKEN
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase env. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN.")
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY && !process.env.SUPABASE_ACCESS_TOKEN) {
    console.warn("Using anon key. If RLS requires authenticated users, set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ACCESS_TOKEN.")
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: process.env.SUPABASE_ACCESS_TOKEN
      ? { headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` } }
      : undefined,
  })

  const [products, stockRows, ledgerRows, orders, bundleCompositions] = await Promise.all([
    fetchAll(() => supabase.from("products").select("sku, name, variant, is_bundle, status").order("sku")),
    fetchAll(() => supabase.from("stock_on_hand").select("sku, current_stock").order("sku")),
    fetchAll(() => supabase
      .from("inventory_ledger")
      .select("entry_date, sku, quantity")
      .gte("entry_date", from)
      .lte("entry_date", to)
      .order("entry_date")),
    fetchAll(() => supabase
      .from("orders")
      .select("order_date, status, order_line_items(sku, quantity, pack_size, selling_price)")
      .in("status", ["paid", "shipped"])
      .gte("order_date", from)
      .lte("order_date", to)
      .order("order_date")),
    fetchAll(() => supabase.from("bundle_compositions").select("bundle_sku, component_sku, quantity")),
  ])

  const sellableProducts = products.filter((product) => product.status === "active" && !product.is_bundle)
  const skus = sellableProducts.map((product) => product.sku)
  const productBySku = new Map(products.map((product) => [product.sku, product]))
  const stockBySku = new Map(stockRows.map((row) => [row.sku, Number(row.current_stock || 0)]))
  const deltasBySku = new Map()

  for (const row of ledgerRows) {
    const existing = deltasBySku.get(row.sku) || []
    existing.push(row)
    deltasBySku.set(row.sku, existing)
  }

  const lineItems = orders.flatMap((order) => order.order_line_items || [])
  const unitsBySku = buildEffectiveUnitsBySku({ skus, lineItems, bundleCompositions })
  const salesDaysBySku = new Map(skus.map((sku) => [sku, new Set()]))
  const ordersBySku = new Map(skus.map((sku) => [sku, 0]))
  const revenueBySku = new Map(skus.map((sku) => [sku, 0]))

  for (const order of orders) {
    const day = toIsoDay(order.order_date)
    for (const item of order.order_line_items || []) {
      if (!salesDaysBySku.has(item.sku)) continue
      salesDaysBySku.get(item.sku).add(day)
      ordersBySku.set(item.sku, (ordersBySku.get(item.sku) || 0) + 1)
      revenueBySku.set(
        item.sku,
        (revenueBySku.get(item.sku) || 0) + Number(item.quantity || 0) * Number(item.selling_price || 0),
      )
    }
  }

  const rows = skus.map((sku) => {
    const unitsSold = unitsBySku.get(sku) || 0
    const inStockDays = calculateInStockDays({
      currentStock: stockBySku.get(sku) || 0,
      startDate: from,
      endDate: to,
      deltas: deltasBySku.get(sku) || [],
    })

    return {
      sku,
      product: productBySku.get(sku)?.name || sku,
      unitsSold,
      orders: ordersBySku.get(sku) || 0,
      salesDays: salesDaysBySku.get(sku)?.size || 0,
      inStockDays,
      currentStock: stockBySku.get(sku) || 0,
      unitsPerInStockDay: inStockDays > 0 ? unitsSold / inStockDays : 0,
      unitsPerInStockWeek: inStockDays > 0 ? (unitsSold / inStockDays) * 7 : 0,
      revenue: revenueBySku.get(sku) || 0,
    }
  }).sort((a, b) => b.unitsSold - a.unitsSold)

  console.log(`Live sales while in stock: ${from} to ${to}`)
  console.table(rows.map((row) => ({
    SKU: row.sku,
    Product: row.product,
    Units: row.unitsSold,
    Orders: row.orders,
    "Sales days": row.salesDays,
    "In-stock days": row.inStockDays,
    "Units/day": formatNumber(row.unitsPerInStockDay, 3),
    "Units/week": formatNumber(row.unitsPerInStockWeek, 2),
    "Current stock": row.currentStock,
    Revenue: formatNumber(row.revenue, 0),
  })))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
