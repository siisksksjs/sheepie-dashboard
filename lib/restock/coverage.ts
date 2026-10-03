import type { RestockStatus } from "@/lib/types/database.types"

export type IncomingBatch = {
  restock_status: RestockStatus
  items: Array<{ sku: string; quantity: number }>
}

/** Incoming purchases stay separate from stock that can be sold today. */
export function buildIncomingStockBySku(batches: IncomingBatch[]) {
  const incoming = new Map<string, number>()
  for (const batch of batches) {
    if (batch.restock_status !== "in_transit") continue
    for (const item of batch.items) {
      if (!Number.isFinite(item.quantity) || item.quantity <= 0) continue
      incoming.set(item.sku, (incoming.get(item.sku) ?? 0) + item.quantity)
    }
  }
  return incoming
}

export function getRestockCoverage({
  stock,
  incoming,
  reorderAt,
}: {
  stock: number
  /** null means the in-transit source could not be loaded. */
  incoming: number | null
  reorderAt: number | null
}) {
  const belowReorderPoint = reorderAt !== null && stock <= reorderAt
  const inventoryPosition = incoming === null ? null : stock + incoming
  const additionalUnits = inventoryPosition === null || reorderAt === null
    ? null
    : Math.max(0, Math.ceil(reorderAt - inventoryPosition))
  return {
    incoming,
    inventoryPosition,
    additionalUnits,
    needsReorder: belowReorderPoint && (additionalUnits === null || additionalUnits > 0),
    coveredByIncoming: belowReorderPoint && incoming !== null && incoming > 0 && additionalUnits === 0,
  }
}
