"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { cache } from "react"
import type {
  ChangelogEntryWithItems,
  Channel,
  PackSize,
  Product,
  ProductChannelPackPrice,
  ProductPackSize,
  InventoryPurchaseBatch,
  InventoryPurchaseBatchItem,
} from "@/lib/types/database.types"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"
import type { ProductCogsHistoryEntry } from "@/lib/products/cogs-history"
import { buildProductCogsHistory } from "@/lib/products/cogs-history"
import { PACK_SIZE_OPTIONS } from "@/lib/products/pack-sizes"

type ProductEditWorkspace = {
  product: Product
  packSizes: ProductPackSize[]
  channelPrices: ProductChannelPackPrice[]
  cogsHistory: ProductCogsHistoryEntry[]
}

type ProductRestockCostRow = Pick<
  InventoryPurchaseBatchItem,
  "id" | "batch_id" | "sku" | "quantity" | "unit_cost" | "total_cost" | "created_at"
> & {
  batch: Pick<
    InventoryPurchaseBatch,
    "id" | "entry_date" | "order_date" | "arrival_date" | "shipping_mode" | "vendor" | "notes"
  >
}

function getSupabaseErrorLog(error: unknown) {
  if (!error || typeof error !== "object") {
    return error
  }

  const errorRecord = error as {
    code?: unknown
    message?: unknown
    details?: unknown
    hint?: unknown
  }

  return {
    code: errorRecord.code,
    message: errorRecord.message,
    details: errorRecord.details,
    hint: errorRecord.hint,
  }
}

function revalidateProductPaths(sku?: string) {
  revalidatePath("/products")
  revalidatePath("/dashboard")
  revalidatePath("/orders")
  revalidatePath("/orders/new")

  if (sku) {
    revalidatePath(`/products/${sku}/edit`)
  }
}

export async function getProducts() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching products:", error)
    return []
  }

  return data as Product[]
}

export async function getProductBySku(sku: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("sku", sku)
    .single()

  if (error) {
    console.error("Error fetching product:", {
      sku,
      error: getSupabaseErrorLog(error),
    })
    return null
  }

  return data as Product
}

async function getProductCostChangelogEntries(sku: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("changelog_entries")
    .select(`
      *,
      changelog_items (*)
    `)
    .eq("entity_type", "product")
    .eq("entity_id", sku)
    .order("logged_at", { ascending: false })

  if (error) {
    console.error("Error fetching product changelog entries:", error)
    return [] as ChangelogEntryWithItems[]
  }

  return ((data || []) as ChangelogEntryWithItems[]).map((entry) => ({
    ...entry,
    changelog_items: [...(entry.changelog_items || [])].sort(
      (a, b) => a.display_order - b.display_order,
    ),
  }))
}

async function getProductRestockCostRows(sku: string) {
  const supabase = await createClient()

  const { data: items, error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .select("*")
    .eq("sku", sku)

  if (itemsError) {
    console.error("Error fetching product restock items:", itemsError)
    return [] as ProductRestockCostRow[]
  }

  const typedItems = (items || []) as InventoryPurchaseBatchItem[]
  if (typedItems.length === 0) {
    return [] as ProductRestockCostRow[]
  }

  const batchIds = [...new Set(typedItems.map((item) => item.batch_id))]
  const { data: batches, error: batchesError } = await supabase
    .from("inventory_purchase_batches")
    .select("id, entry_date, order_date, arrival_date, shipping_mode, vendor, notes")
    .in("id", batchIds)

  if (batchesError) {
    console.error("Error fetching product restock batches:", batchesError)
    return [] as ProductRestockCostRow[]
  }

  const batchMap = new Map(
    ((batches || []) as Array<
      Pick<
        InventoryPurchaseBatch,
        "id" | "entry_date" | "order_date" | "arrival_date" | "shipping_mode" | "vendor" | "notes"
      >
    >).map((batch) => [batch.id, batch]),
  )

  return typedItems.flatMap((item) => {
    const batch = batchMap.get(item.batch_id)

    if (!batch) {
      return []
    }

    return [{
      ...item,
      batch,
    }]
  })
}

export async function getProductEditWorkspace(sku: string): Promise<ProductEditWorkspace | null> {
  const supabase = await createClient()

  const [
    { data: product, error: productError },
    { data: packSizes, error: packSizesError },
    { data: channelPrices, error: channelPricesError },
    productCostChanges,
    restockItems,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("sku", sku)
      .single(),
    supabase
      .from("product_pack_sizes")
      .select("*")
      .eq("sku", sku),
    supabase
      .from("product_channel_pack_prices")
      .select("*")
      .eq("sku", sku),
    getProductCostChangelogEntries(sku),
    getProductRestockCostRows(sku),
  ])

  if (productError || !product) {
    console.error("Error fetching product edit workspace:", {
      sku,
      error: getSupabaseErrorLog(productError),
    })
    return null
  }

  if (packSizesError) {
    console.error("Error fetching product pack sizes:", packSizesError)
  }

  if (channelPricesError) {
    console.error("Error fetching product channel prices:", channelPricesError)
  }

  return {
    product: product as Product,
    packSizes: (packSizes || []) as ProductPackSize[],
    channelPrices: (channelPrices || []) as ProductChannelPackPrice[],
    cogsHistory: buildProductCogsHistory({
      product: product as Product,
      productCostChanges,
      restockItems,
    }),
  }
}

