import type {
  ChangelogEntryWithItems,
  InventoryPurchaseBatch,
  InventoryPurchaseBatchItem,
  Product,
  ShippingMode,
} from "@/lib/types/database.types"

type ProductCostChangeEntry = Pick<
  ChangelogEntryWithItems,
  "id" | "logged_at" | "action_summary" | "notes" | "changelog_items"
>

export type ProductRestockCostRow = Pick<
  InventoryPurchaseBatchItem,
  "id" | "batch_id" | "sku" | "quantity" | "unit_cost" | "total_cost"
> & {
  batch: Pick<
    InventoryPurchaseBatch,
    "id" | "entry_date" | "order_date" | "arrival_date" | "shipping_mode" | "vendor" | "notes"
  >
}

export type ProductCogsHistoryEntry = {
  id: string
  occurred_at: string
  source: "product_edit" | "restock_batch" | "catalog_snapshot"
  title: string
  summary: string
  previous_cost: number | null
  next_cost: number | null
  unit_cost: number | null
  quantity: number | null
  total_cost: number | null
  shipping_mode: ShippingMode | null
  vendor: string | null
  order_date: string | null
  arrival_date: string | null
  notes: string | null
}

type BuildProductCogsHistoryInput = {
  product: Pick<Product, "sku" | "cost_per_unit" | "created_at">
  productCostChanges: ProductCostChangeEntry[]
  restockItems: ProductRestockCostRow[]
}

function parseNumericValue(value: string | null | undefined): number | null {
  if (!value) {
    return null
  }

  const cleaned = value.replace(/,/g, "").trim()
  if (!cleaned) {
    return null
  }

  const numeric = Number(cleaned)
  return Number.isFinite(numeric) ? numeric : null
}

function getCostChangeValues(entry: ProductCostChangeEntry) {
  const costItem = entry.changelog_items.find((item) => item.field_name === "Cost per unit")

  if (!costItem) {
    return null
  }

  return {
    previous_cost: parseNumericValue(costItem.old_value),
    next_cost: parseNumericValue(costItem.new_value),
  }
}

function toIsoDate(date: string | null | undefined): string | null {
  if (!date) {
    return null
  }

  if (date.includes("T")) {
    return date
  }

  return `${date}T00:00:00.000Z`
}

function compareHistoryEntries(a: ProductCogsHistoryEntry, b: ProductCogsHistoryEntry) {
  if (a.occurred_at !== b.occurred_at) {
    return b.occurred_at.localeCompare(a.occurred_at)
  }

  const priority: Record<ProductCogsHistoryEntry["source"], number> = {
    product_edit: 0,
    restock_batch: 1,
    catalog_snapshot: 2,
  }

  return priority[a.source] - priority[b.source]
}

export function buildProductCogsHistory(
  input: BuildProductCogsHistoryInput,
): ProductCogsHistoryEntry[] {
  const productEditEntries: ProductCogsHistoryEntry[] = input.productCostChanges.flatMap((entry) => {
      const costChange = getCostChangeValues(entry)

      if (!costChange) {
        return []
      }

      return [{
        id: entry.id,
        occurred_at: entry.logged_at,
        source: "product_edit" as const,
        title: "Product COGS edited",
        summary:
          costChange.previous_cost !== null && costChange.next_cost !== null
            ? `Cost per unit changed from ${costChange.previous_cost} to ${costChange.next_cost}.`
            : `Cost per unit set to ${costChange.next_cost ?? costChange.previous_cost ?? 0}.`,
        previous_cost: costChange.previous_cost,
        next_cost: costChange.next_cost,
        unit_cost: costChange.next_cost,
        quantity: null,
        total_cost: null,
        shipping_mode: null,
        vendor: null,
        order_date: null,
        arrival_date: null,
        notes: entry.notes,
      }]
    })

  const restockEntries: ProductCogsHistoryEntry[] = input.restockItems.map((item) => {
    const occurredAt =
      toIsoDate(item.batch.arrival_date) ||
      toIsoDate(item.batch.entry_date) ||
      toIsoDate(item.batch.order_date) ||
      input.product.created_at

    const shippingSummary = item.batch.shipping_mode ? ` via ${item.batch.shipping_mode}` : ""
    const vendorSummary = item.batch.vendor ? ` from ${item.batch.vendor}` : ""

    return {
      id: item.id,
      occurred_at: occurredAt,
      source: "restock_batch" as const,
      title: "Restock batch recorded",
      summary: `Batch unit cost ${item.unit_cost} for ${item.quantity} unit(s)${vendorSummary}${shippingSummary}.`,
      previous_cost: null,
      next_cost: null,
      unit_cost: item.unit_cost,
      quantity: item.quantity,
      total_cost: item.total_cost,
      shipping_mode: item.batch.shipping_mode,
      vendor: item.batch.vendor,
      order_date: item.batch.order_date,
      arrival_date: item.batch.arrival_date,
      notes: item.batch.notes,
    }
  })

  const history: ProductCogsHistoryEntry[] = [...productEditEntries, ...restockEntries]

  if (productEditEntries.length === 0) {
    history.push({
      id: `${input.product.sku}-catalog-snapshot`,
      occurred_at: input.product.created_at,
      source: "catalog_snapshot",
      title: "Catalog cost snapshot",
      summary: "Current product cost captured from the catalog record.",
      previous_cost: null,
      next_cost: input.product.cost_per_unit,
      unit_cost: input.product.cost_per_unit,
      quantity: null,
      total_cost: null,
      shipping_mode: null,
      vendor: null,
      order_date: null,
      arrival_date: null,
      notes: null,
    })
  }

  return history.sort(compareHistoryEntries)
}
