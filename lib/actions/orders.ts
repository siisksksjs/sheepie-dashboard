"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { cache } from "react"
import type { Order, OrderLineItem, Channel, OrderStatus } from "@/lib/types/database.types"
import { createLedgerEntry } from "./inventory"

export async function getOrders(filters?: {
  status?: OrderStatus
  channel?: Channel
  limit?: number
}) {
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select(`
      *,
      order_line_items (
        id,
        sku,
        quantity,
        selling_price
      )
    `)
    .order("order_date", { ascending: false })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  if (filters?.channel) {
    query = query.eq("channel", filters.channel)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching orders:", error)
    return []
  }

  // Fetch all products to get names and costs
  const { data: products } = await supabase
    .from("products")
    .select("sku, name, cost_per_unit")

  const productMap = new Map(products?.map(p => [p.sku, p]) || [])

  // Enhance orders with product details and profit calculation
  const ordersWithDetails = data.map((order: any) => {
    const lineItemsWithDetails = order.order_line_items?.map((item: any) => {
      const product = productMap.get(item.sku)

      return {
        ...item,
        product_name: product?.name || "Unknown",
        cost_per_unit: product?.cost_per_unit || 0,
      }
    }) || []

    // Total selling price
    const totalSellingPrice = lineItemsWithDetails.reduce((sum: number, item: any) =>
      sum + (item.selling_price * item.quantity), 0
    )

    const channelFees = order.channel_fees || 0

    // Revenue = Total Selling Price - Channel Fees
    const revenue = totalSellingPrice - channelFees

    // Total COGS
    const totalCogs = lineItemsWithDetails.reduce((sum: number, item: any) =>
      sum + (item.cost_per_unit * item.quantity), 0
    )

    // Net Profit = Revenue - COGS = (Total Selling Price - Channel Fees) - COGS
    const netProfit = revenue - totalCogs

    return {
      ...order,
      order_line_items: lineItemsWithDetails,
      revenue,
      net_profit: netProfit,
      total_cogs: totalCogs,
    }
  })

  return ordersWithDetails
}

