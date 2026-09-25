// Shared by the dashboard and the daily KPI email so both count the same SKUs.
export const KPI_BASE_SKUS = ["Cervi-001", "Lumi-001", "Calmi-001"] as const

export type KpiBaseSku = (typeof KPI_BASE_SKUS)[number]

// Colour variants roll up into their product's KPI target. Cervi-002 (the
// pillow case) is an accessory, not a Cervi variant, so it stays excluded.
export const KPI_VARIANT_SKUS: Record<string, KpiBaseSku> = {
  "Lumi-002": "Lumi-001", // LumiCloud Apricot
}

const KPI_BASE_SKU_SET = new Set<string>(KPI_BASE_SKUS)

/** The KPI row a SKU counts toward, or null when it is not a tracked product. */
export function resolveKpiSku(sku: string): KpiBaseSku | null {
  if (KPI_BASE_SKU_SET.has(sku)) return sku as KpiBaseSku
  return KPI_VARIANT_SKUS[sku] ?? null
}
