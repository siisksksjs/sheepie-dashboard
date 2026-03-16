"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { AdCampaign, AdSpendEntry, Channel, AdPlatform, CampaignStatus, FinanceAccount } from "@/lib/types/database.types"
import { getLineItemTotalCost } from "@/lib/line-item-costs"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"

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

  await safeRecordAutomaticChangelogEntry({
    area: "ads",
    action_summary: "Created ad campaign",
    entity_type: "campaign",
    entity_id: campaign.id,
    entity_label: campaign.campaign_name,
    notes: campaign.notes,
    items: [
      buildChangeItem("Platform", null, campaign.platform),
      buildChangeItem("Start date", null, campaign.start_date),
      buildChangeItem("End date", null, campaign.end_date),
      buildChangeItem("Target channels", null, campaign.target_channels),
      buildChangeItem("Status", null, campaign.status),
      buildChangeItem("Initial spend", null, formData.initial_spend ?? null),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

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

  const previousCampaign = await getCampaignById(id)
  if (!previousCampaign) {
    return { success: false, error: "Campaign not found" }
  }

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

  const items = [
    buildChangeItem("Campaign name", previousCampaign.campaign_name, data.campaign_name),
    buildChangeItem("End date", previousCampaign.end_date, data.end_date),
    buildChangeItem("Target channels", previousCampaign.target_channels, data.target_channels),
    buildChangeItem("Notes", previousCampaign.notes, data.notes),
    buildChangeItem("Status", previousCampaign.status, data.status),
  ].filter((item): item is NonNullable<typeof item> => Boolean(item))

  if (items.length > 0) {
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Updated ad campaign",
      entity_type: "campaign",
      entity_id: data.id,
      entity_label: data.campaign_name,
      items,
    })
  }

  return { success: true, data }
}

