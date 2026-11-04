import { NextResponse, type NextRequest } from "next/server"

import { createSyncDeps } from "@/lib/shopee/deps"
import { secretsMatch } from "@/lib/shopee/secret-compare"
import { pollShopeeOrders } from "@/lib/shopee/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

/** The 15-minute pg_cron catch-up. The only caller allowed to refresh tokens. */
export async function POST(request: NextRequest) {
  const secret = process.env.SHOPEE_SYNC_SECRET
  if (!secret) {
    console.error("Shopee sync: SHOPEE_SYNC_SECRET is not set")
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500, headers: NO_STORE })
  }
  if (!secretsMatch(request.headers.get("x-shopee-sync-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE })
  }

  try {
    const result = await pollShopeeOrders(createSyncDeps(), { allowRefresh: true })
    return NextResponse.json(result, { headers: NO_STORE })
  } catch (error) {
    // Config or store failures outside the poll's own error handling. Messages never carry keys or tokens.
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error(`Shopee sync failed: ${message}`)
    return NextResponse.json({ status: "failed", error: message }, { status: 500, headers: NO_STORE })
  }
}
