import { cache } from "react"
import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import type { Channel, FinanceCategory, OrderLineItem, OrderStatus } from "@/lib/types/database.types"

const MARKETPLACE_CHANNELS: Channel[] = ["shopee", "tokopedia", "tiktok"]
const SETTLED_ORDER_STATUSES: OrderStatus[] = ["paid", "shipped"]

type MarketplaceChannelMappingRow = {
  channel: Channel
  finance_account_id: string
}

export function isMarketplaceChannel(channel: Channel) {
  return MARKETPLACE_CHANNELS.includes(channel)
}

export function isSettledOrderStatus(status: OrderStatus) {
  return SETTLED_ORDER_STATUSES.includes(status)
}

export function calculateOrderSettlementAmount(
  lineItems: Array<Pick<OrderLineItem, "quantity" | "selling_price">>,
  channelFees: number | null
) {
  const grossAmount = lineItems.reduce((sum, item) => sum + (item.quantity * item.selling_price), 0)
  return grossAmount - (channelFees || 0)
}

const getMarketplaceSettlementCategory = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("finance_categories")
    .select("*")
    .eq("kind", "marketplace_settlement")
    .single()

  if (error) {
    console.error("Error fetching marketplace settlement category:", error)
    return null as FinanceCategory | null
  }

  return data as FinanceCategory
})

export const getMarketplaceChannelAccountMappings = cache(async () => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("marketplace_channel_accounts")
    .select("channel, finance_account_id")

  if (error) {
    console.error("Error fetching marketplace channel account mappings:", error)
    return [] as MarketplaceChannelMappingRow[]
  }

  return (data || []) as MarketplaceChannelMappingRow[]
})

export async function getMarketplaceSettlementAccountId(channel: Channel) {
  if (!isMarketplaceChannel(channel)) {
    return null
  }

  const mappings = await getMarketplaceChannelAccountMappings()
  return mappings.find((mapping) => mapping.channel === channel)?.finance_account_id || null
}

async function insertMarketplaceSettlementEntry(input: {
  orderId: string
  orderLabel: string
  channel: Channel
  entryDate: string
  amount: number
  direction: "in" | "out"
  notes?: string | null
}) {
  if (!isMarketplaceChannel(input.channel) || input.amount <= 0) {
    return { success: true, skipped: true as const }
  }

  const [accountId, category] = await Promise.all([
    getMarketplaceSettlementAccountId(input.channel),
    getMarketplaceSettlementCategory(),
  ])

  if (!accountId || !category) {
    return { success: true, skipped: true as const }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { error } = await supabase
    .from("finance_entries")
    .insert([{
      entry_date: input.entryDate,
      account_id: accountId,
      category_id: category.id,
      direction: input.direction,
      amount: input.amount,
      source: "automatic",
      reference_type: input.direction === "in" ? "order_marketplace_settlement" : "order_marketplace_reversal",
      reference_id: input.orderId,
      vendor: input.channel,
      notes: input.notes?.trim() || `${input.orderLabel} • ${input.direction === "in" ? "Settlement posted" : "Settlement reversed"}`,
      created_by: user?.id || null,
    }])

  if (error) {
    console.error("Error creating marketplace settlement entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/finance")
  revalidatePath("/dashboard")

  return { success: true }
}

export async function createMarketplaceSettlementEntry(input: {
  orderId: string
  orderLabel: string
  channel: Channel
  entryDate: string
  amount: number
  notes?: string | null
}) {
  return insertMarketplaceSettlementEntry({
    ...input,
    direction: "in",
  })
}

export async function createMarketplaceSettlementReversalEntry(input: {
  orderId: string
  orderLabel: string
  channel: Channel
  entryDate: string
  amount: number
  notes?: string | null
}) {
  return insertMarketplaceSettlementEntry({
    ...input,
    direction: "out",
  })
}
