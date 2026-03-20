"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { InventoryLedger, StockOnHand, MovementType } from "@/lib/types/database.types"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"

function formatProductName(name: string, variant?: string | null) {
  return variant ? `${name} - ${variant}` : name
}

function getInventoryActionSummary(
  movementType: MovementType,
  productName: string
) {
  if (movementType === "IN_PURCHASE") {
    return `${productName} Purchase IN`
  }

  return "Added inventory ledger entry"
}

export async function getStockOnHand() {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("stock_on_hand")
    .select("*")
    .order("sku", { ascending: true })

  if (error) {
    console.error("Error fetching stock on hand:", error)
    return []
  }

  return data as StockOnHand[]
}

export async function getLedgerEntries(filters?: {
  sku?: string
  movement_type?: MovementType
  limit?: number
}) {
  const supabase = await createClient()

  let query = supabase
    .from("inventory_ledger")
    .select("*")
    .order("entry_date", { ascending: false })

  if (filters?.sku) {
    query = query.eq("sku", filters.sku)
  }

  if (filters?.movement_type) {
    query = query.eq("movement_type", filters.movement_type)
  }

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    console.error("Error fetching ledger entries:", error)
    return []
  }

  return data as InventoryLedger[]
}

export async function createLedgerEntry(formData: {
  sku: string
  movement_type: MovementType
  quantity: number
  reference: string | null
  entry_date?: string | null
}, options?: {
  skipChangelog?: boolean
  skipMilestoneChangelog?: boolean
  actionSummary?: string
  notes?: string | null
}) {
  const supabase = await createClient()

  // Get current user
  const { data: { user } } = await supabase.auth.getUser()
  const { data: stockBefore } = await supabase
    .from("stock_on_hand")
    .select("sku, name, variant, current_stock")
    .eq("sku", formData.sku)
    .maybeSingle()

  // Use provided date or default to now
  const entryData = {
    sku: formData.sku,
    movement_type: formData.movement_type,
    quantity: formData.quantity,
    reference: formData.reference,
    created_by: user?.id || null,
    ...(formData.entry_date && { entry_date: formData.entry_date }),
  }

  const { data, error } = await supabase
    .from("inventory_ledger")
    .insert([entryData])
    .select()
    .single()

  if (error) {
    console.error("Error creating ledger entry:", error)
    return { success: false, error: error.message }
  }

  revalidatePath("/ledger")
  revalidatePath("/dashboard")
  revalidatePath("/products")

  const { data: stockAfter } = await supabase
    .from("stock_on_hand")
    .select("sku, name, variant, current_stock")
    .eq("sku", data.sku)
    .maybeSingle()

  if (!options?.skipMilestoneChangelog && stockAfter) {
    const previousStock = stockBefore?.current_stock ?? 0
    const currentStock = stockAfter.current_stock
    const productLabel = `${stockAfter.name}${stockAfter.variant ? ` - ${stockAfter.variant}` : ""} (${stockAfter.sku})`
    const loggedAt = formData.entry_date
      ? new Date(`${formData.entry_date}T00:00:00.000Z`).toISOString()
      : new Date().toISOString()

    if (previousStock > 0 && currentStock <= 0) {
      await safeRecordAutomaticChangelogEntry({
        logged_at: loggedAt,
        area: "inventory",
        action_summary: "Product went out of stock",
        entity_type: "product",
        entity_id: stockAfter.sku,
        entity_label: productLabel,
        notes: formData.reference,
        items: [
          buildChangeItem("Stock on hand", previousStock, currentStock),
          buildChangeItem("Movement type", null, data.movement_type),
          buildChangeItem("Quantity change", null, data.quantity),
          buildChangeItem("Entry date", null, data.entry_date),
        ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
      })
    }

    if (previousStock <= 0 && currentStock > 0) {
      await safeRecordAutomaticChangelogEntry({
        logged_at: loggedAt,
        area: "inventory",
        action_summary: "Product restocked",
        entity_type: "product",
        entity_id: stockAfter.sku,
        entity_label: productLabel,
        notes: formData.reference,
        items: [
          buildChangeItem("Stock on hand", previousStock, currentStock),
          buildChangeItem("Movement type", null, data.movement_type),
          buildChangeItem("Quantity change", null, data.quantity),
          buildChangeItem("Entry date", null, data.entry_date),
        ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
      })
    }
  }

  if (!options?.skipChangelog) {
    const { data: product } = await supabase
      .from("products")
      .select("sku, name, variant")
      .eq("sku", data.sku)
      .single()

    const productName = product
      ? formatProductName(product.name, product.variant)
      : data.sku
    const productLabel = product
      ? `${productName} (${product.sku})`
      : data.sku

    await safeRecordAutomaticChangelogEntry({
      area: "inventory",
      action_summary: options?.actionSummary || getInventoryActionSummary(data.movement_type, productName),
      entity_type: "product",
      entity_id: data.sku,
      entity_label: productLabel,
      notes: options?.notes || null,
      items: [
        buildChangeItem("Movement type", null, data.movement_type),
        buildChangeItem("Quantity", null, data.quantity),
        buildChangeItem("Entry date", null, data.entry_date),
        buildChangeItem("Reference", null, data.reference),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

  return { success: true, data }
}

export async function getDashboardStats() {
  const supabase = await createClient()

  // Get stock on hand
  const { data: stockData } = await supabase
    .from("stock_on_hand")
    .select("*")

  const totalProducts = stockData?.length || 0
  const lowStockItems = stockData?.filter(item => item.is_low_stock).length || 0
  const totalStock = stockData?.reduce((sum, item) => sum + item.current_stock, 0) || 0

  return {
    totalProducts,
    lowStockItems,
    totalStock,
  }
}
