import { DEFAULT_PACK_SIZE, getPackMultiplier } from "@/lib/products/pack-sizes"

type CostedProduct = {
  cost_per_unit: number
}

type CostedLineItem = {
  quantity: number
  pack_size?: "single" | "bundle_2" | "bundle_3" | "bundle_4" | null
  cost_per_unit_snapshot?: number | null
}

export function getLineItemCostPerUnit(
  lineItem: CostedLineItem,
  product?: CostedProduct | null
) {
  return lineItem.cost_per_unit_snapshot ?? product?.cost_per_unit ?? 0
}

export function getLineItemTotalCost(
  lineItem: CostedLineItem,
  product?: CostedProduct | null
) {
  const consumedUnits = lineItem.quantity * getPackMultiplier(lineItem.pack_size ?? DEFAULT_PACK_SIZE)
  return getLineItemCostPerUnit(lineItem, product) * consumedUnits
}