export async function getOrderById(id: string) {
  const supabase = await createClient()

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .single()

  if (orderError) {
    console.error("Error fetching order:", orderError)
    return null
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("order_line_items")
    .select("*")
    .eq("order_id", id)

  if (lineItemsError) {
    console.error("Error fetching line items:", lineItemsError)
    return null
  }

  return {
    order: order as Order,
    lineItems: lineItems as OrderLineItem[],
  }
}

export async function createOrder(formData: {
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  line_items: {
    sku: string
    quantity: number
    selling_price: number
  }[]
}) {
  const supabase = await createClient()

  // Create order
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert([{
      order_id: formData.order_id,
      channel: formData.channel,
      order_date: formData.order_date,
      status: formData.status,
      channel_fees: formData.channel_fees,
      notes: formData.notes,
    }])
    .select()
    .single()

  if (orderError) {
    console.error("Error creating order:", orderError)
    return { success: false, error: orderError.message }
  }

  // Create line items
  const lineItemsToInsert = formData.line_items.map(item => ({
    order_id: order.id,
    sku: item.sku,
    quantity: item.quantity,
    selling_price: item.selling_price,
  }))

  const { error: lineItemsError } = await supabase
    .from("order_line_items")
    .insert(lineItemsToInsert)

  if (lineItemsError) {
    console.error("Error creating line items:", lineItemsError)
    // Rollback: delete the order
    await supabase.from("orders").delete().eq("id", order.id)
    return { success: false, error: lineItemsError.message }
  }

  // If order status is 'paid', generate ledger entries
  if (formData.status === "paid") {
    for (const item of formData.line_items) {
      // Check if this is a bundle
      const { data: product } = await supabase
        .from("products")
        .select("is_bundle")
        .eq("sku", item.sku)
        .single()

      if (product?.is_bundle) {
        // Get bundle components
        const { data: compositions } = await supabase
          .from("bundle_compositions")
          .select("*")
          .eq("bundle_sku", item.sku)

        if (compositions && compositions.length > 0) {
          // Create ledger entries for each component
          for (const comp of compositions) {
            await createLedgerEntry({
              sku: comp.component_sku,
              movement_type: "OUT_SALE",
              quantity: -(comp.quantity * item.quantity), // Component qty × bundle qty
              reference: `Order ${formData.order_id} (Bundle: ${item.sku})`,
            })
          }
        }
      } else {
        // Regular product - create ledger entry as normal
        await createLedgerEntry({
          sku: item.sku,
          movement_type: "OUT_SALE",
          quantity: -item.quantity,
          reference: `Order ${formData.order_id}`,
        })
      }
    }
  }

  revalidatePath("/orders")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")

  return { success: true, data: order }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  previousStatus: OrderStatus
) {
  const supabase = await createClient()

  // Get order details
  const orderData = await getOrderById(orderId)
  if (!orderData) {
    return { success: false, error: "Order not found" }
  }

  const { order, lineItems } = orderData

  // Update order status
  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: newStatus })
    .eq("id", orderId)

  if (updateError) {
    console.error("Error updating order status:", updateError)
    return { success: false, error: updateError.message }
  }

  // Generate ledger entries based on status change
  // Paid → Creates OUT_SALE entries (already done during order creation if status was 'paid')
  // Cancelled → Creates RETURN entries to reverse the sale
  // Returned → Creates RETURN entries to add stock back

  if (previousStatus === "paid" && (newStatus === "cancelled" || newStatus === "returned")) {
    // Reverse the sale by creating RETURN entries
    for (const item of lineItems) {
      // Check if this is a bundle
      const { data: product } = await supabase
        .from("products")
        .select("is_bundle")
        .eq("sku", item.sku)
        .single()

      if (product?.is_bundle) {
        // Get bundle components
        const { data: compositions } = await supabase
          .from("bundle_compositions")
          .select("*")
          .eq("bundle_sku", item.sku)

        if (compositions && compositions.length > 0) {
          // Create RETURN entries for each component
          for (const comp of compositions) {
            await createLedgerEntry({
              sku: comp.component_sku,
              movement_type: "RETURN",
              quantity: comp.quantity * item.quantity,
              reference: `Order ${order.order_id} - ${newStatus === "cancelled" ? "Cancelled" : "Returned"} (Bundle: ${item.sku})`,
            })
          }
        }
      } else {
        // Regular product
        await createLedgerEntry({
          sku: item.sku,
          movement_type: "RETURN",
          quantity: item.quantity,
          reference: `Order ${order.order_id} - ${newStatus === "cancelled" ? "Cancelled" : "Returned"}`,
        })
      }
    }
  }

  if (previousStatus !== "paid" && newStatus === "paid") {
    // Order wasn't paid before, now it is - create OUT_SALE entries
    for (const item of lineItems) {
      // Check if this is a bundle
      const { data: product } = await supabase
        .from("products")
        .select("is_bundle")
        .eq("sku", item.sku)
        .single()

      if (product?.is_bundle) {
        // Get bundle components
        const { data: compositions } = await supabase
          .from("bundle_compositions")
          .select("*")
          .eq("bundle_sku", item.sku)

        if (compositions && compositions.length > 0) {
          // Create ledger entries for each component
          for (const comp of compositions) {
            await createLedgerEntry({
              sku: comp.component_sku,
              movement_type: "OUT_SALE",
              quantity: -(comp.quantity * item.quantity),
              reference: `Order ${order.order_id} (Bundle: ${item.sku})`,
            })
          }
        }
      } else {
        // Regular product
        await createLedgerEntry({
          sku: item.sku,
          movement_type: "OUT_SALE",
          quantity: -item.quantity,
          reference: `Order ${order.order_id}`,
        })
      }
    }
  }

  revalidatePath("/orders")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")

  return { success: true }
}

