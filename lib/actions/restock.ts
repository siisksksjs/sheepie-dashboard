"use server"

import { revalidatePath } from "next/cache"

import { buildChangeItem } from "@/lib/changelog"
import { buildArrivalChangelogItems } from "@/lib/restock/guidance"
import { createClient } from "@/lib/supabase/server"
import type {
  FinanceEntry,
  InventoryPurchaseBatch,
  ShippingMode,
} from "@/lib/types/database.types"

import { safeRecordAutomaticChangelogEntry } from "./changelog"

type RestockItemInput = {
  sku: string
  quantity: number
  unit_cost: number
}

function formatRestockLabel(batchId: string, vendor?: string | null) {
  const normalizedVendor = vendor?.trim()
  return normalizedVendor ? normalizedVendor : `Restock ${batchId}`
}

function normalizeRestockItems(items: RestockItemInput[]) {
  return items
    .filter((item) => item.sku && item.quantity > 0 && item.unit_cost >= 0)
    .map((item) => ({
      ...item,
      total_cost: item.quantity * item.unit_cost,
    }))
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
  account_id: string
  vendor?: string | null
  notes?: string | null
  items: RestockItemInput[]
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const validItems = normalizeRestockItems(input.items)

  if (validItems.length === 0) {
    return { success: false, error: "At least one valid restock item is required" }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.total_cost, 0)
  const trimmedVendor = input.vendor?.trim() || null
  const trimmedNotes = input.notes?.trim() || null

  const [{ data: account, error: accountError }, { data: purchaseCategory, error: categoryError }] =
    await Promise.all([
      supabase
        .from("finance_accounts")
        .select("id, name")
        .eq("id", input.account_id)
        .single(),
      supabase
        .from("finance_categories")
        .select("id")
        .eq("kind", "inventory_purchase")
        .eq("is_active", true)
        .limit(1)
        .maybeSingle(),
    ])

  if (accountError || !account || categoryError || !purchaseCategory) {
    if (accountError) {
      console.error("Error loading finance account for restock:", accountError)
    }

    if (categoryError) {
      console.error("Error loading inventory purchase category for restock:", categoryError)
    }

    return { success: false, error: "Inventory purchase setup is incomplete" }
  }

  const { data: batch, error: batchError } = await supabase
    .from("inventory_purchase_batches")
    .insert([
      {
        entry_date: input.order_date,
        order_date: input.order_date,
        shipping_mode: input.shipping_mode,
        restock_status: "in_transit",
        vendor: trimmedVendor,
        account_id: input.account_id,
        total_amount: totalAmount,
        notes: trimmedNotes,
        created_by: user?.id || null,
      },
    ])
    .select()
    .single()

  if (batchError) {
    console.error("Error creating restock batch:", batchError)
    return { success: false, error: batchError.message }
  }

  const { error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .insert(
      validItems.map((item) => ({
        batch_id: batch.id,
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
      })),
    )

  if (itemsError) {
    console.error("Error creating restock batch items:", itemsError)
    return { success: false, error: itemsError.message }
  }

  const { data: financeEntry, error: financeEntryError } = await supabase
    .from("finance_entries")
    .insert([
      {
        entry_date: input.order_date,
        account_id: input.account_id,
        category_id: purchaseCategory.id,
        direction: "out",
        amount: totalAmount,
        source: "automatic",
        reference_type: "inventory_purchase_batch",
        reference_id: batch.id,
        vendor: trimmedVendor,
        notes: trimmedNotes,
        created_by: user?.id || null,
      },
    ])
    .select()
    .single()

  if (financeEntryError) {
    console.error("Error creating finance entry for restock:", financeEntryError)
    return { success: false, error: financeEntryError.message }
  }

  const { error: updateBatchError } = await supabase
    .from("inventory_purchase_batches")
    .update({ finance_entry_id: (financeEntry as FinanceEntry).id })
    .eq("id", batch.id)

  if (updateBatchError) {
    console.error("Error linking finance entry to restock batch:", updateBatchError)
    return { success: false, error: updateBatchError.message }
  }

  revalidateRestockCreatePaths()

  await safeRecordAutomaticChangelogEntry({
    area: "finance",
    action_summary: "Created inventory purchase",
    entity_type: "inventory_purchase_batch",
    entity_id: batch.id,
    entity_label: formatRestockLabel(batch.id, trimmedVendor),
    notes: trimmedNotes,
    items: [
      buildChangeItem("Entry date", null, input.order_date),
      buildChangeItem("Account", null, account.name),
      buildChangeItem("Shipping mode", null, input.shipping_mode),
      buildChangeItem("Vendor", null, trimmedVendor),
      buildChangeItem("Total amount", null, totalAmount),
      buildChangeItem(
        "Items",
        null,
        validItems.map((item) => `${item.sku} x${item.quantity} @ ${item.unit_cost}`),
      ),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return {
    success: true,
    data: {
      ...batch,
      finance_entry_id: (financeEntry as FinanceEntry).id,
    } as InventoryPurchaseBatch,
  }
}

export async function markRestockArrived(input: {
  batch_id: string
  arrival_date: string
}) {
  const supabase = await createClient()

  const [{ data: batch, error: batchError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabase
        .from("inventory_purchase_batches")
        .select("id, order_date, arrival_date, shipping_mode, vendor, notes")
        .eq("id", input.batch_id)
        .single(),
      supabase
        .from("inventory_purchase_batch_items")
        .select("sku, quantity")
        .eq("batch_id", input.batch_id),
    ])

  if (batchError || !batch) {
    if (batchError) {
      console.error("Error loading restock batch for arrival:", batchError)
    }

    return { success: false, error: "Restock batch not found" }
  }

  if (itemsError) {
    console.error("Error loading restock batch items for arrival:", itemsError)
    return { success: false, error: itemsError.message }
  }

  if (!batch.shipping_mode) {
    return { success: false, error: "Restock shipping mode is required before arrival" }
  }

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

  await safeRecordAutomaticChangelogEntry({
    logged_at: `${input.arrival_date}T00:00:00.000Z`,
    area: "inventory",
    action_summary: "Restock arrived from China",
    entity_type: "inventory_purchase_batch",
    entity_id: input.batch_id,
    entity_label: formatRestockLabel(input.batch_id, batch.vendor),
    notes: batch.notes,
    items: [
      ...buildArrivalChangelogItems({
        orderDate: batch.order_date,
        arrivalDate: input.arrival_date,
        shippingMode: batch.shipping_mode,
        items: (items || []).map((item) => ({
          sku: item.sku,
          quantity: item.quantity,
        })),
      }),
      buildChangeItem("Vendor", null, batch.vendor),
    ].filter((item): item is NonNullable<typeof item> => Boolean(item)),
  })

  return { success: true }
}
