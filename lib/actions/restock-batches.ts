"use server"

import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { InventoryPurchaseBatch, InventoryPurchaseBatchItem, Product } from "@/lib/types/database.types"

export type RestockBatchItem = InventoryPurchaseBatchItem & { product_name: string; variant: string | null }
export type RestockBatch = InventoryPurchaseBatch & { items: RestockBatchItem[] }

/** Restock batches with their line items, newest first. */
export const getInventoryPurchaseBatches = cache(async (filters?: { limit?: number }): Promise<RestockBatch[]> => {
  const supabase = await createClient()

  let batchQuery = supabase
    .from("inventory_purchase_batches")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false })
  if (filters?.limit) batchQuery = batchQuery.limit(filters.limit)

  const [{ data: batches, error }, { data: products }] = await Promise.all([
    batchQuery,
    supabase.from("products").select("sku, name, variant"),
  ])
  if (error) {
    console.error("Error fetching restock batches:", error)
    return []
  }
  const typedBatches = (batches || []) as InventoryPurchaseBatch[]
  if (typedBatches.length === 0) return []

  const { data: items, error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .select("*")
    .in("batch_id", typedBatches.map((batch) => batch.id))
  if (itemsError) {
    console.error("Error fetching restock batch items:", itemsError)
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
