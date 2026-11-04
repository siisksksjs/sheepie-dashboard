/**
 * Shopee endpoints that Shopee (push) and pg_cron / local scripts (sync, token)
 * call without a dashboard session. Each route checks its own signature or
 * secret header. Kept dependency-free so middleware can import it.
 */
const PUBLIC_SHOPEE_API_PATHS = new Set(["/api/shopee/push", "/api/shopee/sync", "/api/shopee/token"])

export function isPublicShopeeApiPath(pathname: string): boolean {
  return PUBLIC_SHOPEE_API_PATHS.has(pathname)
}
