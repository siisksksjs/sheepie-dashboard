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

export type PackSize = 'single' | 'bundle_2' | 'bundle_3' | 'bundle_4'

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
  pack_size: PackSize
  selling_price: number
  cost_per_unit_snapshot: number | null
  created_at: string
}

export type ProductPackSize = {
  id: string
  sku: string
  pack_size: PackSize
  is_enabled: boolean
  created_at: string
  updated_at: string
}

export type ProductChannelPackPrice = {
  id: string
  sku: string
  pack_size: PackSize
  channel: Channel
  default_selling_price: number
  created_at: string
  updated_at: string
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

export type SkuAdSetupStatus = 'active' | 'paused' | 'ended'

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
  finance_account_id: string | null
  finance_entry_id: string | null
  payment_method: string | null
  notes: string | null
  created_at: string
}

export type SkuAdSetup = {
  id: string
  sku: string
  channels?: Channel[]
  channel?: Channel
  channel_scope_key?: string
  objective: string
  daily_budget_cap: number
  start_date: string
  end_date: string | null
  status: SkuAdSetupStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export type MonthlyAdSpend = {
  id: string
  month: string
  sku: string
  channels?: Channel[]
  channel?: Channel
  channel_scope_key?: string
  actual_spend: number
  notes: string | null
  finance_entry_id: string | null
  created_at: string
  updated_at: string
}

export type SkuSalesTarget = {
  id: string
  sku: string
  daily_target_units: number
  effective_from: string
  effective_to: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export type FinanceAccountType = 'bank' | 'cash' | 'ewallet'

export type FinanceCategoryKind =
  | 'operating_expense'
  | 'other_income'
  | 'inventory_purchase'
  | 'marketplace_settlement'
  | 'transfer'
  | 'adjustment'

export type FinanceEntryDirection = 'in' | 'out'

export type FinanceEntrySource = 'manual' | 'automatic'

export type FinanceAccount = {
  id: string
  name: string
  type: FinanceAccountType
  currency: string
  opening_balance: number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
}

export type MarketplaceChannelAccount = {
  channel: Channel
  finance_account_id: string
  created_at: string
  updated_at: string
}

export type FinanceCategory = {
  id: string
  name: string
  kind: FinanceCategoryKind
  group_name: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type FinanceEntry = {
  id: string
  entry_date: string
  account_id: string
  category_id: string
  direction: FinanceEntryDirection
  amount: number
  source: FinanceEntrySource
  reference_type: string | null
  reference_id: string | null
  vendor: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export type FinanceTransfer = {
  id: string
  entry_date: string
  from_account_id: string
  to_account_id: string
  amount: number
  notes: string | null
  created_by: string | null
  created_at: string
}

export type ShippingMode = 'air' | 'sea'

export type RestockStatus = 'in_transit' | 'arrived'

export type InventoryPurchaseBatch = {
  id: string
  entry_date: string
  order_date: string
  arrival_date: string | null
  restock_status: RestockStatus
  shipping_mode: ShippingMode | null
  vendor: string | null
  account_id: string
  finance_entry_id: string | null
  total_amount: number
  notes: string | null
  created_by: string | null
  created_at: string
  arrival_processed_at: string | null
}

export type InventoryPurchaseBatchItem = {
  id: string
  batch_id: string
  sku: string
  quantity: number
  unit_cost: number
  total_cost: number
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
