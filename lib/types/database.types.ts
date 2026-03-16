// Database types matching Supabase schema

export type Product = {
  id: string
  sku: string
  name: string
  variant: string | null
  cost_per_unit: number
  reorder_point: number
  is_bundle: boolean
  status: 'active' | 'discontinued'
  created_at: string
  updated_at: string
}

export type MovementType =
  | 'IN_PURCHASE'
  | 'OUT_SALE'
  | 'OUT_PROMO'
  | 'OUT_DAMAGE'
  | 'RETURN'
  | 'ADJUSTMENT'

export type InventoryLedger = {
  id: string
  entry_date: string
  sku: string
  movement_type: MovementType
  quantity: number
  reference: string | null
  created_by: string | null
  created_at: string
}

export type StockOnHand = {
  id: string
  sku: string
  name: string
  variant: string | null
  cost_per_unit: number
  current_stock: number
  reorder_point: number
  status: 'active' | 'discontinued'
  is_bundle: boolean
  is_low_stock: boolean
  created_at: string
  updated_at: string
}

export type Channel = 'shopee' | 'tokopedia' | 'tiktok' | 'offline'

export type OrderStatus = 'paid' | 'shipped' | 'cancelled' | 'returned'

export type Order = {
  id: string
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type OrderLineItem = {
  id: string
  order_id: string
  sku: string
  quantity: number
  selling_price: number
  cost_per_unit_snapshot: number | null
  created_at: string
}

export type BundleComposition = {
  id: string
  bundle_sku: string
  component_sku: string
  quantity: number
  created_at: string
}

export type AdPlatform = 'tiktok_ads' | 'shopee_ads' | 'facebook_ads' | 'google_ads'

export type CampaignStatus = 'active' | 'completed' | 'paused'

export type AdCampaign = {
  id: string
  campaign_name: string
  platform: AdPlatform
  start_date: string
  end_date: string | null
  total_spend: number
  target_channels: Channel[]
  notes: string | null
  status: CampaignStatus
  created_at: string
  updated_at: string
}

export type AdSpendEntry = {
  id: string
  campaign_id: string
  entry_date: string
  amount: number
  payment_method: string | null
  notes: string | null
  created_at: string
}

export type ChangelogSource = 'manual' | 'automatic'

export type ChangelogEntry = {
  id: string
  logged_at: string
  area: string
  source: ChangelogSource
  action_summary: string
  entity_type: string
  entity_id: string | null
  entity_label: string
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type ChangelogItem = {
  id: string
  entry_id: string
  field_name: string
  old_value: string | null
  new_value: string | null
  display_order: number
  created_at: string
}

export type ChangelogEntryWithItems = ChangelogEntry & {
  changelog_items: ChangelogItem[]
}
