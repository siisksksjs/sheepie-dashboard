import { createHmac, timingSafeEqual } from "node:crypto"

function hmacHex(key: string, message: string): string {
  return createHmac("sha256", key).update(message).digest("hex")
}

/**
 * Shopee Open Platform v2 request signature.
 * Auth level: partner_id + path + timestamp.
 * Shop level: partner_id + path + timestamp + access_token + shop_id.
 */
export function signApiRequest(input: {
  partnerId: number
  partnerKey: string
  path: string
  timestamp: number
  accessToken?: string
  shopId?: number
}): string {
  const base = `${input.partnerId}${input.path}${input.timestamp}${input.accessToken ?? ""}${input.shopId ?? ""}`
  return hmacHex(input.partnerKey, base)
}

/**
 * Verifies the `Authorization` header of a Shopee push: hex HMAC-SHA256 of
 * `callbackUrl|rawBody` keyed with the push partner key.
 */
export function verifyPushSignature(input: {
  callbackUrl: string
  rawBody: string
  authorization: string | null
  pushKey: string
}): boolean {
  if (!input.authorization) return false
  const expected = Buffer.from(hmacHex(input.pushKey, `${input.callbackUrl}|${input.rawBody}`))
  const received = Buffer.from(input.authorization.trim())
  if (expected.length !== received.length) return false
  return timingSafeEqual(expected, received)
}
