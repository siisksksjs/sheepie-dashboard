import { randomBytes } from "node:crypto"

import { NextResponse } from "next/server"

import { createShopeeClientFromEnv } from "@/lib/shopee/deps"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CALLBACK_URL = "https://dashboard.sheepiesleep.com/api/shopee/callback"
const STATE_COOKIE = "shopee_oauth_state"
const STATE_MAX_AGE_SECONDS = 600

/** Starts Shopee shop authorization for a signed-in dashboard user. */
export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return new Response("Unauthorized", { status: 401, headers: { "cache-control": "no-store" } })
  }

  const state = randomBytes(32).toString("hex")
  let authUrl: string
  try {
    authUrl = createShopeeClientFromEnv().buildAuthUrl(`${CALLBACK_URL}?state=${state}`)
  } catch {
    console.error("Shopee connect: SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY are not configured")
    return new Response("Shopee is not configured", { status: 500, headers: { "cache-control": "no-store" } })
  }

  const response = NextResponse.redirect(authUrl)
  response.headers.set("cache-control", "no-store")
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/shopee",
    maxAge: STATE_MAX_AGE_SECONDS,
  })
  return response
}
