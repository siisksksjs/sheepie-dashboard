"use server"

import { revalidatePath } from "next/cache"

import { resolveRestockItemCosts } from "@/lib/restock/item-costs"
import { createClient } from "@/lib/supabase/server"
import type {
  InventoryPurchaseBatch,
  ShippingMode,
} from "@/lib/types/database.types"

type RestockItemInput = {
  sku: string
  quantity: number
  unit_cost: number | null
}

async function normalizeRestockItems(supabase: Awaited<ReturnType<typeof createClient>>, items: RestockItemInput[]) {
  const candidateItems = items.filter(
    (item) => item.sku && item.quantity > 0 && (item.unit_cost === null || item.unit_cost >= 0),
  )
  const fallbackSkus = Array.from(
    new Set(candidateItems.filter((item) => item.unit_cost === null).map((item) => item.sku)),
  )

  const { data: products, error: productsError } = fallbackSkus.length === 0
    ? { data: [] as Array<{ sku: string; cost_per_unit: number }>, error: null }
    : await supabase
      .from("products")
      .select("sku, cost_per_unit")
      .in("sku", fallbackSkus)

  if (productsError) {
    console.error("Error loading product costs for restock:", productsError)
    return { items: [], missingCostSkus: [], totalAmount: 0, error: "Failed to load product costs" }
  }

  const productCosts = new Map((products || []).map((product) => [product.sku, product.cost_per_unit]))

  return {
    ...resolveRestockItemCosts({
      items: candidateItems,
      productCosts,
    }),
    error: null as string | null,
  }
}

function revalidateRestockCreatePaths() {
  revalidatePath("/restock")
  revalidatePath("/finance")
  revalidatePath("/dashboard")
}

function revalidateRestockArrivalPaths() {
  revalidatePath("/restock")
  revalidatePath("/finance")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")
  revalidatePath("/products")
  revalidatePath("/changelog")
}

export async function createRestock(input: {
  order_date: string
  shipping_mode: ShippingMode
  account_id?: string | null
  vendor?: string | null
  notes?: string | null
  items: RestockItemInput[]
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const normalizedItems = await normalizeRestockItems(supabase, input.items)

  if (normalizedItems.error) {
    return { success: false, error: normalizedItems.error }
  }

  if (normalizedItems.missingCostSkus.length > 0) {
    return {
      success: false,
      error: `Missing product cost for SKU(s): ${normalizedItems.missingCostSkus.join(", ")}`,
    }
  }

  const validItems = normalizedItems.items

  if (validItems.length === 0) {
    return { success: false, error: "At least one valid restock item is required" }
  }

  if (normalizedItems.totalAmount <= 0) {
    return { success: false, error: "Restock total amount must be greater than zero" }
  }

  const trimmedVendor = input.vendor?.trim() || null
  const trimmedNotes = input.notes?.trim() || null

  const { data: batchId, error: rpcError } = await supabase.rpc(
    "create_inventory_purchase_restock",
    {
      target_order_date: input.order_date,
      target_shipping_mode: input.shipping_mode,
      target_account_id: input.account_id || null,
      target_vendor: trimmedVendor,
      target_notes: trimmedNotes,
      target_created_by: user?.id || null,
      target_items: validItems,
    },
  )

  if (rpcError) {
    console.error("Error creating restock batch:", rpcError)
    return { success: false, error: rpcError.message }
  }

  const { data: batch, error: batchError } = await supabase
    .from("inventory_purchase_batches")
    .select("*")
    .eq("id", batchId)
    .single()

  if (batchError || !batch) {
    console.error("Error loading created restock batch:", batchError)
    revalidateRestockCreatePaths()
    return { success: true, id: batchId }
  }

  revalidateRestockCreatePaths()

  return {
    success: true,
    data: batch as InventoryPurchaseBatch,
  }
}

export async function markRestockArrived(input: {
  batch_id: string
  arrival_date: string
}) {
  const supabase = await createClient()

  const { error: rpcError } = await supabase.rpc(
    "process_inventory_purchase_arrival",
    {
      target_batch_id: input.batch_id,
      target_arrival_date: input.arrival_date,
    },
  )

  if (rpcError) {
    console.error("Error processing restock arrival:", rpcError)
    return { success: false, error: rpcError.message }
  }

  revalidateRestockArrivalPaths()

  return { success: true }
}
