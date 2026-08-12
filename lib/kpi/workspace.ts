import { calculateSalesOrder } from "@/supabase/functions/_shared/sales-metrics"
import type { PackSize } from "@/lib/products/pack-sizes"

export const KPI_BASE_SKUS = ["Cervi-001", "Lumi-001", "Calmi-001"] as const
const KPI_BASE_SKU_SET = new Set<string>(KPI_BASE_SKUS)

export type KpiActual = { actual_units: number; actual_gmv: number; actual_revenue: number }
export type KpiActualOrder = {
  channel_fees: number | null
  order_line_items?: Array<{ sku: string; quantity: number; pack_size: PackSize | null; selling_price: number }>
}

const EMPTY_ACTUAL = (): KpiActual => ({ actual_units: 0, actual_gmv: 0, actual_revenue: 0 })

export function buildKpiActuals(input: {
  orders: KpiActualOrder[]
}) {
  const bySku = new Map<string, KpiActual>()
  const other = EMPTY_ACTUAL()

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
      if (KPI_BASE_SKU_SET.has(item.sku)) {
        addSku(item.sku, line.units, line.gmv, line.revenue)
        return
      }

      add(other, line.units, line.gmv, line.revenue)
    })
  }

  const totals = Array.from(bySku.values()).reduce((sum, actual) => {
    add(sum, actual.actual_units, actual.actual_gmv, actual.actual_revenue)
    return sum
  }, EMPTY_ACTUAL())

  return { bySku, other, totals }
}
