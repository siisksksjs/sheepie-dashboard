import { NextResponse, type NextRequest } from "next/server"

import { createSyncDeps } from "@/lib/shopee/deps"
import { emailFailedOrdersLater } from "@/lib/shopee/failure-emails"
import { handleShopeePush } from "@/lib/shopee/push"
import type { SyncDeps } from "@/lib/shopee/sync"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// The URL Shopee signs. Fixed rather than read from request.url, which a proxy can rewrite.
const DEFAULT_CALLBACK_URL = "https://dashboard.sheepiesleep.com/api/shopee/push"

export async function POST(request: NextRequest) {
  const pushKey = process.env.SHOPEE_PUSH_PARTNER_KEY
  if (!pushKey) {
    console.error("Shopee push: SHOPEE_PUSH_PARTNER_KEY is not set")
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  let deps: SyncDeps
  try {
    deps = createSyncDeps()
  } catch {
    console.error("Shopee push: Shopee or Supabase env is not configured")
    return NextResponse.json({ ok: false }, { status: 500 })
  }

  const result = await handleShopeePush(
    { rawBody: await request.text(), authorization: request.headers.get("authorization") },
    {
      ...deps,
      pushKey,
      callbackUrl: process.env.SHOPEE_PUSH_CALLBACK_URL || DEFAULT_CALLBACK_URL,
      onFailedOrders: emailFailedOrdersLater,
    }
  )
  return NextResponse.json(result.body, { status: result.status })
}
