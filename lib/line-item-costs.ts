type CostedProduct = {
  cost_per_unit: number
}

type CostedLineItem = {
  quantity: number
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
  return getLineItemCostPerUnit(lineItem, product) * lineItem.quantity
}
