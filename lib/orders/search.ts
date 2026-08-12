export type SearchableOrder = {
  gmv: number
  revenue: number
  profit: number
  order_line_items: Array<{ product_name: string }>
}

function parseRupiahQuery(query: string) {
  const normalized = query.trim()

  if (!/^(?:rp\s*)?[\d.,]+$/i.test(normalized)) {
    return null
  }

  const digits = normalized.replace(/\D/g, "")

  return digits || null
}

export function filterOrdersForSearch<Order extends SearchableOrder>(orders: Order[], query: string) {
  const normalizedQuery = query.trim()

  if (!normalizedQuery) return orders

  const amountQuery = parseRupiahQuery(normalizedQuery)
  if (amountQuery !== null) {
    return orders.filter((order) => [order.gmv, order.revenue, order.profit]
      .some((value) => String(Math.round(Number(value || 0))).includes(amountQuery)))
  }

  const productQuery = normalizedQuery.toLocaleLowerCase("id-ID")
  return orders.filter((order) => order.order_line_items.some((item) =>
    item.product_name.toLocaleLowerCase("id-ID").includes(productQuery),
  ))
}