export async function getOrderStats() {
  const supabase = await createClient()

  const { data: orders } = await supabase.from("orders").select("*")

  const totalOrders = orders?.length || 0
  const paidOrders = orders?.filter(o => o.status === "paid" || o.status === "shipped").length || 0
  const cancelledOrders = orders?.filter(o => o.status === "cancelled").length || 0
  const returnedOrders = orders?.filter(o => o.status === "returned").length || 0

  return {
    totalOrders,
    paidOrders,
    cancelledOrders,
    returnedOrders,
  }
}

async function _getSalesReportInternal(year?: number, month?: number) {
  const supabase = await createClient()

  // Get all paid/shipped orders with their line items
  let query = supabase
    .from("orders")
    .select("*, order_line_items(*)")
    .in("status", ["paid", "shipped"])

  // Apply year/month filters if provided
  if (year && month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  } else if (year) {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  }

  const { data: orders } = await query

  if (!orders) return { byProduct: [], byChannel: [] }

  // Get products for cost lookup
  const { data: products } = await supabase.from("products").select("*")
  const productMap = new Map(products?.map(p => [p.sku, p]) || [])

  // Sales by product
  const productSales = new Map<string, {
    sku: string
    name: string
    variant: string | null
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }>()

  // Sales by channel
  const channelSales = new Map<Channel, {
    channel: Channel
    orders: number
    revenue: number
    fees: number
    cost: number
    profit: number
  }>()

  for (const order of orders) {
    const lineItems = (order as any).order_line_items || []

    // Calculate total order value for proportional fee allocation
    const totalOrderValue = lineItems.reduce((sum: number, item: any) =>
      sum + (item.selling_price * item.quantity), 0
    )

    // By channel
    const existing = channelSales.get(order.channel) || {
      channel: order.channel,
      orders: 0,
      revenue: 0,
      fees: 0,
      cost: 0,
      profit: 0,
    }

    const orderRevenue = totalOrderValue - (order.channel_fees || 0)

    // Calculate total cost for this order
    let orderCost = 0
    for (const item of lineItems) {
      const product = productMap.get(item.sku)
      if (product) {
        orderCost += product.cost_per_unit * item.quantity
      }
    }

    channelSales.set(order.channel, {
      channel: order.channel,
      orders: existing.orders + 1,
      revenue: existing.revenue + orderRevenue,
      fees: existing.fees + (order.channel_fees || 0),
      cost: existing.cost + orderCost,
      profit: existing.profit + (orderRevenue - orderCost),
    })

    // By product - allocate channel fees proportionally
    for (const item of lineItems) {
      const product = productMap.get(item.sku)
      if (!product) continue

      const existing = productSales.get(item.sku) || {
        sku: item.sku,
        name: product.name,
        variant: product.variant,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }

      const itemTotalPrice = item.selling_price * item.quantity

      // Allocate channel fees proportionally
      let allocatedChannelFee = 0
      if (totalOrderValue > 0 && order.channel_fees) {
        const proportion = itemTotalPrice / totalOrderValue
        allocatedChannelFee = order.channel_fees * proportion
      }

      const itemRevenue = itemTotalPrice - allocatedChannelFee
      const itemCost = product.cost_per_unit * item.quantity

      productSales.set(item.sku, {
        sku: item.sku,
        name: product.name,
        variant: product.variant,
        units_sold: existing.units_sold + item.quantity,
        revenue: existing.revenue + itemRevenue,
        cost: existing.cost + itemCost,
        profit: existing.profit + (itemRevenue - itemCost),
      })
    }
  }

  return {
    byProduct: Array.from(productSales.values()).sort((a, b) => b.units_sold - a.units_sold),
    byChannel: Array.from(channelSales.values()).sort((a, b) => b.revenue - a.revenue),
  }
}

// Cached per request (deduplicates multiple calls in same render)
export const getSalesReport = cache(async (year?: number, month?: number) => {
  return _getSalesReportInternal(year, month)
})