export async function deleteCampaign(id: string) {
  const supabase = await createClient()

  const existingCampaign = await getCampaignById(id)

  const { error } = await supabase
    .from("ad_campaigns")
    .delete()
    .eq("id", id)

  if (error) {
    console.error("Error deleting campaign:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ad-campaigns")

  if (existingCampaign) {
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Deleted ad campaign",
      entity_type: "campaign",
      entity_id: existingCampaign.id,
      entity_label: existingCampaign.campaign_name,
      notes: existingCampaign.notes,
      items: [
        buildChangeItem("Platform", existingCampaign.platform, null),
        buildChangeItem("Start date", existingCampaign.start_date, null),
        buildChangeItem("End date", existingCampaign.end_date, null),
        buildChangeItem("Target channels", existingCampaign.target_channels, null),
        buildChangeItem("Status", existingCampaign.status, null),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

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
  finance_account_id?: string | null
  payment_method: string | null
  notes: string | null
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let financeAccount: FinanceAccount | null = null
  if (formData.finance_account_id) {
    const { data: account, error: accountError } = await supabase
      .from("finance_accounts")
      .select("*")
      .eq("id", formData.finance_account_id)
      .single()

    if (accountError || !account) {
      console.error("Error fetching finance account for ad spend:", accountError)
      return { success: false, error: "Finance account not found" }
    }

    financeAccount = account as FinanceAccount
  }

  const { data: category, error: categoryError } = await supabase
    .from("finance_categories")
    .select("id, name")
    .eq("name", "Advertising")
    .single()

  if (categoryError || !category) {
    console.error("Error fetching advertising finance category:", categoryError)
    return { success: false, error: "Advertising finance category not found" }
  }

  const { data, error } = await supabase
    .from("ad_spend_entries")
    .insert([{
      campaign_id: formData.campaign_id,
      entry_date: formData.entry_date,
      amount: formData.amount,
      finance_account_id: formData.finance_account_id || null,
      payment_method: formData.payment_method,
      notes: formData.notes,
    }])
    .select()
    .single()

  if (error) {
    console.error("Error adding spend entry:", error)
    return { success: false, error: error.message }
  }

  if (financeAccount) {
    const { data: financeEntry, error: financeError } = await supabase
      .from("finance_entries")
      .insert([{
        entry_date: formData.entry_date,
        account_id: financeAccount.id,
        category_id: category.id,
        direction: "out",
        amount: formData.amount,
        source: "automatic",
        reference_type: "ad_spend_entry",
        reference_id: data.id,
        vendor: null,
        notes: formData.notes,
        created_by: user?.id || null,
      }])
      .select()
      .single()

    if (financeError) {
      console.error("Error creating linked finance entry for ad spend:", financeError)
      await supabase.from("ad_spend_entries").delete().eq("id", data.id)
      return { success: false, error: financeError.message }
    }

    const { error: linkError } = await supabase
      .from("ad_spend_entries")
      .update({ finance_entry_id: financeEntry.id })
      .eq("id", data.id)

    if (linkError) {
      console.error("Error linking finance entry to ad spend entry:", linkError)
      return { success: false, error: linkError.message }
    }

    ;(data as any).finance_entry_id = financeEntry.id
  }

  revalidatePath("/ad-campaigns")
  revalidatePath(`/ad-campaigns/${formData.campaign_id}`)
  revalidatePath("/finance")

  const campaign = await getCampaignById(formData.campaign_id)
  await safeRecordAutomaticChangelogEntry({
    area: "ads",
    action_summary: "Added ad spend entry",
    entity_type: "campaign",
    entity_id: formData.campaign_id,
    entity_label: campaign?.campaign_name || `Campaign ${formData.campaign_id}`,
    notes: data.notes,
    items: [
      buildChangeItem("Entry date", null, data.entry_date),
      buildChangeItem("Amount", null, data.amount),
      buildChangeItem("Funding account", null, financeAccount?.name || null),
      buildChangeItem("Payment method", null, data.payment_method),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

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

  const { data: existingSpend } = await supabase
    .from("ad_spend_entries")
    .select("*")
    .eq("id", id)
    .single()

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
  revalidatePath("/finance")

  if (existingSpend?.finance_entry_id) {
    const { error: financeDeleteError } = await supabase
      .from("finance_entries")
      .delete()
      .eq("id", existingSpend.finance_entry_id)

    if (financeDeleteError) {
      console.error("Error deleting linked finance entry for ad spend:", financeDeleteError)
      return { success: false, error: financeDeleteError.message }
    }
  }

  if (existingSpend) {
    const campaign = await getCampaignById(campaignId)
    let financeAccountName: string | null = null
    if (existingSpend.finance_account_id) {
      const { data: financeAccount } = await supabase
        .from("finance_accounts")
        .select("name")
        .eq("id", existingSpend.finance_account_id)
        .single()
      financeAccountName = financeAccount?.name || null
    }
    await safeRecordAutomaticChangelogEntry({
      area: "ads",
      action_summary: "Deleted ad spend entry",
      entity_type: "campaign",
      entity_id: campaignId,
      entity_label: campaign?.campaign_name || `Campaign ${campaignId}`,
      notes: existingSpend.notes,
      items: [
        buildChangeItem("Entry date", existingSpend.entry_date, null),
        buildChangeItem("Amount", existingSpend.amount, null),
        buildChangeItem("Funding account", financeAccountName, null),
        buildChangeItem("Payment method", existingSpend.payment_method, null),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

  return { success: true }
}

// ============================================================================
// ANALYTICS & METRICS
// ============================================================================

type AttributedOrderMetric = {
  id: string
  order_id: string
  channel: Channel
  order_date: string
  status: string
  revenue: number
  net_profit: number
  line_items_with_names: Array<{
    id: string
    sku: string
    quantity: number
    selling_price: number
    cost_per_unit_snapshot: number | null
    product_name: string
  }>
}

type CampaignMetric = {
  campaign: AdCampaign
  total_spend: number
  orders_count: number
  revenue: number
  profit: number
  roas: number
  cost_per_order: number
  attributed_orders: AttributedOrderMetric[]
}

async function getCampaignMetricsBatch(options?: {
  campaignIds?: string[]
  status?: CampaignStatus
  includeAttributedOrders?: boolean
}) {
  const supabase = await createClient()

  let campaignsQuery = supabase
    .from("ad_campaigns")
    .select("*")
    .order("start_date", { ascending: false })

  if (options?.status) {
    campaignsQuery = campaignsQuery.eq("status", options.status)
  }

  if (options?.campaignIds?.length) {
    campaignsQuery = campaignsQuery.in("id", options.campaignIds)
  }

  const { data: campaigns, error: campaignsError } = await campaignsQuery

  if (campaignsError) {
    console.error("Error fetching campaigns for metrics:", campaignsError)
    return {
      campaigns: [] as AdCampaign[],
      summaries: [] as Array<{
        id: string
        campaign_name: string
        platform: AdPlatform
        start_date: string
        end_date: string | null
        target_channels: Channel[]
        status: CampaignStatus
        total_spend: number
        orders_count: number
        revenue: number
        profit: number
        roas: number
        cost_per_order: number
      }>,
      metricsById: new Map<string, CampaignMetric>(),
    }
  }

  if (!campaigns || campaigns.length === 0) {
    return {
      campaigns: [] as AdCampaign[],
      summaries: [] as Array<{
        id: string
        campaign_name: string
        platform: AdPlatform
        start_date: string
        end_date: string | null
        target_channels: Channel[]
        status: CampaignStatus
        total_spend: number
        orders_count: number
        revenue: number
        profit: number
        roas: number
        cost_per_order: number
      }>,
      metricsById: new Map<string, CampaignMetric>(),
    }
  }

  const today = new Date().toISOString().split("T")[0]
  const allChannels = Array.from(new Set(campaigns.flatMap((campaign) => campaign.target_channels)))
  const globalStartDate = campaigns.reduce(
    (min, campaign) => campaign.start_date < min ? campaign.start_date : min,
    campaigns[0].start_date
  )
  const globalEndDate = campaigns.reduce((max, campaign) => {
    const campaignEnd = campaign.end_date || today
    return campaignEnd > max ? campaignEnd : max
  }, campaigns[0].end_date || today)

  const [ordersResult, productsResult] = await Promise.all([
    allChannels.length > 0
      ? supabase
          .from("orders")
          .select(`
            id,
            order_id,
            channel,
            order_date,
            status,
            channel_fees,
            order_line_items (
              id,
              sku,
              quantity,
              selling_price,
              cost_per_unit_snapshot
            )
          `)
          .in("channel", allChannels)
          .gte("order_date", globalStartDate)
          .lte("order_date", globalEndDate)
          .in("status", ["paid", "shipped"])
      : Promise.resolve({ data: [], error: null }),
    supabase.from("products").select("sku, name, cost_per_unit"),
  ])

  if (ordersResult.error) {
    console.error("Error fetching attributed orders:", ordersResult.error)
  }

  if (productsResult.error) {
    console.error("Error fetching products for campaign metrics:", productsResult.error)
  }

  const productMap = new Map((productsResult.data || []).map((product) => [product.sku, product]))
  const decoratedOrdersByChannel = new Map<Channel, AttributedOrderMetric[]>()

  for (const order of (ordersResult.data || []) as any[]) {
    const lineItems = order.order_line_items || []
    const totalSellingPrice = lineItems.reduce(
      (sum: number, item: any) => sum + (item.selling_price * item.quantity),
      0
    )
    const revenue = totalSellingPrice - (order.channel_fees || 0)
    const totalCogs = lineItems.reduce((sum: number, item: any) => {
      const product = productMap.get(item.sku)
      return sum + getLineItemTotalCost(item, product)
    }, 0)

    const decoratedOrder: AttributedOrderMetric = {
      id: order.id,
      order_id: order.order_id,
      channel: order.channel,
      order_date: order.order_date,
      status: order.status,
      revenue,
      net_profit: revenue - totalCogs,
      line_items_with_names: lineItems.map((item: any) => ({
        ...item,
        product_name: productMap.get(item.sku)?.name || "Unknown",
      })),
    }

    const existing = decoratedOrdersByChannel.get(order.channel) || []
    existing.push(decoratedOrder)
    decoratedOrdersByChannel.set(order.channel, existing)
  }

  for (const orders of decoratedOrdersByChannel.values()) {
    orders.sort((a, b) => b.order_date.localeCompare(a.order_date))
  }

  const metricsById = new Map<string, CampaignMetric>()
  const summaries: Array<{
    id: string
    campaign_name: string
    platform: AdPlatform
    start_date: string
    end_date: string | null
    target_channels: Channel[]
    status: CampaignStatus
    total_spend: number
    orders_count: number
    revenue: number
    profit: number
    roas: number
    cost_per_order: number
  }> = []

  for (const campaign of campaigns) {
    const targetChannels: Channel[] = Array.from(new Set<Channel>(campaign.target_channels))
    const campaignEnd = campaign.end_date || today
    const attributedOrders = targetChannels
      .flatMap((channel) => decoratedOrdersByChannel.get(channel) || [])
      .filter((order) => order.order_date >= campaign.start_date && order.order_date <= campaignEnd)

    const totalRevenue = attributedOrders.reduce((sum, order) => sum + order.revenue, 0)
    const totalProfit = attributedOrders.reduce((sum, order) => sum + order.net_profit, 0)
    const ordersCount = attributedOrders.length
    const roas = campaign.total_spend > 0 ? totalRevenue / campaign.total_spend : 0
    const costPerOrder = ordersCount > 0 ? campaign.total_spend / ordersCount : 0

    metricsById.set(campaign.id, {
      campaign,
      total_spend: campaign.total_spend,
      orders_count: ordersCount,
      revenue: totalRevenue,
      profit: totalProfit,
      roas,
      cost_per_order: costPerOrder,
      attributed_orders: options?.includeAttributedOrders ? attributedOrders : [],
    })

    summaries.push({
      id: campaign.id,
      campaign_name: campaign.campaign_name,
      platform: campaign.platform,
      start_date: campaign.start_date,
      end_date: campaign.end_date,
      target_channels: campaign.target_channels,
      status: campaign.status,
      total_spend: campaign.total_spend,
      orders_count: ordersCount,
      revenue: totalRevenue,
      profit: totalProfit,
      roas,
      cost_per_order: costPerOrder,
    })
  }

  return {
    campaigns: campaigns as AdCampaign[],
    summaries,
    metricsById,
  }
}

export async function getCampaignMetrics(campaignId: string) {
  const { metricsById } = await getCampaignMetricsBatch({
    campaignIds: [campaignId],
    includeAttributedOrders: true,
  })

  return metricsById.get(campaignId) || null
}

export async function getAllCampaignsMetrics(filters?: { status?: CampaignStatus }) {
  const { summaries } = await getCampaignMetricsBatch({
    status: filters?.status,
  })

  return summaries
}

export async function getAdPerformanceSummary() {
  const { campaigns, summaries } = await getCampaignMetricsBatch()

  if (campaigns.length === 0) {
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

  const totalAdSpend = summaries.reduce((sum, campaign) => sum + campaign.total_spend, 0)
  const totalRevenue = summaries.reduce((sum, campaign) => sum + campaign.revenue, 0)
  const totalOrders = summaries.reduce((sum, campaign) => sum + campaign.orders_count, 0)
  const activeCampaignsCount = campaigns.filter((campaign) => campaign.status === "active").length

  return {
    total_ad_spend: totalAdSpend,
    total_revenue: totalRevenue,
    overall_roas: totalAdSpend > 0 ? totalRevenue / totalAdSpend : 0,
    total_orders: totalOrders,
    avg_cost_per_order: totalOrders > 0 ? totalAdSpend / totalOrders : 0,
    active_campaigns_count: activeCampaignsCount,
    campaigns_metrics: summaries,
  }
}
