import { NextResponse, type NextRequest } from "next/server"

import { secretsMatch } from "@/lib/shopee/secret-compare"
import { createShopeeStore } from "@/lib/shopee/store"
import { createServiceClient } from "@/lib/supabase/service"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const NO_STORE = { "cache-control": "no-store" }

/** Current access token for the local scripts. Read-only: never refreshes. */
export async function GET(request: NextRequest) {
  const secret = process.env.SHOPEE_SYNC_SECRET
  if (!secret) {
    console.error("Shopee token: SHOPEE_SYNC_SECRET is not set")
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500, headers: NO_STORE })
  }
  if (!secretsMatch(request.headers.get("x-shopee-sync-secret"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401, headers: NO_STORE })
  }

  let conn
  try {
    conn = await createShopeeStore(createServiceClient()).getConnection()
  } catch {
    console.error("Shopee token: could not read the Shopee connection")
    return NextResponse.json({ error: "unavailable" }, { status: 500, headers: NO_STORE })
  }

  if (!conn?.shopId || !conn.accessToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 404, headers: NO_STORE })
  }

  return NextResponse.json(
    {
      shop_id: conn.shopId,
      access_token: conn.accessToken,
      expires_at: conn.accessExpiresAt?.toISOString() ?? null,
    },
    { headers: NO_STORE }
  )
}