async function _getReturnSummaryInternal(year?: number, month?: number) {
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select("*, order_line_items(*)")
    .eq("status", "returned")

  if (year && month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  } else if (year) {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  }

  const { data: orders } = await query
  if (!orders) {
    return {
      returnedUnits: 0,
      returnedRevenue: 0,
      returnedCogs: 0,
      returnedOrders: 0,
      bySku: [],
    }
  }

  const { data: products } = await supabase.from("products").select("*")
  const productMap = new Map(products?.map(p => [p.sku, p]) || [])
  const returnedBySku = new Map<string, number>()

  let returnedUnits = 0
  let returnedRevenue = 0
  let returnedCogs = 0

  for (const order of orders) {
    const lineItems = (order as any).order_line_items || []
    for (const item of lineItems) {
      returnedUnits += item.quantity
      returnedRevenue += (item.selling_price || 0) * item.quantity
      returnedBySku.set(item.sku, (returnedBySku.get(item.sku) || 0) + item.quantity)

      const product = productMap.get(item.sku)
      if (product) {
        returnedCogs += product.cost_per_unit * item.quantity
      }
    }
  }

  return {
    returnedUnits,
    returnedRevenue,
    returnedCogs,
    returnedOrders: orders.length,
    bySku: Array.from(returnedBySku.entries()).map(([sku, units]) => ({
      sku,
      units,
    })),
  }
}

// Cached per request
export const getReturnSummary = cache(async (year?: number, month?: number) => {
  return _getReturnSummaryInternal(year, month)
})

export async function getReorderRecommendations() {
  const supabase = await createClient()
  const startDate = new Date("2025-12-27T00:00:00Z")
  const endDate = new Date()
  const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1)

  // Include Bundle-Cervi to track its impact on component stock
  const targetSkus = ["Cervi-001", "Lumi-001", "Calmi-001", "Bundle-Cervi"]

  const { data: orders } = await supabase
    .from("orders")
    .select("order_date, order_line_items!inner(quantity, selling_price, sku)")
    .in("status", ["paid", "shipped"])
    .gte("order_date", startDate.toISOString())
    .in("order_line_items.sku", targetSkus)

  // Track units sold by SKU
  const unitsBySku = new Map<string, number>()
  for (const sku of targetSkus) unitsBySku.set(sku, 0)

  for (const order of orders || []) {
    const lineItems = (order as any).order_line_items || []
    for (const item of lineItems) {
      if (item.selling_price > 0) {
        unitsBySku.set(item.sku, (unitsBySku.get(item.sku) || 0) + item.quantity)
      }
    }
  }

  // Bundle-Cervi sales consume Cervi-001 and Calmi-001 components
  // Add bundle sales to component totals for accurate restock calculation
  const bundleSales = unitsBySku.get("Bundle-Cervi") || 0
  const cerviTotal = (unitsBySku.get("Cervi-001") || 0) + bundleSales
  const calmiTotal = (unitsBySku.get("Calmi-001") || 0) + bundleSales

  // Use combined totals for restock calculation
  const effectiveUnits = new Map<string, number>([
    ["Cervi-001", cerviTotal],
    ["Lumi-001", unitsBySku.get("Lumi-001") || 0],
    ["Calmi-001", calmiTotal],
  ])

  const configs = [
    { sku: "Cervi-001", name: "CerviCloud Pillow", mode: "Sea", leadMin: 28, leadMax: 42, buffer: 14 },
    { sku: "Lumi-001", name: "LumiCloud Eye Mask", mode: "Air", leadMin: 7, leadMax: 10, buffer: 7 },
    { sku: "Calmi-001", name: "CalmiCloud Ear Plug", mode: "Air", leadMin: 7, leadMax: 10, buffer: 7 },
    { sku: "Calmi-001", name: "CalmiCloud Ear Plug", mode: "Sea", leadMin: 28, leadMax: 42, buffer: 14 },
  ]

  const recommendations = configs.map((config) => {
    const unitsSold = effectiveUnits.get(config.sku) || 0
    const avgDaily = unitsSold / days
    const minPoint = Math.ceil(avgDaily * (config.leadMin + config.buffer))
    const maxPoint = Math.ceil(avgDaily * (config.leadMax + config.buffer))

    return {
      sku: config.sku,
      name: config.name,
      mode: config.mode,
      unitsSold,
      days,
      avgDaily,
      leadMin: config.leadMin,
      leadMax: config.leadMax,
      buffer: config.buffer,
      reorderMin: minPoint,
      reorderMax: maxPoint,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
    }
  })

  return { days, startDate, endDate, recommendations }
}

