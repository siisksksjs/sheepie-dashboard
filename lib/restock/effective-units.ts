import type { OrderLineItem } from "@/lib/types/database.types"
import { DEFAULT_PACK_SIZE, getPackMultiplier } from "@/lib/products/pack-sizes"

type SalesLineItem = {
  sku: string
  quantity: number
  pack_size?: OrderLineItem["pack_size"] | null
  selling_price?: number | null
}

type BundleCompositionInput = {
  bundle_sku: string
  component_sku: string
  quantity: number
}

type LegacyBundleMapping = {
  bundleSku: string
  componentSkus: string[]
}

type BuildEffectiveUnitsInput = {
  guidanceSkus: string[]
  lineItems: SalesLineItem[]
  bundleCompositions: BundleCompositionInput[]
  legacyBundleMappings?: LegacyBundleMapping[]
}

function getLineItemUnits(item: SalesLineItem) {
  return item.quantity * getPackMultiplier(item.pack_size ?? DEFAULT_PACK_SIZE)
}

export function buildEffectiveUnitsBySku(input: BuildEffectiveUnitsInput) {
  const guidanceSkuSet = new Set(input.guidanceSkus)
  const effectiveUnits = new Map(input.guidanceSkus.map((sku) => [sku, 0]))
  const compositionsByBundle = new Map<string, BundleCompositionInput[]>()
  const legacyMappingsByBundle = new Map(
    (input.legacyBundleMappings || []).map((mapping) => [mapping.bundleSku, mapping.componentSkus]),
  )

  for (const composition of input.bundleCompositions) {
    const existing = compositionsByBundle.get(composition.bundle_sku) || []
    existing.push(composition)
    compositionsByBundle.set(composition.bundle_sku, existing)
  }

  for (const item of input.lineItems) {
    if ((item.selling_price || 0) <= 0) continue

    const itemUnits = getLineItemUnits(item)

    if (guidanceSkuSet.has(item.sku)) {
      effectiveUnits.set(item.sku, (effectiveUnits.get(item.sku) || 0) + itemUnits)
      continue
    }

    const compositions = compositionsByBundle.get(item.sku)

    if (compositions && compositions.length > 0) {
      for (const composition of compositions) {
        if (!guidanceSkuSet.has(composition.component_sku)) continue
        effectiveUnits.set(
          composition.component_sku,
          (effectiveUnits.get(composition.component_sku) || 0) + composition.quantity * itemUnits,
        )
      }
      continue
    }

    for (const componentSku of legacyMappingsByBundle.get(item.sku) || []) {
      if (!guidanceSkuSet.has(componentSku)) continue
      effectiveUnits.set(componentSku, (effectiveUnits.get(componentSku) || 0) + itemUnits)
    }
  }

  return effectiveUnits
}
