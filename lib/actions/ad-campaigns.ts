"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { AdCampaign, AdSpendEntry, Channel, AdPlatform, CampaignStatus } from "@/lib/types/database.types"
import { getLineItemTotalCost } from "@/lib/line-item-costs"

// ============================================================================
// CAMPAIGN CRUD OPERATIONS
// ============================================================================

export async function createCampaign(formData: {
  campaign_name: string
  platform: AdPlatform
  start_date: string
  end_date: string | null
  target_channels: Channel[]
  notes: string | null
  initial_spend?: number
}) {
  const supabase = await createClient()

  // Create campaign
  const { data: campaign, error: campaignError } = await supabase
    .from("ad_campaigns")
    .insert([{
      campaign_name: formData.campaign_name,
      platform: formData.platform,
      start_date: formData.start_date,
      end_date: formData.end_date,
      target_channels: formData.target_channels,
      notes: formData.notes,
      status: 'active',
    }])
    .select()
    .single()

  if (campaignError) {
    console.error("Error creating campaign:", campaignError)
    return { success: false, error: campaignError.message }
  }

  // If initial spend provided, create first spend entry
  if (formData.initial_spend && formData.initial_spend > 0) {
    const { error: spendError } = await supabase
      .from("ad_spend_entries")
      .insert([{
        campaign_id: campaign.id,
        entry_date: formData.start_date,
        amount: formData.initial_spend,
        notes: "Initial campaign budget",
      }])

    if (spendError) {
      console.error("Error adding initial spend:", spendError)
      // Don't fail the whole operation, just log the error
    }
  }

  revalidatePath("/ad-campaigns")
  return { success: true, data: campaign }
}

export async function updateCampaign(
  id: string,
  formData: {
    campaign_name?: string
    end_date?: string | null
    target_channels?: Channel[]
    notes?: string | null
    status?: CampaignStatus
  }
) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_campaigns")
    .update(formData)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    console.error("Error updating campaign:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${id}`)
  return { success: true, data }
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("ad_campaigns")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting campaign:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  return { success: true }
}

export async function getCampaigns(filters?: { status?: CampaignStatus }) {
  const supabase = await createClient()

  let query = supabase
    .from("ad_campaigns")
    .select("*")
    .order("start_date", { ascending: false })

  if (filters?.status) {
    query = query.eq("status", filters.status)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching campaigns:", error)
    return []
  }

  return data as AdCampaign[]
}

export async function getCampaignById(id: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_campaigns")
    .select("*")
    .eq("id", id)
    .single()

  if (error) {
    console.error("Error fetching campaign:", error)
    return null
  }

  return data as AdCampaign
}

export async function completeCampaign(id: string) {
  const today = new Date().toISOString().split('T')[0]

  return updateCampaign(id, {
    status: 'completed',
    end_date: today,
  })
}

// ============================================================================
// SPEND ENTRY OPERATIONS
// ============================================================================