/**
 * Get monthly sales report with breakdown by product
 */
async function _getMonthlySalesReportInternal(year?: number, month?: number) {
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select("*, order_line_items(*)")
    .in("status", ["paid", "shipped"])

  // Filter by year/month if provided
  if (year && month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0] // Last day of month
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  } else if (year) {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  }

  const { data: orders } = await query

  if (!orders) return { byMonth: [], byProduct: [] }

  // Get products for cost lookup
  const { data: products } = await supabase.from("products").select("*")
  const productMap = new Map(products?.map(p => [p.sku, p]) || [])

  // Group by month
  const monthlySales = new Map<string, {
    month: string
    orders: number
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }>()

  // Sales by product
  const productSales = new Map<string, {
    sku: string
    name: string
    variant: string | null
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }>()

  for (const order of orders) {
    const orderMonth = order.order_date.substring(0, 7) // "YYYY-MM"
    const lineItems = (order as any).order_line_items || []

    // Calculate total order value for proportional fee allocation
    const totalOrderValue = lineItems.reduce((sum: number, item: any) =>
      sum + (item.selling_price * item.quantity), 0
    )

    // Monthly totals
    const existing = monthlySales.get(orderMonth) || {
      month: orderMonth,
      orders: 0,
      units_sold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    }

    let orderRevenue = 0
    let orderCost = 0
    let orderUnits = 0

    for (const item of lineItems) {
      const product = productMap.get(item.sku)
      if (!product) continue

      const itemTotalPrice = item.selling_price * item.quantity

      // Allocate channel fees proportionally
      let allocatedChannelFee = 0
      if (totalOrderValue > 0 && order.channel_fees) {
        const proportion = itemTotalPrice / totalOrderValue
        allocatedChannelFee = order.channel_fees * proportion
      }

      const itemRevenue = itemTotalPrice - allocatedChannelFee
      const itemCost = product.cost_per_unit * item.quantity

      orderRevenue += itemRevenue
      orderCost += itemCost
      orderUnits += item.quantity

      // By product totals
      const productExisting = productSales.get(item.sku) || {
        sku: item.sku,
        name: product.name,
        variant: product.variant,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }

      productSales.set(item.sku, {
        sku: item.sku,
        name: product.name,
        variant: product.variant,
        units_sold: productExisting.units_sold + item.quantity,
        revenue: productExisting.revenue + itemRevenue,
        cost: productExisting.cost + itemCost,
        profit: productExisting.profit + (itemRevenue - itemCost),
      })
    }

    monthlySales.set(orderMonth, {
      month: orderMonth,
      orders: existing.orders + 1,
      units_sold: existing.units_sold + orderUnits,
      revenue: existing.revenue + orderRevenue,
      cost: existing.cost + orderCost,
      profit: existing.profit + (orderRevenue - orderCost),
    })
  }

  return {
    byMonth: Array.from(monthlySales.values()).sort((a, b) => a.month.localeCompare(b.month)),
    byProduct: Array.from(productSales.values()).sort((a, b) => b.units_sold - a.units_sold),
  }
}

// Cached per request
export const getMonthlySalesReport = cache(async (year?: number, month?: number) => {
  return _getMonthlySalesReportInternal(year, month)
})

/**
 * Get sales breakdown by channel and product (cross-tabulation)
 */
