export type DraftRestockItem = {
  sku: string
  quantity: number
  unit_cost: number | null
}

export type ResolvedRestockItem = {
  sku: string
  quantity: number
  unit_cost: number
  total_cost: number
}

export function resolveRestockItemCosts(input: {
  items: DraftRestockItem[]
  productCosts: Map<string, number>
}) {
  const missingCostSkus = new Set<string>()

  const items = input.items
    .filter((item) => item.sku && item.quantity > 0 && (item.unit_cost === null || item.unit_cost >= 0))
    .map((item) => {
      const normalizedUnitCost = item.unit_cost === null || item.unit_cost === 0
        ? null
        : item.unit_cost
      const unitCost = normalizedUnitCost ?? input.productCosts.get(item.sku) ?? null

      if (unitCost === null) {
        missingCostSkus.add(item.sku)
        return null
      }

      return {
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: unitCost,
        total_cost: item.quantity * unitCost,
      } satisfies ResolvedRestockItem
    })
    .filter((item): item is ResolvedRestockItem => item !== null)

  return {
    items,
    missingCostSkus: Array.from(missingCostSkus).sort(),
    totalAmount: items.reduce((sum, item) => sum + item.total_cost, 0),
  }
}
