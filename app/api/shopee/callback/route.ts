import { NextResponse, type NextRequest } from "next/server"

import { createSyncDeps } from "@/lib/shopee/deps"
import { secretsMatch } from "@/lib/shopee/secret-compare"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const STATE_COOKIE = "shopee_oauth_state"
const NO_STORE = { "cache-control": "no-store" }

function withStateCleared<T extends NextResponse>(response: T): T {
  response.cookies.set(STATE_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/api/shopee", maxAge: 0 })
  response.headers.set("cache-control", "no-store")
  return response
}

function badRequest(message: string) {
  return withStateCleared(NextResponse.json({ error: message }, { status: 400, headers: NO_STORE }))
}

/** Shopee redirects here with `code` and `shop_id` after the seller authorizes. */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: NO_STORE })
  }

  const params = request.nextUrl.searchParams
  const expectedState = request.cookies.get(STATE_COOKIE)?.value ?? ""
  if (!secretsMatch(params.get("state"), expectedState)) {
    return badRequest("invalid_state")
  }

  const code = params.get("code") ?? ""
  const rawShopId = params.get("shop_id") ?? ""
  const shopId = /^\d+$/.test(rawShopId) ? Number(rawShopId) : NaN
  if (!code || !Number.isSafeInteger(shopId) || shopId <= 0) {
    return badRequest("invalid_params")
  }

  try {
    const { shopee, store } = createSyncDeps()
    const tokens = await shopee.getTokens(code, shopId)
    await store.saveTokens(shopId, tokens)
  } catch (error) {
    // Client and store errors never carry keys or tokens.
    console.error(`Shopee callback failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    return withStateCleared(NextResponse.redirect(new URL("/more/shopee?error=connect_failed", request.url)))
  }

  return withStateCleared(NextResponse.redirect(new URL("/more/shopee?connected=1", request.url)))
}