export async function addSpendEntry(formData: {
  campaign_id: string
  entry_date: string
  amount: number
  payment_method: string | null
  notes: string | null
}) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_spend_entries")
    .insert([formData])
    .select()
    .single()

  if (error) {
    console.error("Error adding spend entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${formData.campaign_id}`)
  return { success: true, data }
}

export async function getSpendEntries(campaignId: string) {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("ad_spend_entries")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("entry_date", { ascending: false })

  if (error) {
    console.error("Error fetching spend entries:", error)
    return []
  }

  return data as AdSpendEntry[]
}

export async function deleteSpendEntry(id: string, campaignId: string) {
  const supabase = await createClient()

  const { error } = await supabase
    .from("ad_spend_entries")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting spend entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${campaignId}`)
  return { success: true }
}

// ============================================================================
// ANALYTICS & METRICS
// ============================================================================

export async function getCampaignMetrics(campaignId: string) {
  const supabase = await createClient()

  // Get campaign details
  const campaign = await getCampaignById(campaignId)
  if (!campaign) {
    return null
  }

  // Build date filter for orders
  const startDate = campaign.start_date
  const endDate = campaign.end_date || new Date().toISOString().split('T')[0]

  // Get attributed orders (orders from target channels within campaign period)
  const { data: orders } = await supabase
    .from("orders")
    .select(`
      *,
      order_line_items (
        id,
        sku,
        quantity,
        selling_price,
        cost_per_unit_snapshot
      )
    `)
    .in("channel", campaign.target_channels)
    .gte("order_date", startDate)
    .lte("order_date", endDate)
    .in("status", ["paid", "shipped"])

  if (!orders) {
    return {
      campaign,
      total_spend: campaign.total_spend,
      orders_count: 0,
      revenue: 0,
      roas: 0,
      cost_per_order: 0,
      attributed_orders: [],
    }
  }

  // Get products for cost calculation
  const { data: products } = await supabase
    .from("products")
    .select("sku, name, cost_per_unit")

  const productMap = new Map(products?.map(p => [p.sku, p]) || [])

  // Calculate metrics
  const ordersWithMetrics = orders.map((order: any) => {
    const lineItems = order.order_line_items || []

    // Calculate revenue (total selling price - channel fees)
    const totalSellingPrice = lineItems.reduce((sum: number, item: any) =>
      sum + (item.selling_price * item.quantity), 0
    )
    const channelFees = order.channel_fees || 0
    const revenue = totalSellingPrice - channelFees

    // Calculate COGS
    const totalCogs = lineItems.reduce((sum: number, item: any) => {
      const product = productMap.get(item.sku)
      return sum + getLineItemTotalCost(item, product)
    }, 0)

    // Net profit
    const net_profit = revenue - totalCogs

    return {
      ...order,
      revenue,
      net_profit,
      line_items_with_names: lineItems.map((item: any) => ({
        ...item,
        product_name: productMap.get(item.sku)?.name || "Unknown",
      })),
    }
  })

  const totalRevenue = ordersWithMetrics.reduce((sum, order) => sum + order.revenue, 0)
  const totalProfit = ordersWithMetrics.reduce((sum, order) => sum + order.net_profit, 0)
  const ordersCount = orders.length

  const roas = campaign.total_spend > 0 ? totalRevenue / campaign.total_spend : 0
  const costPerOrder = ordersCount > 0 ? campaign.total_spend / ordersCount : 0

  return {
    campaign,
    total_spend: campaign.total_spend,
    orders_count: ordersCount,
    revenue: totalRevenue,
    profit: totalProfit,
    roas,
    cost_per_order: costPerOrder,
    attributed_orders: ordersWithMetrics,
  }
}

export async function getAllCampaignsMetrics(filters?: { status?: CampaignStatus }) {
  const campaigns = await getCampaigns(filters)

  const metricsPromises = campaigns.map(async (campaign) => {
    const metrics = await getCampaignMetrics(campaign.id)
    return {
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      platform: campaign.platform,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      target_channels: campaign.target_channels,
      status: campaign.status,
      total_spend: metrics?.total_spend || 0,
      orders_count: metrics?.orders_count || 0,
      revenue: metrics?.revenue || 0,
      profit: metrics?.profit || 0,
      roas: metrics?.roas || 0,
      cost_per_order: metrics?.cost_per_order || 0,
    }
  })

  return Promise.all(metricsPromises)
}

export async function getAdPerformanceSummary() {
  const supabase = await createClient()

  // Get all campaigns
  const { data: campaigns } = await supabase
    .from("ad_campaigns")
    .select("*")

  if (!campaigns || campaigns.length === 0) {
    return {
      total_ad_spend: 0,
      total_revenue: 0,
      overall_roas: 0,
      total_orders: 0,
      avg_cost_per_order: 0,
      active_campaigns_count: 0,
      campaigns_metrics: [],
    }
  }

  // Get metrics for all campaigns
  const allMetrics = await getAllCampaignsMetrics()

  const totalAdSpend = allMetrics.reduce((sum, m) => sum + m.total_spend, 0)
  const totalRevenue = allMetrics.reduce((sum, m) => sum + m.revenue, 0)
  const totalOrders = allMetrics.reduce((sum, m) => sum + m.orders_count, 0)
  const activeCampaignsCount = campaigns.filter(c => c.status === 'active').length

  const overallRoas = totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0
  const avgCostPerOrder = totalOrders > 0 ? totalAdSpend / totalOrders : 0

  return {
    total_ad_spend: totalAdSpend,
    total_revenue: totalRevenue,
    overall_roas: overallRoas,
    total_orders: totalOrders,
    avg_cost_per_order: avgCostPerOrder,
    active_campaigns_count: activeCampaignsCount,
    campaigns_metrics: allMetrics,
  }
}
