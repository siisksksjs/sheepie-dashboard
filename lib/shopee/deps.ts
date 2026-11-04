import "server-only"

import { createServiceClient } from "@/lib/supabase/service"
import { createShopeeClient } from "./client"
import { createShopeeStore } from "./store"
import type { SyncDeps } from "./sync"

/** Shopee API client from SHOPEE_PARTNER_ID / SHOPEE_PARTNER_KEY. Throws if either is missing. */
export function createShopeeClientFromEnv(): ReturnType<typeof createShopeeClient> {
  const rawPartnerId = process.env.SHOPEE_PARTNER_ID ?? ""
  const partnerKey = process.env.SHOPEE_PARTNER_KEY ?? ""
  const partnerId = /^\d+$/.test(rawPartnerId) ? Number(rawPartnerId) : NaN

  if (!Number.isSafeInteger(partnerId) || partnerId <= 0) {
    throw new Error("SHOPEE_PARTNER_ID must be set to the numeric Shopee partner id")
  }
  if (!partnerKey) {
    throw new Error("SHOPEE_PARTNER_KEY must be set")
  }

  return createShopeeClient({ partnerId, partnerKey })
}

/** Production wiring for the Shopee routes: env client, service-role store, wall clock. */
export function createSyncDeps(): SyncDeps {
  return {
    shopee: createShopeeClientFromEnv(),
    store: createShopeeStore(createServiceClient()),
    now: () => new Date(),
  }
}
