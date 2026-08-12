export type SearchableOrder = {
  gmv: number
  revenue: number
  profit: number
  order_line_items: Array<{ product_name: string }>
}

function parseExactRupiahQuery(query: string) {
  const normalized = query.trim()

  if (!/^(?:rp\s*)?-?[\d.,]+$/i.test(normalized)) {
    return null
  }

  const isNegative = normalized.replace(/^rp\s*/i, "").startsWith("-")
  const digits = normalized.replace(/\D/g, "")

  if (!digits) return null

  const amount = Number(digits)
  return isNegative ? -amount : amount
}

export function filterOrdersForSearch<Order extends SearchableOrder>(orders: Order[], query: string) {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) return orders

  const exactAmount = parseExactRupiahQuery(normalizedQuery)
  if (exactAmount !== null) {
    return orders.filter((order) => [order.gmv, order.revenue, order.profit]
      .some((value) => Math.round(Number(value || 0)) === exactAmount))
  }

  const productQuery = normalizedQuery.toLocaleLowerCase("id-ID")
  return orders.filter((order) => order.order_line_items.some((item) =>
    item.product_name.toLocaleLowerCase("id-ID").includes(productQuery),
  ))
}
