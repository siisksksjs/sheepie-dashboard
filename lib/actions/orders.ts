"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import { cache } from "react"
import type { Order, OrderLineItem, Product, Channel, OrderStatus } from "@/lib/types/database.types"
import { createLedgerEntry } from "./inventory"
import { getLineItemCostPerUnit, getLineItemTotalCost } from "@/lib/line-item-costs"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem, summarizeLineItems } from "@/lib/changelog"
import { DEFAULT_PACK_SIZE, getPackMultiplier } from "@/lib/products/pack-sizes"
import { RESTOCK_GUIDANCE_CONFIG } from "@/lib/restock/config"
import {
  averageLatestLeadTimes,
  buildGuidanceRouteConfigs,
  buildLeadBufferLabel,
  buildReorderWindow,
} from "@/lib/restock/guidance"
import { calculateInStockDays } from "@/lib/restock/in-stock-days"
import {
  calculateOrderSettlementAmount,
  createMarketplaceSettlementEntry,
  createMarketplaceSettlementReversalEntry,
  isSettledOrderStatus,
} from "@/lib/marketplace-settlements"

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
        pack_size,
        selling_price,
        cost_per_unit_snapshot
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
        cost_per_unit: getLineItemCostPerUnit(item, product),
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
      sum + getLineItemTotalCost(item), 0
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
    const isNotFound =
      orderError.code === "PGRST116"
      || orderError.details?.includes("0 rows")
      || orderError.message?.includes("0 rows")
      || orderError.message?.includes("no rows")

    if (isNotFound) {
      return null
    }

    console.error("Error fetching order:", orderError)
    throw new Error(orderError.message || "Failed to fetch order")
  }

  const { data: lineItems, error: lineItemsError } = await supabase
    .from("order_line_items")
    .select("*")
    .eq("order_id", id)

  if (lineItemsError) {
    console.error("Error fetching line items:", lineItemsError)
    throw new Error(lineItemsError.message || "Failed to fetch order line items")
  }

  return {
    order: order as Order,
    lineItems: lineItems as OrderLineItem[],
  }
}

type CreateOrderInput = {
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  line_items: {
    sku: string
    pack_size: OrderLineItem["pack_size"]
    quantity: number
    selling_price: number
  }[]
}

type CreateOrderResult =
  | { success: true; data: Order }
  | { success: false; error: string }

type DuplicateOrderResult =
  | {
      success: true
      data: Pick<Order, "id" | "order_id">
    }
  | {
      success: false
      error: string
    }

type BuildDuplicateOrderInputArgs = {
  sourceOrder: Order
  sourceLineItems: OrderLineItem[]
  nextOrderId: string
  today: string
}

type LedgerRollbackEntry = {
  sku: string
  quantity: number
}

function getOrderLineUnits(item: {
  quantity: number
  pack_size?: OrderLineItem["pack_size"] | null
}) {
  return item.quantity * getPackMultiplier(item.pack_size ?? DEFAULT_PACK_SIZE)
}

function buildPackAwareOrderReference(orderLabel: string, packSize?: OrderLineItem["pack_size"] | null) {
  const effectivePackSize = packSize ?? DEFAULT_PACK_SIZE
  return effectivePackSize === DEFAULT_PACK_SIZE
    ? orderLabel
    : `${orderLabel} (${effectivePackSize})`
}

export async function buildDuplicateOrderInput({
  sourceOrder,
  sourceLineItems,
  nextOrderId,
  today,
}: BuildDuplicateOrderInputArgs): Promise<CreateOrderInput> {
  return {
    order_id: nextOrderId,
    channel: sourceOrder.channel,
    order_date: today,
    status: "paid",
    channel_fees: sourceOrder.channel_fees,
    notes: sourceOrder.notes,
    line_items: sourceLineItems.map((item) => ({
      sku: item.sku,
      pack_size: item.pack_size ?? DEFAULT_PACK_SIZE,
      quantity: item.quantity,
      selling_price: item.selling_price,
    })),
  }
}

function getJakartaBusinessDate(date: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const year = parts.find((part) => part.type === "year")?.value
  const month = parts.find((part) => part.type === "month")?.value
  const day = parts.find((part) => part.type === "day")?.value

  return `${year}-${month}-${day}`
}

async function cleanupFailedSettledOrderCreation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  orderId: string
  orderLabel: string
  successfulLedgerEntries: LedgerRollbackEntry[]
}) {
  const { supabase, orderId, orderLabel, successfulLedgerEntries } = params
  let cleanupError: string | null = null

  for (const entry of [...successfulLedgerEntries].reverse()) {
    const reversalResult = await createLedgerEntry({
      sku: entry.sku,
      movement_type: "RETURN",
      quantity: entry.quantity,
      reference: `${orderLabel} - Rollback`,
    }, {
      skipChangelog: true,
    })

    if (!reversalResult.success && !cleanupError) {
      cleanupError = reversalResult.error || "Failed to restore stock after ledger failure"
    }
  }

  const { error: deleteError } = await supabase
    .from("orders")
    .delete()
    .eq("id", orderId)

  if (deleteError && !cleanupError) {
    cleanupError = deleteError.message || "Failed to delete order after ledger failure"
  }

  return cleanupError
}

