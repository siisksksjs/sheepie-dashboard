import { calculateSalesOrder } from "@/supabase/functions/_shared/sales-metrics"
import { resolveKpiSku } from "@/supabase/functions/_shared/kpi-skus"
import type { PackSize } from "@/lib/products/pack-sizes"

export { KPI_BASE_SKUS } from "@/supabase/functions/_shared/kpi-skus"

export type KpiActual = { actual_units: number; actual_gmv: number; actual_revenue: number }
export type KpiActualOrder = {
  channel_fees: number | null
  order_line_items?: Array<{ sku: string; quantity: number; pack_size: PackSize | null; selling_price: number }>
}
export type KpiCatalogProduct = { sku: string; is_bundle: boolean }
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
    items.forEach((item, index) => {
      const line = metrics.lines[index]
      const kpiSku = resolveKpiSku(item.sku)
      if (kpiSku) {
        addSku(kpiSku, line.units, line.gmv, line.revenue)
        return
      }

      const product = productsBySku.get(item.sku)
      const components = product?.is_bundle
        ? (compositionsByBundle.get(item.sku) || []).filter((row) => resolveKpiSku(row.component_sku))
        : []
      const componentUnits = components.reduce((sum, row) => sum + row.quantity * line.units, 0)

      if (componentUnits <= 0) {
        add(other, line.units, line.gmv, line.revenue)
        return
      }

      for (const component of components) {
        const units = component.quantity * line.units
        const weight = units / componentUnits
        addSku(resolveKpiSku(component.component_sku)!, units, line.gmv * weight, line.revenue * weight)
      }
    })
  }

  const totals = Array.from(bySku.values()).reduce((sum, actual) => {
    add(sum, actual.actual_units, actual.actual_gmv, actual.actual_revenue)
    return sum
  }, EMPTY_ACTUAL())

  return { bySku, other, totals }
}