export async function getOrderEntryWorkspace() {
  const supabase = await createClient()

  const [
    { data: products, error: productsError },
    { data: packSizes, error: packSizesError },
    { data: channelPrices, error: channelPricesError },
  ] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("product_pack_sizes")
      .select("*")
      .eq("is_enabled", true),
    supabase
      .from("product_channel_pack_prices")
      .select("*"),
  ])

  if (productsError) {
    console.error("Error fetching order-entry products:", productsError)
    return {
      products: [],
      packSizes: [],
      channelPrices: [],
    }
  }

  if (packSizesError) {
    console.error("Error fetching order-entry pack sizes:", packSizesError)
  }

  if (channelPricesError) {
    console.error("Error fetching order-entry channel prices:", channelPricesError)
  }

  return {
    products: (products || []) as Product[],
    packSizes: (packSizes || []) as ProductPackSize[],
    channelPrices: (channelPrices || []) as ProductChannelPackPrice[],
  }
}

export async function createProduct(formData: {
  sku: string
  name: string
  variant: string | null
  cost_per_unit: number
  reorder_point: number
  is_bundle: boolean
  status: 'active' | 'discontinued'
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("products")
    .insert([formData])
    .select()
    .single()

  if (error) {
    console.error("Error creating product:", error)
    return { success: false, error: error.message }
  }

  const defaultPackRows = PACK_SIZE_OPTIONS.map((pack) => ({
    sku: data.sku,
    pack_size: pack.value,
    is_enabled: pack.value === "single",
  }))

  const { error: packSizeError } = await supabase
    .from("product_pack_sizes")
    .upsert(defaultPackRows, { onConflict: "sku,pack_size" })

  if (packSizeError) {
    console.error("Error creating default product pack sizes:", packSizeError)
  }

  revalidateProductPaths(data.sku)

  await safeRecordAutomaticChangelogEntry({
    area: "products",
    action_summary: "Created product",
    entity_type: "product",
    entity_id: data.sku,
    entity_label: `${data.name} (${data.sku})`,
    notes: null,
    items: [
      buildChangeItem("SKU", null, data.sku),
      buildChangeItem("Name", null, data.name),
      buildChangeItem("Variant", null, data.variant),
      buildChangeItem("Cost per unit", null, data.cost_per_unit),
      buildChangeItem("Reorder point", null, data.reorder_point),
      buildChangeItem("Bundle", null, data.is_bundle),
      buildChangeItem("Status", null, data.status),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data }
}

export async function updateProduct(
  sku: string,
  formData: {
    name: string
    variant: string | null
    cost_per_unit: number
    reorder_point: number
    status: 'active' | 'discontinued'
  }
) {
  const supabase = await createClient()

  const previousProduct = await getProductBySku(sku)
  if (!previousProduct) {
    return { success: false, error: "Product not found" }
  }

  // Note: SKU cannot be updated (enforced by DB trigger)
  const { data, error } = await supabase
    .from("products")
    .update(formData)
    .eq("sku", sku)
    .select()
    .single()

  if (error) {
    console.error("Error updating product:", error)
    return { success: false, error: error.message }
  }

  revalidateProductPaths(data.sku)

  const items = [
    buildChangeItem("Name", previousProduct.name, data.name),
    buildChangeItem("Variant", previousProduct.variant, data.variant),
    buildChangeItem("Cost per unit", previousProduct.cost_per_unit, data.cost_per_unit),
    buildChangeItem("Reorder point", previousProduct.reorder_point, data.reorder_point),
    buildChangeItem("Status", previousProduct.status, data.status),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (items.length > 0) {
    await safeRecordAutomaticChangelogEntry({
      area: "products",
      action_summary: "Updated product",
      entity_type: "product",
      entity_id: data.sku,
      entity_label: `${data.name} (${data.sku})`,
      items,
    })
  }

  return { success: true, data }
}

export async function updateProductPackSettings(
  sku: string,
  enabledPackSizes: PackSize[],
) {
  const supabase = await createClient()

  const rows = PACK_SIZE_OPTIONS.map((pack) => ({
    sku,
    pack_size: pack.value,
    is_enabled: enabledPackSizes.includes(pack.value),
  }))

  const { error } = await supabase
    .from("product_pack_sizes")
    .upsert(rows, { onConflict: "sku,pack_size" })

  if (error) {
    console.error("Error updating product pack settings:", error)
    return { success: false, error: error.message }
  }

  revalidateProductPaths(sku)
  return { success: true }
}

export async function updateProductChannelPrices(
  sku: string,
  prices: Array<{
    pack_size: PackSize
    channel: Channel
    default_selling_price: number
  }>,
) {
  const supabase = await createClient()

  const rows = prices
    .filter((row) => Number.isFinite(row.default_selling_price) && row.default_selling_price >= 0)
    .map((row) => ({
      sku,
      pack_size: row.pack_size,
      channel: row.channel,
      default_selling_price: row.default_selling_price,
    }))

  const { error } = await supabase
    .from("product_channel_pack_prices")
    .upsert(rows, { onConflict: "sku,pack_size,channel" })

  if (error) {
    console.error("Error updating product channel prices:", error)
    return { success: false, error: error.message }
  }

  revalidateProductPaths(sku)
  return { success: true }
}

// Internal function that does the actual work (optimized - single query instead of N+1)
async function _getProjectedRevenueInternal() {
  const supabase = await createClient()

  try {
    // Get all products with their current stock from stock_on_hand view
    const { data: products, error: productsError } = await supabase
      .from("stock_on_hand")
      .select("sku, name, variant, current_stock, status")
      .eq("status", "active")

    if (productsError || !products || products.length === 0) {
      return {
        total_projected_revenue: 0,
        products_projection: [],
      }
    }

    // OPTIMIZED: Fetch ALL orders with line items in ONE query instead of N queries
    const { data: allOrders, error: ordersError } = await supabase
      .from("orders")
      .select(`
        id,
        channel_fees,
        order_line_items(
          quantity,
          selling_price,
          sku
        )
      `)
      .in("status", ["paid", "shipped"])

    if (ordersError) {
      console.error("Error fetching orders:", ordersError)
    }

    // Build a map of SKU -> { totalRevenue, totalUnitsSold }
    const skuStats = new Map<string, { totalRevenue: number; totalUnitsSold: number }>()

    // Initialize all product SKUs
    for (const product of products) {
      skuStats.set(product.sku, { totalRevenue: 0, totalUnitsSold: 0 })
    }

    // Process all orders once
    for (const order of allOrders || []) {
      const lineItems = (order as any).order_line_items || []

      // Calculate total order value for proportional fee allocation
      const totalOrderValue = lineItems.reduce((sum: number, item: any) => {
        return sum + (item.selling_price * item.quantity)
      }, 0)

      for (const item of lineItems) {
        const stats = skuStats.get(item.sku)
        if (!stats) continue // Skip if not an active product

        const itemTotalPrice = item.selling_price * item.quantity

        // Allocate channel fees proportionally
        let allocatedChannelFee = 0
        if (totalOrderValue > 0 && order.channel_fees) {
          const proportion = itemTotalPrice / totalOrderValue
          allocatedChannelFee = order.channel_fees * proportion
        }

        const itemRevenue = itemTotalPrice - allocatedChannelFee
        stats.totalRevenue += itemRevenue
        stats.totalUnitsSold += item.quantity
      }
    }

    // Get Cervi-001 stats for fallback (used by Bundle-Cervi when it has no history)
    const cerviStats = skuStats.get("Cervi-001") || { totalRevenue: 0, totalUnitsSold: 0 }
    const cerviAvgRevenue = cerviStats.totalUnitsSold > 0 ? cerviStats.totalRevenue / cerviStats.totalUnitsSold : 0

    // Build projections from the aggregated stats
    const productsProjection = products.map((product) => {
      const stats = skuStats.get(product.sku) || { totalRevenue: 0, totalUnitsSold: 0 }
      let avgRevenuePerUnit = stats.totalUnitsSold > 0 ? stats.totalRevenue / stats.totalUnitsSold : 0

      // For Bundle-Cervi with no sales history, use Cervi-001's avg as fallback
      // (Bundle is essentially Cervi + free CalmiCloud at same price point)
      if (product.sku === "Bundle-Cervi" && stats.totalUnitsSold === 0 && cerviAvgRevenue > 0) {
        avgRevenuePerUnit = cerviAvgRevenue
      }

      const projectedRevenue = product.current_stock * avgRevenuePerUnit

      return {
        sku: product.sku,
        name: product.name,
        variant: product.variant,
        current_stock: product.current_stock,
        total_units_sold: stats.totalUnitsSold,
        avg_revenue_per_unit: avgRevenuePerUnit,
        projected_revenue: projectedRevenue,
      }
    })

    // Calculate total
    const totalProjectedRevenue = productsProjection.reduce(
      (sum, p) => sum + p.projected_revenue,
      0
    )

    // Sort by projected revenue descending
    productsProjection.sort((a, b) => b.projected_revenue - a.projected_revenue)

    return {
      total_projected_revenue: totalProjectedRevenue,
      products_projection: productsProjection,
    }
  } catch (error) {
    console.error("Unexpected error in getProjectedRevenue:", error)
    return {
      total_projected_revenue: 0,
      products_projection: [],
    }
  }
}

// Cached per request (deduplicates multiple calls in same render)
export const getProjectedRevenue = cache(async () => {
  return _getProjectedRevenueInternal()
})
