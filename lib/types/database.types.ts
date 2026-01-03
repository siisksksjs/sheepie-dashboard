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
  created_at: string
}

export type BundleComposition = {
  id: string
  bundle_sku: string
  component_sku: string
  quantity: number
  created_at: string
}