async function createOrderWithWorkflow(formData: CreateOrderInput): Promise<CreateOrderResult> {
  const supabase = await createClient()

  const uniqueSkus = [...new Set(formData.line_items.map(item => item.sku))]
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("sku, cost_per_unit")
    .in("sku", uniqueSkus)

  if (productsError) {
    console.error("Error fetching product costs:", productsError)
    return { success: false, error: productsError.message }
  }

  const productCosts = new Map(products?.map(product => [product.sku, product.cost_per_unit]) || [])
  const missingSkus = uniqueSkus.filter(sku => !productCosts.has(sku))

  if (missingSkus.length > 0) {
    return { success: false, error: `Missing product cost for SKU(s): ${missingSkus.join(", ")}` }
  }

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
    pack_size: item.pack_size ?? DEFAULT_PACK_SIZE,
    quantity: item.quantity,
    selling_price: item.selling_price,
    cost_per_unit_snapshot: productCosts.get(item.sku) ?? 0,
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

  const isSettledOrder = isSettledOrderStatus(formData.status)
  const successfulLedgerEntries: LedgerRollbackEntry[] = []

  // If order status is settled, generate ledger entries
  if (isSettledOrder) {

    try {
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
              const ledgerResult = await createLedgerEntry({
                sku: comp.component_sku,
                movement_type: "OUT_SALE",
                quantity: -(comp.quantity * item.quantity), // Component qty × bundle qty
                reference: `Order ${formData.order_id} (Bundle: ${item.sku})`,
              }, {
                skipChangelog: true,
              })

              if (!ledgerResult.success) {
                const cleanupError = await cleanupFailedSettledOrderCreation({
                  supabase,
                  orderId: order.id,
                  orderLabel: `Order ${formData.order_id}`,
                  successfulLedgerEntries,
                })

                return {
                  success: false,
                  error: cleanupError || ledgerResult.error || "Failed to create ledger entry",
                }
              }

              successfulLedgerEntries.push({
                sku: comp.component_sku,
                quantity: comp.quantity * item.quantity,
              })
            }
          }
        } else {
          // Regular product - create ledger entry as normal
          const packSize = item.pack_size ?? DEFAULT_PACK_SIZE
          const consumedUnits = item.quantity * getPackMultiplier(packSize)
          const ledgerResult = await createLedgerEntry({
            sku: item.sku,
            movement_type: "OUT_SALE",
            quantity: -consumedUnits,
            reference: buildPackAwareOrderReference(`Order ${formData.order_id}`, packSize),
          }, {
            skipChangelog: true,
          })

          if (!ledgerResult.success) {
            const cleanupError = await cleanupFailedSettledOrderCreation({
              supabase,
              orderId: order.id,
              orderLabel: `Order ${formData.order_id}`,
              successfulLedgerEntries,
            })

            return {
              success: false,
              error: cleanupError || ledgerResult.error || "Failed to create ledger entry",
            }
          }

          successfulLedgerEntries.push({
            sku: item.sku,
            quantity: consumedUnits,
          })
        }
      }
    } catch (error) {
      const cleanupError = await cleanupFailedSettledOrderCreation({
        supabase,
        orderId: order.id,
        orderLabel: `Order ${formData.order_id}`,
        successfulLedgerEntries,
      })

      return {
        success: false,
        error: cleanupError || (error instanceof Error ? error.message : "Failed to create ledger entry"),
      }
    }
  }

  if (isSettledOrder) {
    const settlementAmount = calculateOrderSettlementAmount(lineItemsToInsert, formData.channel_fees)
    const settlementResult = await createMarketplaceSettlementEntry({
      orderId: order.id,
      orderLabel: `Order ${order.order_id}`,
      channel: order.channel,
      entryDate: order.order_date,
      amount: settlementAmount,
      notes: order.notes,
    })

    if (!settlementResult.success) {
      const cleanupError = await cleanupFailedSettledOrderCreation({
        supabase,
        orderId: order.id,
        orderLabel: `Order ${order.order_id}`,
        successfulLedgerEntries,
      })

      return {
        success: false,
        error: cleanupError || settlementResult.error || "Failed to create marketplace settlement entry",
      }
    }
  }

  revalidatePath("/orders")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")

  await safeRecordAutomaticChangelogEntry({
    area: "orders",
    action_summary: "Created order",
    entity_type: "order",
    entity_id: order.id,
    entity_label: `Order ${order.order_id}`,
    notes: order.notes,
    items: [
      buildChangeItem("Channel", null, order.channel),
      buildChangeItem("Order date", null, order.order_date),
      buildChangeItem("Status", null, order.status),
      buildChangeItem("Channel fees", null, order.channel_fees),
      buildChangeItem("Line items", null, summarizeLineItems(formData.line_items)),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true, data: order }
}

export async function createOrder(formData: CreateOrderInput) {
  return createOrderWithWorkflow(formData)
}

export async function duplicateOrder(orderId: string): Promise<DuplicateOrderResult> {
  let orderData: Awaited<ReturnType<typeof getOrderById>>

  try {
    orderData = await getOrderById(orderId)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load source order",
    }
  }

  if (!orderData) {
    return { success: false, error: "Order not found" }
  }

  if (orderData.lineItems.length === 0) {
    return { success: false, error: "Source order has no line items" }
  }

  const today = getJakartaBusinessDate()
  let nextOrderId: string

  try {
    nextOrderId = await generateNextOrderId(orderData.order.channel, today)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate next order ID",
    }
  }

  const duplicateInput = await buildDuplicateOrderInput({
    sourceOrder: orderData.order,
    sourceLineItems: orderData.lineItems,
    nextOrderId,
    today,
  })

  let result: CreateOrderResult

  try {
    result = await createOrderWithWorkflow(duplicateInput)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to create duplicate order",
    }
  }

  if (!result.success) {
    return result
  }

  return {
    success: true,
    data: {
      id: result.data.id,
      order_id: result.data.order_id,
    },
  }
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  previousStatus: OrderStatus
) {
  const supabase = await createClient()

  // Get order details
  let orderData: Awaited<ReturnType<typeof getOrderById>>

  try {
    orderData = await getOrderById(orderId)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to load order",
    }
  }

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

  const wasSettled = isSettledOrderStatus(previousStatus)
  const isSettled = isSettledOrderStatus(newStatus)

  if (wasSettled && (newStatus === "cancelled" || newStatus === "returned")) {
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
            }, {
              skipChangelog: true,
            })
          }
        }
      } else {
        // Regular product
        const packSize = item.pack_size ?? DEFAULT_PACK_SIZE
        const restoredUnits = item.quantity * getPackMultiplier(packSize)
        await createLedgerEntry({
          sku: item.sku,
          movement_type: "RETURN",
          quantity: restoredUnits,
          reference: buildPackAwareOrderReference(
            `Order ${order.order_id} - ${newStatus === "cancelled" ? "Cancelled" : "Returned"}`,
            packSize,
          ),
        }, {
          skipChangelog: true,
        })
      }
    }
  }

  if (!wasSettled && isSettled) {
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
            }, {
              skipChangelog: true,
            })
          }
        }
      } else {
        // Regular product
        const packSize = item.pack_size ?? DEFAULT_PACK_SIZE
        const consumedUnits = item.quantity * getPackMultiplier(packSize)
        await createLedgerEntry({
          sku: item.sku,
          movement_type: "OUT_SALE",
          quantity: -consumedUnits,
          reference: buildPackAwareOrderReference(`Order ${order.order_id}`, packSize),
        }, {
          skipChangelog: true,
        })
      }
    }
  }

  const settlementAmount = calculateOrderSettlementAmount(lineItems, order.channel_fees)

  if (!wasSettled && isSettled) {
    const settlementResult = await createMarketplaceSettlementEntry({
      orderId: order.id,
      orderLabel: `Order ${order.order_id}`,
      channel: order.channel,
      entryDate: order.order_date,
      amount: settlementAmount,
      notes: order.notes,
    })

    if (!settlementResult.success) {
      console.error("Failed to create marketplace settlement entry:", settlementResult.error)
    }
  }

  if (wasSettled && !isSettled) {
    const reversalResult = await createMarketplaceSettlementReversalEntry({
      orderId: order.id,
      orderLabel: `Order ${order.order_id}`,
      channel: order.channel,
      entryDate: new Date().toISOString().split("T")[0],
      amount: settlementAmount,
      notes: `Status changed from ${previousStatus} to ${newStatus}`,
    })

    if (!reversalResult.success) {
      console.error("Failed to reverse marketplace settlement entry:", reversalResult.error)
    }
  }

  revalidatePath("/orders")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")

  let stockEffect: string | null = null
  if (wasSettled && (newStatus === "cancelled" || newStatus === "returned")) {
    stockEffect = "Created RETURN ledger entries to restore stock."
  } else if (!wasSettled && isSettled) {
    stockEffect = "Created OUT_SALE ledger entries to reduce stock."
  }

  await safeRecordAutomaticChangelogEntry({
    area: "orders",
    action_summary: "Updated order status",
    entity_type: "order",
    entity_id: order.id,
    entity_label: `Order ${order.order_id}`,
    notes: stockEffect,
    items: [
      buildChangeItem("Status", previousStatus, newStatus),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

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

export async function getDailySalesSnippet(date?: string) {
  const supabase = await createClient()
  const targetDate = date || new Date().toISOString().split("T")[0]

  const { data: orders } = await supabase
    .from("orders")
    .select("channel, channel_fees, order_line_items!inner(sku, quantity, pack_size, selling_price)")
    .in("status", ["paid", "shipped"])
    .eq("order_date", targetDate)

  if (!orders || orders.length === 0) {
    return {
      date: targetDate,
      totalOrders: 0,
      totalUnits: 0,
      totalRevenue: 0,
      items: [] as {
        sku: string
        productName: string
        platform: Channel
        quantity: number
        revenue: number
      }[],
    }
  }

  const { data: products } = await supabase
    .from("products")
    .select("sku, name, variant")

  const productMap = new Map(
    (products || []).map((product) => [
      product.sku,
      product.variant ? `${product.name} - ${product.variant}` : product.name,
    ])
  )

  const byProductAndChannel = new Map<string, {
    sku: string
    productName: string
    platform: Channel
    quantity: number
    revenue: number
  }>()

  let totalUnits = 0
  let totalRevenue = 0

  for (const order of orders as any[]) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce(
      (sum: number, item: any) => sum + ((item.selling_price || 0) * (item.quantity || 0)),
      0
    )

    for (const item of lineItems) {
      totalUnits += getOrderLineUnits(item)
      const itemGross = (item.selling_price || 0) * (item.quantity || 0)
      const allocatedFee = totalOrderValue > 0
        ? ((order.channel_fees || 0) * itemGross) / totalOrderValue
        : 0
      const itemRevenue = itemGross - allocatedFee
      totalRevenue += itemRevenue
      const key = `${item.sku}__${order.channel}`
      const existing = byProductAndChannel.get(key)

      if (existing) {
        existing.quantity += getOrderLineUnits(item)
        existing.revenue += itemRevenue
      } else {
        byProductAndChannel.set(key, {
          sku: item.sku,
          productName: productMap.get(item.sku) || item.sku,
          platform: order.channel as Channel,
          quantity: getOrderLineUnits(item),
          revenue: itemRevenue,
        })
      }
    }
  }

  return {
    date: targetDate,
    totalOrders: orders.length,
    totalUnits,
    totalRevenue,
    items: Array.from(byProductAndChannel.values()).sort((a, b) => b.revenue - a.revenue),
  }
}

export async function getMonthlySalesByDay(month: string) {
  const supabase = await createClient()

  const monthPattern = /^\d{4}-\d{2}$/
  if (!monthPattern.test(month)) {
    return [] as { date: string; orders: number; units: number }[]
  }

  const [year, monthNumber] = month.split("-").map((value) => parseInt(value, 10))
  const startDate = `${month}-01`
  const endDate = new Date(year, monthNumber, 0).toISOString().split("T")[0]

  const { data: orders } = await supabase
    .from("orders")
    .select("order_date, order_line_items!inner(quantity, pack_size)")
    .in("status", ["paid", "shipped"])
    .gte("order_date", startDate)
    .lte("order_date", endDate)

  if (!orders || orders.length === 0) {
    return [] as { date: string; orders: number; units: number }[]
  }

  const byDate = new Map<string, { date: string; orders: number; units: number }>()

  for (const order of orders as any[]) {
    const date = order.order_date?.slice(0, 10)
    if (!date) continue

    const existing = byDate.get(date) || { date, orders: 0, units: 0 }
    existing.orders += 1
    existing.units += (order.order_line_items || []).reduce(
      (sum: number, item: any) => sum + getOrderLineUnits(item),
      0
    )
    byDate.set(date, existing)
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date))
}

type ReportOrder = Pick<Order, "id" | "channel" | "order_date" | "status" | "channel_fees"> & {
  order_line_items: Array<Pick<OrderLineItem, "sku" | "quantity" | "pack_size" | "selling_price" | "cost_per_unit_snapshot">>
}

type ReportProduct = Pick<Product, "sku" | "name" | "variant" | "cost_per_unit">

type ProductSalesRow = {
  sku: string
  name: string
  variant: string | null
  units_sold: number
  revenue: number
  cost: number
  profit: number
}

type ChannelSalesRow = {
  channel: Channel
  orders: number
  revenue: number
  fees: number
  cost: number
  profit: number
}

type MonthlySalesRow = {
  month: string
  orders: number
  units_sold: number
  revenue: number
  cost: number
  profit: number
}

type CalendarItemRow = {
  sku: string
  name: string
  quantity: number
  revenue: number
}

type CalendarDayRow = {
  orders: number
  units: number
  revenue: number
  items: CalendarItemRow[]
}

type ChannelProductRow = {
  channel: Channel
  sku: string
  name: string
  pack_size: OrderLineItem["pack_size"]
  units_sold: number
  revenue: number
  cost: number
  profit: number
}

type ReturnSummary = {
  returnedUnits: number
  returnedRevenue: number
  returnedCogs: number
  returnedOrders: number
  bySku: Array<{ sku: string; units: number }>
}

type ReportsAggregate = {
  overview: {
    byProduct: ProductSalesRow[]
    byChannel: ChannelSalesRow[]
  }
  monthly: {
    byMonth: MonthlySalesRow[]
    byDay: MonthlySalesRow[]
    byProduct: ProductSalesRow[]
  }
  channelProduct: {
    data: ChannelProductRow[]
  }
  returns: ReturnSummary
  calendar: {
    byDate: Record<string, CalendarDayRow>
  }
}

function applyOrderDateFilter<T>(query: T, year?: number, month?: number) {
  if (year && month) {
    const startDate = `${year}-${month.toString().padStart(2, "0")}-01`
    const endDate = new Date(year, month, 0).toISOString().split("T")[0]
    return (query as any).gte("order_date", startDate).lte("order_date", endDate) as T
  }

  if (year) {
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`
    return (query as any).gte("order_date", startDate).lte("order_date", endDate) as T
  }

  return query
}

const EMPTY_REPORTS_AGGREGATE: ReportsAggregate = {
  overview: {
    byProduct: [],
    byChannel: [],
  },
  monthly: {
    byMonth: [],
    byDay: [],
    byProduct: [],
  },
  channelProduct: {
    data: [],
  },
  returns: {
    returnedUnits: 0,
    returnedRevenue: 0,
    returnedCogs: 0,
    returnedOrders: 0,
    bySku: [],
  },
  calendar: {
    byDate: {},
  },
}

const getReportsAggregate = cache(async (year?: number, month?: number): Promise<ReportsAggregate> => {
  const supabase = await createClient()

  const ordersQuery = applyOrderDateFilter(
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
      .in("status", ["paid", "shipped", "returned"]),
    year,
    month
  )

  const [ordersResult, productsResult] = await Promise.all([
    ordersQuery,
    supabase.from("products").select("sku, name, variant, cost_per_unit"),
  ])

  if (ordersResult.error) {
    console.error("Error fetching report orders:", ordersResult.error)
    return EMPTY_REPORTS_AGGREGATE
  }

  if (productsResult.error) {
    console.error("Error fetching report products:", productsResult.error)
    return EMPTY_REPORTS_AGGREGATE
  }

  const orders = (ordersResult.data || []) as ReportOrder[]
  const products = (productsResult.data || []) as ReportProduct[]

  if (orders.length === 0) {
    return EMPTY_REPORTS_AGGREGATE
  }

  const productMap = new Map(products.map((product) => [product.sku, product]))
  const productLabelBySku = new Map(
    products.map((product) => [
      product.sku,
      product.variant ? `${product.name} - ${product.variant}` : product.name,
    ])
  )

  const productSales = new Map<string, ProductSalesRow>()
  const channelSales = new Map<Channel, ChannelSalesRow>()
  const monthlySales = new Map<string, MonthlySalesRow>()
  const dailySales = new Map<string, MonthlySalesRow>()
  const calendarSales = new Map<string, {
    orders: number
    units: number
    revenue: number
    itemsBySku: Map<string, CalendarItemRow>
  }>()
  const channelProductSales = new Map<Channel, Map<string, Omit<ChannelProductRow, "channel">>>()
  const returnedBySku = new Map<string, number>()

  let returnedUnits = 0
  let returnedRevenue = 0
  let returnedCogs = 0
  let returnedOrders = 0

  for (const order of orders) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce(
      (sum, item) => sum + ((item.selling_price || 0) * (item.quantity || 0)),
      0
    )

    if (order.status === "returned") {
      returnedOrders += 1

      for (const item of lineItems) {
        const unitCount = getOrderLineUnits(item)
        returnedUnits += unitCount
        returnedRevenue += (item.selling_price || 0) * item.quantity
        returnedBySku.set(item.sku, (returnedBySku.get(item.sku) || 0) + unitCount)

        const product = productMap.get(item.sku)
        if (product) {
          returnedCogs += getLineItemTotalCost(item, product)
        }
      }

      continue
    }

    const orderMonth = order.order_date.substring(0, 7)
    const orderDay = order.order_date.substring(0, 10)
    const orderRevenue = totalOrderValue - (order.channel_fees || 0)

    const channelExisting = channelSales.get(order.channel) || {
      channel: order.channel,
      orders: 0,
      revenue: 0,
      fees: 0,
      cost: 0,
      profit: 0,
    }
    const monthlyExisting = monthlySales.get(orderMonth) || {
      month: orderMonth,
      orders: 0,
      units_sold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    }
    const dailyExisting = dailySales.get(orderDay) || {
      month: orderDay,
      orders: 0,
      units_sold: 0,
      revenue: 0,
      cost: 0,
      profit: 0,
    }

    if (!calendarSales.has(orderDay)) {
      calendarSales.set(orderDay, {
        orders: 0,
        units: 0,
        revenue: 0,
        itemsBySku: new Map(),
      })
    }

    if (!channelProductSales.has(order.channel)) {
      channelProductSales.set(order.channel, new Map())
    }

    const calendarExisting = calendarSales.get(orderDay)!
    const channelProductMap = channelProductSales.get(order.channel)!

    calendarExisting.orders += 1

    let orderCost = 0
    let orderUnits = 0

    for (const item of lineItems) {
      const product = productMap.get(item.sku)
      const unitCount = getOrderLineUnits(item)
      const itemTotalPrice = (item.selling_price || 0) * item.quantity
      const allocatedChannelFee = totalOrderValue > 0 && order.channel_fees
        ? (order.channel_fees * itemTotalPrice) / totalOrderValue
        : 0
      const itemRevenue = itemTotalPrice - allocatedChannelFee

      orderUnits += unitCount
      calendarExisting.units += unitCount
      calendarExisting.revenue += itemRevenue

      const calendarItemExisting = calendarExisting.itemsBySku.get(item.sku) || {
        sku: item.sku,
        name: productLabelBySku.get(item.sku) || item.sku,
        quantity: 0,
        revenue: 0,
      }

      calendarExisting.itemsBySku.set(item.sku, {
        ...calendarItemExisting,
        quantity: calendarItemExisting.quantity + unitCount,
        revenue: calendarItemExisting.revenue + itemRevenue,
      })

      if (!product) continue

      const itemCost = getLineItemTotalCost(item, product)
      orderCost += itemCost

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
        units_sold: productExisting.units_sold + unitCount,
        revenue: productExisting.revenue + itemRevenue,
        cost: productExisting.cost + itemCost,
        profit: productExisting.profit + (itemRevenue - itemCost),
      })

      const packSize = item.pack_size ?? DEFAULT_PACK_SIZE
      const channelProductKey = `${item.sku}:${packSize}`
      const channelProductExisting = channelProductMap.get(channelProductKey) || {
        sku: item.sku,
        name: product.name,
        pack_size: packSize,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }

      channelProductMap.set(channelProductKey, {
        sku: item.sku,
        name: product.name,
        pack_size: packSize,
        units_sold: channelProductExisting.units_sold + unitCount,
        revenue: channelProductExisting.revenue + itemRevenue,
        cost: channelProductExisting.cost + itemCost,
        profit: channelProductExisting.profit + (itemRevenue - itemCost),
      })
    }

    channelSales.set(order.channel, {
      channel: order.channel,
      orders: channelExisting.orders + 1,
      revenue: channelExisting.revenue + orderRevenue,
      fees: channelExisting.fees + (order.channel_fees || 0),
      cost: channelExisting.cost + orderCost,
      profit: channelExisting.profit + (orderRevenue - orderCost),
    })

    monthlySales.set(orderMonth, {
      month: orderMonth,
      orders: monthlyExisting.orders + 1,
      units_sold: monthlyExisting.units_sold + orderUnits,
      revenue: monthlyExisting.revenue + orderRevenue,
      cost: monthlyExisting.cost + orderCost,
      profit: monthlyExisting.profit + (orderRevenue - orderCost),
    })

    if (year && month) {
      dailySales.set(orderDay, {
        month: orderDay,
        orders: dailyExisting.orders + 1,
        units_sold: dailyExisting.units_sold + orderUnits,
        revenue: dailyExisting.revenue + orderRevenue,
        cost: dailyExisting.cost + orderCost,
        profit: dailyExisting.profit + (orderRevenue - orderCost),
      })
    }
  }

  let byDay: MonthlySalesRow[] = []
  if (year && month) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthPrefix = `${year}-${month.toString().padStart(2, "0")}`

    byDay = Array.from({ length: daysInMonth }, (_, idx) => {
      const day = String(idx + 1).padStart(2, "0")
      const dateKey = `${monthPrefix}-${day}`
      return dailySales.get(dateKey) || {
        month: dateKey,
        orders: 0,
        units_sold: 0,
        revenue: 0,
        cost: 0,
        profit: 0,
      }
    })
  }

  const channelProductData: ChannelProductRow[] = []
  for (const [channel, itemsBySku] of channelProductSales.entries()) {
    for (const item of itemsBySku.values()) {
      channelProductData.push({
        channel,
        ...item,
      })
    }
  }

  const byDate = Object.fromEntries(
    Array.from(calendarSales.entries()).map(([date, summary]) => [
      date,
      {
        orders: summary.orders,
        units: summary.units,
        revenue: summary.revenue,
        items: Array.from(summary.itemsBySku.values()).sort((a, b) => b.revenue - a.revenue),
      },
    ])
  ) as Record<string, CalendarDayRow>

  return {
    overview: {
      byProduct: Array.from(productSales.values()).sort((a, b) => b.units_sold - a.units_sold),
      byChannel: Array.from(channelSales.values()).sort((a, b) => b.revenue - a.revenue),
    },
    monthly: {
      byMonth: Array.from(monthlySales.values()).sort((a, b) => a.month.localeCompare(b.month)),
      byDay,
      byProduct: Array.from(productSales.values()).sort((a, b) => b.units_sold - a.units_sold),
    },
    channelProduct: {
      data: channelProductData.sort((a, b) => {
        const nameCompare = a.name.localeCompare(b.name)
        if (nameCompare !== 0) return nameCompare

        const skuCompare = a.sku.localeCompare(b.sku)
        if (skuCompare !== 0) return skuCompare

        const packCompare = (a.pack_size ?? DEFAULT_PACK_SIZE).localeCompare(
          b.pack_size ?? DEFAULT_PACK_SIZE,
        )
        if (packCompare !== 0) return packCompare

        return a.channel.localeCompare(b.channel)
      }),
    },
    returns: {
      returnedUnits,
      returnedRevenue,
      returnedCogs,
      returnedOrders,
      bySku: Array.from(returnedBySku.entries()).map(([sku, units]) => ({
        sku,
        units,
      })),
    },
    calendar: {
      byDate,
    },
  }
})

export const getReportsBundle = cache(async (year?: number, month?: number) => {
  return getReportsAggregate(year, month)
})

// Cached per request (deduplicates multiple calls in same render)
export const getSalesReport = cache(async (year?: number, month?: number) => {
  const reports = await getReportsAggregate(year, month)
  return reports.overview
})

// Cached per request
export const getReturnSummary = cache(async (year?: number, month?: number) => {
  const reports = await getReportsAggregate(year, month)
  return reports.returns
})

export async function getReorderRecommendations() {
  const supabase = await createClient()
  const startDate = new Date("2025-12-27T00:00:00Z")
  const endDate = new Date()
  const days = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1)

  const configSkus = Array.from(new Set(RESTOCK_GUIDANCE_CONFIG.map((config) => config.sku)))
  const [{ data: restockBatches }, { data: products }] = await Promise.all([
    supabase
      .from("inventory_purchase_batches")
      .select("id, order_date, arrival_date, shipping_mode, restock_status")
      .eq("restock_status", "arrived")
      .not("arrival_date", "is", null),
    supabase
      .from("products")
      .select("sku, name, status, is_bundle"),
  ])

  const typedRestockBatches = (restockBatches || []) as Array<{
    id: string
    order_date: string
    arrival_date: string | null
    shipping_mode: "air" | "sea" | null
    restock_status: "in_transit" | "arrived"
  }>
  const batchIds = typedRestockBatches.map((batch) => batch.id)
  const { data: restockItems } = batchIds.length === 0
    ? { data: [] as Array<{ batch_id: string; sku: string }> }
    : await supabase
      .from("inventory_purchase_batch_items")
      .select("batch_id, sku")
      .in("batch_id", batchIds)

  const productRows = (products || []) as Array<{
    sku: string
    name: string
    status: "active" | "discontinued"
    is_bundle: boolean
  }>
  const productMap = new Map(productRows.map((product) => [product.sku, product]))
  const productNamesBySku = new Map(productRows.map((product) => [product.sku, product.name]))
  const batchMap = new Map(typedRestockBatches.map((batch) => [batch.id, batch]))
  const allShipmentSamples = (restockItems || []).flatMap((item) => {
    const batch = batchMap.get(item.batch_id)

    if (!batch) {
      return []
    }

    return [{
      sku: item.sku,
      shipping_mode: batch.shipping_mode,
      order_date: batch.order_date,
      arrival_date: batch.arrival_date,
    }]
  })
  const historySkus = Array.from(new Set((restockItems || []).map((item) => item.sku)))
    .filter((sku) => {
      const product = productMap.get(sku)
      return !product || (product.status === "active" && !product.is_bundle)
    })
  const guidanceSkus = Array.from(new Set([...configSkus, ...historySkus]))
  const routeConfigs = buildGuidanceRouteConfigs({
    baseConfigs: RESTOCK_GUIDANCE_CONFIG,
    samples: allShipmentSamples.filter((sample) => guidanceSkus.includes(sample.sku)),
    productNamesBySku,
  })
  // Include Bundle-Cervi to track its impact on component stock.
  const targetSkus = [...guidanceSkus, "Bundle-Cervi"]

  const [{ data: orders }, { data: stockRows }, { data: ledgerRows }] = await Promise.all([
    supabase
      .from("orders")
      .select("order_date, order_line_items!inner(quantity, pack_size, selling_price, sku)")
      .in("status", ["paid", "shipped"])
      .gte("order_date", startDate.toISOString())
      .in("order_line_items.sku", targetSkus),
    supabase
      .from("stock_on_hand")
      .select("sku, current_stock")
      .in("sku", guidanceSkus),
    supabase
      .from("inventory_ledger")
      .select("entry_date, sku, quantity")
      .in("sku", guidanceSkus)
      .gte("entry_date", startDate.toISOString().slice(0, 10))
      .lte("entry_date", endDate.toISOString().slice(0, 10)),
  ])

  // Track units sold by SKU
  const unitsBySku = new Map<string, number>()
  for (const sku of targetSkus) unitsBySku.set(sku, 0)

  for (const order of orders || []) {
    const lineItems = (order as any).order_line_items || []
    for (const item of lineItems) {
      if (item.selling_price > 0) {
        unitsBySku.set(item.sku, (unitsBySku.get(item.sku) || 0) + getOrderLineUnits(item))
      }
    }
  }

  const bundleSales = unitsBySku.get("Bundle-Cervi") || 0
  const effectiveUnits = new Map<string, number>()

  for (const sku of guidanceSkus) {
    const bundleComponentUnits = sku === "Cervi-001" || sku === "Calmi-001" ? bundleSales : 0
    effectiveUnits.set(sku, (unitsBySku.get(sku) || 0) + bundleComponentUnits)
  }

  const stockBySku = new Map(
    ((stockRows || []) as Array<{ sku: string; current_stock: number }>).map((row) => [
      row.sku,
      row.current_stock,
    ]),
  )
  const deltasBySku = new Map<string, Array<{ entry_date: string; quantity: number }>>()

  for (const row of (ledgerRows || []) as Array<{ entry_date: string; sku: string; quantity: number }>) {
    const existing = deltasBySku.get(row.sku) || []
    existing.push({
      entry_date: row.entry_date,
      quantity: row.quantity,
    })
    deltasBySku.set(row.sku, existing)
  }

  const recommendations = routeConfigs.map((config) => {
    const unitsSold = effectiveUnits.get(config.sku) || 0
    const inStockDays = calculateInStockDays({
      currentStock: stockBySku.get(config.sku) || 0,
      startDate: startDate.toISOString().slice(0, 10),
      endDate: endDate.toISOString().slice(0, 10),
      deltas: deltasBySku.get(config.sku) || [],
    })
    const avgDaily = unitsSold / Math.max(1, inStockDays)
    const learnedLeadDays = averageLatestLeadTimes({
      sku: config.sku,
      shippingMode: config.mode,
      samples: allShipmentSamples,
    })
    const reorderWindow = buildReorderWindow({
      avgDaily,
      learnedLeadDays,
      fallbackLeadMin: config.fallbackLeadMin,
      fallbackLeadMax: config.fallbackLeadMax,
      bufferDays: config.bufferDays,
    })
    const leadTimeLabel = buildLeadBufferLabel({
      leadDays: reorderWindow.leadDays,
      fallbackLeadMin: config.fallbackLeadMin,
      fallbackLeadMax: config.fallbackLeadMax,
      bufferDays: config.bufferDays,
      isFallback: reorderWindow.isFallback,
    })

    return {
      sku: config.sku,
      name: config.name,
      mode: config.mode === "air" ? "Air" : "Sea",
      unitsSold,
      days,
      inStockDays,
      avgDaily,
      leadMin: config.fallbackLeadMin,
      leadMax: config.fallbackLeadMax,
      buffer: config.bufferDays,
      learnedLeadDays,
      isFallback: reorderWindow.isFallback,
      leadTimeLabel,
      reorderMin: reorderWindow.reorderMin,
      reorderMax: reorderWindow.reorderMax,
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

  if (!orders) return { byMonth: [], byDay: [], byProduct: [] }

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

  // Group by day for month-specific trends
  const dailySales = new Map<string, {
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
    const orderDay = order.order_date.substring(0, 10) // "YYYY-MM-DD"
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

    const dailyExisting = dailySales.get(orderDay) || {
      month: orderDay,
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
      const unitCount = getOrderLineUnits(item)

      const itemTotalPrice = item.selling_price * item.quantity

      // Allocate channel fees proportionally
      let allocatedChannelFee = 0
      if (totalOrderValue > 0 && order.channel_fees) {
        const proportion = itemTotalPrice / totalOrderValue
        allocatedChannelFee = order.channel_fees * proportion
      }

      const itemRevenue = itemTotalPrice - allocatedChannelFee
      const itemCost = getLineItemTotalCost(item, product)

      orderRevenue += itemRevenue
      orderCost += itemCost
      orderUnits += unitCount

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
        units_sold: productExisting.units_sold + unitCount,
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

    if (year && month) {
      dailySales.set(orderDay, {
        month: orderDay,
        orders: dailyExisting.orders + 1,
        units_sold: dailyExisting.units_sold + orderUnits,
        revenue: dailyExisting.revenue + orderRevenue,
        cost: dailyExisting.cost + orderCost,
        profit: dailyExisting.profit + (orderRevenue - orderCost),
      })
    }
  }

  let byDay: {
    month: string
    orders: number
    units_sold: number
    revenue: number
    cost: number
    profit: number
  }[] = []

  if (year && month && dailySales.size > 0) {
    const daysInMonth = new Date(year, month, 0).getDate()
    const monthPrefix = `${year}-${month.toString().padStart(2, "0")}`

    byDay = Array.from({ length: daysInMonth }, (_, idx) => {
      const day = (idx + 1).toString().padStart(2, "0")
      const dateKey = `${monthPrefix}-${day}`
      const dayData = dailySales.get(dateKey)

      return (
        dayData || {
          month: dateKey,
          orders: 0,
          units_sold: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
        }
      )
    })
  }

  return {
    byMonth: Array.from(monthlySales.values()).sort((a, b) => a.month.localeCompare(b.month)),
    byDay,
    byProduct: Array.from(productSales.values()).sort((a, b) => b.units_sold - a.units_sold),
  }
}

// Cached per request
export const getMonthlySalesReport = cache(async (year?: number, month?: number) => {
  const reports = await getReportsAggregate(year, month)
  return reports.monthly
})

async function _getMonthlyCalendarDetailsInternal(year?: number, month?: number) {
  if (!year) {
    return {
      byDate: {} as Record<string, {
        orders: number
        units: number
        revenue: number
        items: { sku: string; name: string; quantity: number; revenue: number }[]
      }>,
    }
  }

  const supabase = await createClient()

  const startDate = month
    ? `${year}-${month.toString().padStart(2, "0")}-01`
    : `${year}-01-01`
  const endDate = month
    ? new Date(year, month, 0).toISOString().split("T")[0]
    : `${year}-12-31`

  const { data: orders } = await supabase
    .from("orders")
    .select("order_date, channel_fees, order_line_items!inner(sku, quantity, pack_size, selling_price)")
    .in("status", ["paid", "shipped"])
    .gte("order_date", startDate)
    .lte("order_date", endDate)

  if (!orders || orders.length === 0) {
    return {
      byDate: {} as Record<string, {
        orders: number
        units: number
        revenue: number
        items: { sku: string; name: string; quantity: number; revenue: number }[]
      }>,
    }
  }

  const { data: products } = await supabase
    .from("products")
    .select("sku, name, variant")

  const productNameBySku = new Map(
    (products || []).map((product) => [
      product.sku,
      product.variant ? `${product.name} - ${product.variant}` : product.name,
    ])
  )

  const detailByDate = new Map<string, {
    orders: number
    units: number
    revenue: number
    itemsBySku: Map<string, { sku: string; name: string; quantity: number; revenue: number }>
  }>()

  for (const order of orders as any[]) {
    const dateKey = order.order_date?.slice(0, 10)
    if (!dateKey) continue

    if (!detailByDate.has(dateKey)) {
      detailByDate.set(dateKey, {
        orders: 0,
        units: 0,
        revenue: 0,
        itemsBySku: new Map(),
      })
    }

    const summary = detailByDate.get(dateKey)!
    const itemsBySku = summary.itemsBySku
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce(
      (sum: number, item: any) => sum + ((item.selling_price || 0) * (item.quantity || 0)),
      0
    )

    summary.orders += 1

    for (const item of lineItems) {
      const unitCount = getOrderLineUnits(item)
      const itemGross = (item.selling_price || 0) * (item.quantity || 0)
      const allocatedFee = totalOrderValue > 0
        ? ((order.channel_fees || 0) * itemGross) / totalOrderValue
        : 0
      const itemRevenue = itemGross - allocatedFee
      const existing = itemsBySku.get(item.sku) || {
        sku: item.sku,
        name: productNameBySku.get(item.sku) || item.sku,
        quantity: 0,
        revenue: 0,
      }

      existing.quantity += unitCount
      existing.revenue += itemRevenue
      itemsBySku.set(item.sku, existing)
      summary.units += unitCount
      summary.revenue += itemRevenue
    }
  }

  const byDate: Record<string, {
    orders: number
    units: number
    revenue: number
    items: { sku: string; name: string; quantity: number; revenue: number }[]
  }> = {}

  for (const [date, summary] of detailByDate.entries()) {
    byDate[date] = {
      orders: summary.orders,
      units: summary.units,
      revenue: summary.revenue,
      items: Array.from(summary.itemsBySku.values()).sort((a, b) => b.revenue - a.revenue),
    }
  }

  return { byDate }
}

export const getMonthlyCalendarDetails = cache(async (year?: number, month?: number) => {
  const reports = await getReportsAggregate(year, month)
  return reports.calendar
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
      const itemCost = getLineItemTotalCost(item, product)
      const unitCount = getOrderLineUnits(item)

      channelMap.set(item.sku, {
        sku: item.sku,
        name: product.name,
        units_sold: existing.units_sold + unitCount,
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

  return {
    data: result.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name)
      if (nameCompare !== 0) return nameCompare

      const skuCompare = a.sku.localeCompare(b.sku)
      if (skuCompare !== 0) return skuCompare

      return a.channel.localeCompare(b.channel)
    }),
  }
}

// Cached per request
export const getChannelProductReport = cache(async (year?: number, month?: number) => {
  const reports = await getReportsAggregate(year, month)
  return reports.channelProduct
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

  if (error) {
    console.error("Error generating next order ID:", error)
    throw new Error(error.message || "Failed to generate next order ID")
  }

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
