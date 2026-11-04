import fs from "node:fs"
import { describe, expect, it } from "vitest"

const read = (path: string) => fs.readFileSync(path, "utf8")

describe("Shopee order sync UI", () => {
  it("tags synced orders with API in both order layouts", () => {
    const source = read("components/orders/orders-list-client.tsx")
    expect(source).toContain('order.source === "shopee_api"')
    expect(source).toContain("API")
    expect(source.match(/order\.source === "shopee_api"/g)).toHaveLength(2)
  })

  it("shows the sync line and pending banner on the orders page only when connected", () => {
    const source = read("app/(dashboard)/orders/page.tsx")
    expect(source).toContain("getShopeeSyncSummary")
    expect(source).toContain("formatSyncAge")
    expect(source).toContain("Shopee last synced: ")
    expect(source).toContain("need attention")
    expect(source).toContain("needs attention")
    expect(source).toContain('href="/more/shopee"')
    expect(source).toContain("summary?.connected")
  })

  it("shows a return to review without a dashboard order by its order number, with no order link", () => {
    const source = read("components/shopee/sync-queue-list.tsx")
    expect(source).toContain("#{item.order_sn}")
    expect(source).toContain("isReturn && item.order_id")
    expect(source).toContain("Check it in Shopee Seller Centre")
  })

  it("reads the lean sync summary through the signed-in client", () => {
    const source = read("lib/actions/shopee.ts")
    expect(source).toContain("export async function getShopeeSyncSummary")
    expect(source).toContain('rpc("get_shopee_connection_status")')
    expect(source).toContain('count: "exact", head: true')
  })

  it("mounts a live refresh listener in the dashboard layout", () => {
    expect(read("app/(dashboard)/layout.tsx")).toContain("<ShopeeLiveRefresh />")

    const source = read("components/shell/shopee-live-refresh.tsx")
    expect(source).toContain("postgres_changes")
    expect(source).toContain("source=eq.shopee_api")
    expect(source).toContain('event: "INSERT"')
    expect(source).toContain('event: "UPDATE"')
    expect(source).toContain("router.refresh()")
    expect(source).toContain("New Shopee order #")
    expect(source).toContain("removeChannel")
    expect(source).toContain("clearTimeout")
  })

  it("confirms before logging a Shopee order by hand once auto-sync is live", () => {
    const form = read("components/orders/new-order-form.tsx")
    expect(form).toContain("shopeeSyncLive")
    expect(form).toContain("Shopee orders now sync automatically. Log this one manually anyway?")
    expect(form).toContain('channel === "shopee"')

    const page = read("app/(dashboard)/orders/new/page.tsx")
    expect(page).toContain("shopeeSyncLive")
    expect(page).toContain("syncStartAt")
  })
})
