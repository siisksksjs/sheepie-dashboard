import fs from "node:fs"
import { describe, expect, it } from "vitest"

describe("orders smart search UI", () => {
  const source = fs.readFileSync("components/orders/orders-list-client.tsx", "utf8")

  it("offers one smart search and filters both order layouts", () => {
    expect(source).toContain("Search by product name, GMV, revenue, or profit")
    expect(source).toContain("filterOrdersForSearch")
    expect(source).toContain("filteredOrders")
    expect(source.match(/filteredOrders\.map/g)).toHaveLength(2)
    expect(source).toContain('type="search"')
    expect(source).toContain('autoComplete="off"')
    expect(source).not.toContain("<Search")
  })

  it("shows result feedback and a recoverable empty state", () => {
    expect(source).toContain("matching order")
    expect(source).toContain("No orders match your search")
    expect(source).toContain("Clear Search")
  })
})
