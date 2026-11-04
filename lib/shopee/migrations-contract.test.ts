import { readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

describe("shopee sync schedule migration", () => {
  const path = "supabase/migrations/20261105000200_schedule_shopee_sync.sql"

  it("schedules the shopee-order-sync cron job every 15 minutes", async () => {
    const source = await readFile(path, "utf8")

    expect(source).toContain("'shopee-order-sync'")
    expect(source).toContain("'*/15 * * * *'")
    expect(source).toMatch(/cron\.schedule\(/)
    expect(source).toMatch(/cron\.unschedule\('shopee-order-sync'\)/)
    expect(source).toMatch(/FROM cron\.job WHERE jobname = 'shopee-order-sync'/)
  })

  it("POSTs to the sync route with the secret header", async () => {
    const source = await readFile(path, "utf8")

    expect(source).toMatch(/net\.http_post\(/)
    expect(source).toContain("https://dashboard.sheepiesleep.com/api/shopee/sync")
    expect(source).toContain("'x-shopee-sync-secret'")
    expect(source).toMatch(/jsonb_build_object\('source', 'cron'\)/)
  })

  it("reads the secret from Vault instead of hard-coding it", async () => {
    const source = await readFile(path, "utf8")

    expect(source).toMatch(/vault\.decrypted_secrets WHERE name = 'shopee_sync_secret'/)
    expect(source).toMatch(/'x-shopee-sync-secret',\s*\(SELECT decrypted_secret FROM vault\.decrypted_secrets/)
  })
})

describe("orders realtime migration", () => {
  it("adds public.orders to the supabase_realtime publication idempotently", async () => {
    const source = await readFile("supabase/migrations/20261105000300_enable_orders_realtime.sql", "utf8")

    expect(source).toMatch(/ALTER PUBLICATION supabase_realtime ADD TABLE public\.orders/)
    expect(source).toMatch(/pg_publication_tables/)
    expect(source).toMatch(/pubname = 'supabase_realtime'/)
    expect(source).toMatch(/tablename = 'orders'/)
    expect(source).toMatch(/NOT EXISTS/)
  })
})
