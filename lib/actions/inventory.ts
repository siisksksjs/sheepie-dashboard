"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { InventoryLedger, StockOnHand, MovementType } from "@/lib/types/database.types"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildChangeItem } from "@/lib/changelog"
import { triggerNotificationSender } from "@/lib/notifications/trigger-sender"
import { buildInventoryLedgerRows } from "@/lib/inventory/ledger-entries"

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
  const { data: product, error: productError } = await supabase
    .from("products")
    .select("sku, name, variant, is_bundle")
    .eq("sku", formData.sku)
    .maybeSingle()

  if (productError) {
    console.error("Error loading ledger product:", productError)
    return { success: false, error: productError.message }
  }

  if (!product) {
    return { success: false, error: `Product ${formData.sku} was not found` }
  }

  let compositions: { component_sku: string; quantity: number }[] = []

  if (product.is_bundle) {
    const { data, error } = await supabase
      .from("bundle_compositions")
      .select("component_sku, quantity")
      .eq("bundle_sku", product.sku)

    if (error) {
      console.error("Error loading bundle composition:", error)
      return { success: false, error: error.message }
    }

    compositions = data || []
  }

  const ledgerRows = buildInventoryLedgerRows({
    formData,
    createdBy: user?.id || null,
    isBundle: product.is_bundle,
    compositions,
  })

  if (ledgerRows.error) {
    return { success: false, error: ledgerRows.error }
  }

  const affectedSkus = ledgerRows.rows.map((row) => row.sku)
  const { data: stockBeforeRows } = await supabase
    .from("stock_on_hand")
    .select("sku, name, variant, current_stock")
    .in("sku", affectedSkus)

  const { data: insertedRows, error } = await supabase
    .from("inventory_ledger")
    .insert(ledgerRows.rows)
    .select()

  if (error) {
    console.error("Error creating ledger entry:", error)
    return { success: false, error: error.message }
  }

  const entries = (insertedRows || []) as InventoryLedger[]

  if (entries.length !== ledgerRows.rows.length) {
    return { success: false, error: "Ledger insert did not return every created entry" }
  }

  revalidatePath("/ledger")
  revalidatePath("/dashboard")
  revalidatePath("/products")

  const notificationResult = await triggerNotificationSender()
  if (!notificationResult.success && !notificationResult.skipped) {
    console.error("Error triggering notification sender:", notificationResult.error)
  }

  const { data: stockAfterRows } = await supabase
    .from("stock_on_hand")
    .select("sku, name, variant, current_stock")
    .in("sku", affectedSkus)

  if (!options?.skipMilestoneChangelog) {
    const stockBeforeBySku = new Map(
      (stockBeforeRows || []).map((row) => [row.sku, row.current_stock]),
    )
    const loggedAt = formData.entry_date
      ? new Date(`${formData.entry_date}T00:00:00.000Z`).toISOString()
      : new Date().toISOString()

    for (const stockAfter of stockAfterRows || []) {
      const insertedEntry = entries.find((entry) => entry.sku === stockAfter.sku)
      if (!insertedEntry) continue

      const previousStock = stockBeforeBySku.get(stockAfter.sku) ?? 0
      const currentStock = stockAfter.current_stock
      const productLabel = `${stockAfter.name}${stockAfter.variant ? ` - ${stockAfter.variant}` : ""} (${stockAfter.sku})`

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
            buildChangeItem("Movement type", null, insertedEntry.movement_type),
            buildChangeItem("Quantity change", null, insertedEntry.quantity),
            buildChangeItem("Entry date", null, insertedEntry.entry_date),
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
            buildChangeItem("Movement type", null, insertedEntry.movement_type),
            buildChangeItem("Quantity change", null, insertedEntry.quantity),
            buildChangeItem("Entry date", null, insertedEntry.entry_date),
          ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
        })
      }
    }
  }

  if (!options?.skipChangelog) {
    const productName = formatProductName(product.name, product.variant)
    const productLabel = `${productName} (${product.sku})`
    const componentDeductions = entries.length > 1 || entries[0]?.sku !== formData.sku
      ? entries.map((entry) => `${entry.sku} ${entry.quantity}`).join("; ")
      : null

    await safeRecordAutomaticChangelogEntry({
      area: "inventory",
      action_summary: options?.actionSummary || getInventoryActionSummary(formData.movement_type, productName),
      entity_type: "product",
      entity_id: product.sku,
      entity_label: productLabel,
      notes: options?.notes || null,
      items: [
        buildChangeItem("Movement type", null, formData.movement_type),
        buildChangeItem("Quantity", null, formData.quantity),
        buildChangeItem("Entry date", null, entries[0]?.entry_date),
        buildChangeItem("Reference", null, formData.reference),
        buildChangeItem("Component deductions", null, componentDeductions),
      ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
    })
  }

  return { success: true, data: entries[0], entries }
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
