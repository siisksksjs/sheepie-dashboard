"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { Product } from "@/lib/types/database.types"

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

  return { success: true, data }
}

export async function getProjectedRevenue() {
  const supabase = await createClient()

  try {
    // Get all products with their current stock from stock_on_hand view
    const { data: products, error: productsError } = await supabase
      .from("stock_on_hand")
      .select("sku, name, variant, current_stock, status")
      .eq("status", "active")

    console.log("Products query result:", { products, productsError, count: products?.length })

    if (productsError) {
      console.error("Error fetching products:", JSON.stringify(productsError))
      return {
        total_projected_revenue: 0,
        products_projection: [],
      }
    }

    if (!products || products.length === 0) {
      console.log("No products found in database")
      return {
        total_projected_revenue: 0,
        products_projection: [],
      }
    }

    console.log(`Found ${products.length} active products`)

    // For each product, calculate avg revenue per unit from order history
    const projectionsPromises = products.map(async (product) => {
      // Get all line items for this product from paid/shipped orders
      const { data: orders, error: ordersError } = await supabase
        .from("orders")
        .select(`
          id,
          status,
          channel_fees,
          order_line_items!inner(
            quantity,
            selling_price,
            sku
          )
        `)
        .in("status", ["paid", "shipped"])
        .eq("order_line_items.sku", product.sku)

      if (ordersError) {
        console.error(`Error fetching orders for ${product.sku}:`, JSON.stringify(ordersError))
      }

      console.log(`Product ${product.sku}: found ${orders?.length || 0} orders`)

      if (ordersError || !orders || orders.length === 0) {
        return {
          sku: product.sku,
          name: product.name,
          variant: product.variant,
          current_stock: product.current_stock,
          total_units_sold: 0,
          avg_revenue_per_unit: 0,
          projected_revenue: 0,
        }
      }

      // Calculate totals from all line items across all orders
      let totalRevenue = 0
      let totalUnitsSold = 0

      orders.forEach((order: any) => {
        // Each order has order_line_items array
        if (Array.isArray(order.order_line_items)) {
          // First, calculate total order value to allocate channel fees proportionally
          const totalOrderValue = order.order_line_items.reduce((sum: number, item: any) => {
            return sum + (item.selling_price * item.quantity)
          }, 0)

          order.order_line_items.forEach((item: any) => {
            // Only count items matching this product's SKU
            if (item.sku === product.sku) {
              const itemTotalPrice = item.selling_price * item.quantity

              // Allocate channel fees proportionally based on this item's contribution to total order
              let allocatedChannelFee = 0
              if (totalOrderValue > 0 && order.channel_fees) {
                const proportion = itemTotalPrice / totalOrderValue
                allocatedChannelFee = order.channel_fees * proportion
              }

              // Revenue = selling price - allocated channel fee
              const itemRevenue = itemTotalPrice - allocatedChannelFee
              totalRevenue += itemRevenue
              totalUnitsSold += item.quantity
            }
          })
        }
      })

      const avgRevenuePerUnit = totalUnitsSold > 0 ? totalRevenue / totalUnitsSold : 0
      const projectedRevenue = product.current_stock * avgRevenuePerUnit

      console.log(`Product ${product.sku} calculation:`, {
        totalUnitsSold,
        totalRevenue,
        avgRevenuePerUnit,
        currentStock: product.current_stock,
        projectedRevenue
      })

      return {
        sku: product.sku,
        name: product.name,
        variant: product.variant,
        current_stock: product.current_stock,
        total_units_sold: totalUnitsSold,
        avg_revenue_per_unit: avgRevenuePerUnit,
        projected_revenue: projectedRevenue,
      }
    })

    const productsProjection = await Promise.all(projectionsPromises)

    console.log("Projections calculated:", {
      totalProducts: productsProjection.length,
      withRevenue: productsProjection.filter(p => p.projected_revenue > 0).length
    })

    // Calculate total
    const totalProjectedRevenue = productsProjection.reduce(
      (sum, p) => sum + p.projected_revenue,
      0
    )

    console.log("Total projected revenue:", totalProjectedRevenue)

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