async function _getChannelProductReportInternal(year?: number, month?: number) {
  const supabase = await createClient()

  let query = supabase
    .from("orders")
    .select("*, order_line_items(*)")
    .in("status", ["paid", "shipped"])

  // Filter by year/month if provided
  if (year && month) {
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  } else if (year) {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    query = query.gte("order_date", startDate).lte("order_date", endDate)
  }

  const { data: orders } = await query

  if (!orders) return { data: [] }

  // Get products for lookup
  const { data: products } = await supabase.from("products").select("*")
  const productMap = new Map(products?.map(p => [p.sku, p]) || [])

  // Map: channel -> sku -> stats
  const channelProductSales = new Map<Channel, Map<string, {
    sku: string
    name: string
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }>>()

  for (const order of orders) {
    const channel = order.channel
    const lineItems = (order as any).order_line_items || []

    // Calculate total order value for proportional fee allocation
    const totalOrderValue = lineItems.reduce((sum: number, item: any) =>
      sum + (item.selling_price * item.quantity), 0
    )

    if (!channelProductSales.has(channel)) {
      channelProductSales.set(channel, new Map())
    }

    const channelMap = channelProductSales.get(channel)!

    for (const item of lineItems) {
      const product = productMap.get(item.sku)
      if (!product) continue

      const existing = channelMap.get(item.sku) || {
        sku: item.sku,
        name: product.name,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }

      const itemTotalPrice = item.selling_price * item.quantity

      // Allocate channel fees proportionally
      let allocatedChannelFee = 0
      if (totalOrderValue > 0 && order.channel_fees) {
        const proportion = itemTotalPrice / totalOrderValue
        allocatedChannelFee = order.channel_fees * proportion
      }

      const itemRevenue = itemTotalPrice - allocatedChannelFee
      const itemCost = product.cost_per_unit * item.quantity

      channelMap.set(item.sku, {
        sku: item.sku,
        name: product.name,
        units_sold: existing.units_sold + item.quantity,
        revenue: existing.revenue + itemRevenue,
        cost: existing.cost + itemCost,
        profit: existing.profit + (itemRevenue - itemCost),
      })
    }
  }

  // Convert to flat array for easier rendering
  const result: Array<{
    channel: Channel
    sku: string
    name: string
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }> = []

  for (const [channel, productMap] of channelProductSales) {
    for (const [sku, stats] of productMap) {
      result.push({
        channel,
        ...stats,
      })
    }
  }

  return { data: result.sort((a, b) => b.revenue - a.revenue) }
}

// Cached per request
export const getChannelProductReport = cache(async (year?: number, month?: number) => {
  return _getChannelProductReportInternal(year, month)
})

/**
 * Generate next order ID for a given channel and date
 * Format: CHANNEL-YYYYMMDD-XXX
 */
export async function generateNextOrderId(channel: Channel, orderDate: string) {
  const supabase = await createClient()

  // Format date as YYYYMMDD
  const dateStr = orderDate.replace(/-/g, '')

  // Get channel prefix (first 5 chars, uppercase)
  const channelPrefix = channel.slice(0, 5).toUpperCase()

  // Build the pattern for this channel+date
  const pattern = `${channelPrefix}-${dateStr}-%`

  // Find the highest sequence number for this channel+date
  const { data, error } = await supabase
    .from("orders")
    .select("order_id")
    .like("order_id", pattern)
    .order("order_id", { ascending: false })
    .limit(1)

  let nextSequence = 1

  if (data && data.length > 0) {
    // Extract sequence number from last order ID (e.g., "SHOPEE-20250101-005" -> 5)
    const lastOrderId = data[0].order_id
    const parts = lastOrderId.split('-')
    if (parts.length === 3) {
      const lastSequence = parseInt(parts[2])
      if (!isNaN(lastSequence)) {
        nextSequence = lastSequence + 1
      }
    }
  }

  // Format: CHANNEL-YYYYMMDD-XXX
  const newOrderId = `${channelPrefix}-${dateStr}-${nextSequence.toString().padStart(3, '0')}`

  return newOrderId
}
