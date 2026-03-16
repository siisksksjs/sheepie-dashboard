"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { cache } from "react"
import type { Product } from "@/lib/types/database.types"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"

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
    console.error("Error fetching product:", error)
    return null
  }

  return data as Product
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

  revalidatePath("/products")
  revalidatePath("/dashboard")

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

  revalidatePath("/products")
  revalidatePath("/dashboard")

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
