import {
  DEFAULT_PACK_SIZE,
  getPackMultiplier,
  type PackSize,
} from "@/lib/products/pack-sizes"

type DailySalesLineItem = {
  sku: string
  quantity: number
  pack_size?: PackSize | null
  selling_price: number
}

type DailySalesOrder = {
  channel_fees: number | null
  order_line_items: DailySalesLineItem[] | null
}

type DailySalesProduct = {
  sku: string
  name: string
  variant: string | null
}

type DailySalesBundleComposition = {
  bundle_sku: string
  component_sku: string
  quantity: number
}

export type DailyProductSalesItem = {
  sku: string
  productName: string
  quantity: number
}

type BuildDailySalesSummaryInput = {
  date: string
  orders: DailySalesOrder[]
  products: DailySalesProduct[]
  bundleCompositions: DailySalesBundleComposition[]
}

export function buildDailySalesSummary(input: BuildDailySalesSummaryInput) {
  const productNames = new Map(
    input.products.map((product) => [
      product.sku,
      product.variant ? `${product.name} - ${product.variant}` : product.name,
    ]),
  )
  const compositionsByBundle = new Map<string, DailySalesBundleComposition[]>()

  for (const composition of input.bundleCompositions) {
    const existing = compositionsByBundle.get(composition.bundle_sku) || []
    existing.push(composition)
    compositionsByBundle.set(composition.bundle_sku, existing)
  }

  const quantitiesBySku = new Map<string, number>()
  let totalRevenue = 0

  const addQuantity = (sku: string, quantity: number) => {
    quantitiesBySku.set(sku, (quantitiesBySku.get(sku) || 0) + quantity)
  }

  for (const order of input.orders) {
    const lineItems = order.order_line_items || []
    const orderGross = lineItems.reduce(
      (sum, item) => sum + (Number(item.selling_price || 0) * Number(item.quantity || 0)),
      0,
    )

    if (orderGross > 0) {
      totalRevenue += orderGross - Number(order.channel_fees || 0)
    }

    for (const item of lineItems) {
      const lineUnits = Number(item.quantity || 0)
        * getPackMultiplier(item.pack_size ?? DEFAULT_PACK_SIZE)
      const compositions = compositionsByBundle.get(item.sku)

      if (!compositions || compositions.length === 0) {
        addQuantity(item.sku, lineUnits)
        continue
      }

      for (const composition of compositions) {
        addQuantity(composition.component_sku, lineUnits * composition.quantity)
      }
    }
  }

  const items: DailyProductSalesItem[] = Array.from(quantitiesBySku, ([sku, quantity]) => ({
    sku,
    productName: productNames.get(sku) || sku,
    quantity,
  })).sort((left, right) => (
    right.quantity - left.quantity
    || left.productName.localeCompare(right.productName)
  ))

  return {
    date: input.date,
    totalOrders: input.orders.length,
    totalUnits: items.reduce((sum, item) => sum + item.quantity, 0),
    totalRevenue,
    items,
  }
}
