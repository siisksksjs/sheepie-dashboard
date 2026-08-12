import fs from "node:fs"
import { describe, expect, it } from "vitest"

const detail = fs.readFileSync("components/orders/order-detail-client.tsx", "utf8")
const list = fs.readFileSync("components/orders/orders-list-client.tsx", "utf8")

describe("order metric UI", () => {
  it("displays the canonical order breakdown", () => {
    for (const label of ["GMV", "Channel Fees", "Revenue", "COGS", "Profit"]) {
      expect(detail).toContain(label)
    }
    expect(list).toContain("GMV")
    expect(list).toContain("Revenue")
    expect(list).toContain("Profit")
    expect(`${detail}\n${list}`).not.toContain("Net Profit")
  })
})
