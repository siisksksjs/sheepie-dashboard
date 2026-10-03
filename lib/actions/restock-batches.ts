"use server"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import { fetchAllRows } from "@/lib/supabase/fetch-all"
import type { InventoryPurchaseBatch, InventoryPurchaseBatchItem, Product, RestockStatus } from "@/lib/types/database.types"

export type RestockBatchItem = InventoryPurchaseBatchItem & { product_name: string; variant: string | null }
export type RestockBatch = InventoryPurchaseBatch & { items: RestockBatchItem[] }

/** Restock batches with their line items, newest first. */
export const getInventoryPurchaseBatches = cache(async (filters?: { limit?: number; status?: RestockStatus; throwOnError?: boolean }): Promise<RestockBatch[]> => {
  const supabase = await createClient()

  const buildBatchQuery = () => {
    let query = supabase
      .from("inventory_purchase_batches")
      .select("*")
      .order("entry_date", { ascending: false })
      .order("created_at", { ascending: false })
      .order("id")
    if (filters?.status) query = query.eq("restock_status", filters.status)
    if (filters?.limit) query = query.limit(filters.limit)
    return query
  }

  const [{ data: batches, error }, { data: products }] = await Promise.all([
    filters?.limit ? buildBatchQuery() : fetchAllRows<InventoryPurchaseBatch>(buildBatchQuery),
    supabase.from("products").select("sku, name, variant"),
  ])
  if (error) {
    console.error("Error fetching restock batches:", error)
    if (filters?.throwOnError) throw new Error("Could not load incoming restocks.")
    return []
  }
  const typedBatches = (batches || []) as InventoryPurchaseBatch[]
  if (typedBatches.length === 0) return []

  const { data: items, error: itemsError } = await fetchAllRows<InventoryPurchaseBatchItem>(() => supabase
    .from("inventory_purchase_batch_items")
    .select("*")
    .in("batch_id", typedBatches.map((batch) => batch.id))
    .order("id"))
  if (itemsError) {
    console.error("Error fetching restock batch items:", itemsError)
    if (filters?.throwOnError) throw new Error("Could not load incoming restock items.")
    return []
  }

  const productMap = new Map(((products || []) as Pick<Product, "sku" | "name" | "variant">[]).map((p) => [p.sku, p]))
  const itemsByBatch = new Map<string, RestockBatchItem[]>()
  for (const item of (items || []) as InventoryPurchaseBatchItem[]) {
    const product = productMap.get(item.sku)
    const list = itemsByBatch.get(item.batch_id) || []
    list.push({ ...item, product_name: product?.name || item.sku, variant: product?.variant || null })
    itemsByBatch.set(item.batch_id, list)
  }
  return typedBatches.map((batch) => ({ ...batch, items: itemsByBatch.get(batch.id) || [] }))
})

export async function getIncomingRestocks() {
  try {
    return {
      available: true,
      batches: await getInventoryPurchaseBatches({ status: "in_transit", throwOnError: true }),
    }
  } catch {
    return { available: false, batches: [] as RestockBatch[] }
  }
}
