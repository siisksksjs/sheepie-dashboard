import { calculateSalesOrder } from "@/supabase/functions/_shared/sales-metrics"
import type { PackSize } from "@/lib/products/pack-sizes"

export const KPI_BASE_SKUS = ["Cervi-001", "Lumi-001", "Calmi-001"] as const
const KPI_BASE_SKU_SET = new Set<string>(KPI_BASE_SKUS)

export type KpiActual = { actual_units: number; actual_gmv: number; actual_revenue: number }
export type KpiActualOrder = {
  channel_fees: number | null
  order_line_items?: Array<{ sku: string; quantity: number; pack_size: PackSize | null; selling_price: number }>
}
export type KpiCatalogProduct = { sku: string; name: string; variant: string | null; is_bundle: boolean }
export type KpiBundleComposition = { bundle_sku: string; component_sku: string; quantity: number }

const EMPTY_ACTUAL = (): KpiActual => ({ actual_units: 0, actual_gmv: 0, actual_revenue: 0 })

export function buildKpiActuals(input: {
  orders: KpiActualOrder[]
  products: KpiCatalogProduct[]
  bundleCompositions: KpiBundleComposition[]
}) {
  const bySku = new Map<string, KpiActual>()
  const productsBySku = new Map(input.products.map((product) => [product.sku, product]))
  const compositionsByBundle = new Map<string, KpiBundleComposition[]>()
  const other = EMPTY_ACTUAL()
  const totals = EMPTY_ACTUAL()

  for (const composition of input.bundleCompositions) {
    const rows = compositionsByBundle.get(composition.bundle_sku) || []
    rows.push(composition)
    compositionsByBundle.set(composition.bundle_sku, rows)
  }

  const add = (target: KpiActual, units: number, gmv: number, revenue: number) => {
    target.actual_units += units
    target.actual_gmv += gmv
    target.actual_revenue += revenue
  }
  const addSku = (sku: string, units: number, gmv: number, revenue: number) => {
    const actual = bySku.get(sku) || EMPTY_ACTUAL()
    add(actual, units, gmv, revenue)
    bySku.set(sku, actual)
  }

  for (const order of input.orders) {
    const items = order.order_line_items || []
    const metrics = calculateSalesOrder({
      channelFees: order.channel_fees,
      lines: items.map((item, index) => ({
        key: String(index), sellingPrice: item.selling_price, quantity: item.quantity,
        packSize: item.pack_size, unitCost: null,
      })),
    })
    add(totals, metrics.lines.reduce((sum, line) => sum + line.units, 0), metrics.totals.gmv, metrics.totals.revenue)

    items.forEach((item, index) => {
      const line = metrics.lines[index]
      if (KPI_BASE_SKU_SET.has(item.sku)) {
        addSku(item.sku, line.units, line.gmv, line.revenue)
        return
      }
      const product = productsBySku.get(item.sku)
      const components = product?.is_bundle
        ? (compositionsByBundle.get(item.sku) || []).filter((row) => KPI_BASE_SKU_SET.has(row.component_sku))
        : []
      const componentUnits = components.reduce((sum, row) => sum + row.quantity * line.units, 0)
      if (componentUnits <= 0) {
        add(other, line.units, line.gmv, line.revenue)
        return
      }
      for (const component of components) {
        const units = component.quantity * line.units
        const weight = units / componentUnits
        addSku(component.component_sku, units, line.gmv * weight, line.revenue * weight)
      }
    })
  }

  return { bySku, other, totals }
}
