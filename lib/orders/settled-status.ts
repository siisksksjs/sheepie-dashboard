import type { OrderStatus } from "@/lib/types/database.types"
import { isQualifyingSalesStatus } from "@/supabase/functions/_shared/sales-metrics"

const SETTLED_ORDER_STATUSES: OrderStatus[] = ["paid", "shipped"]

/** Paid or shipped orders have taken stock out of the warehouse. */
export function isSettledOrderStatus(status: OrderStatus) {
  return SETTLED_ORDER_STATUSES.includes(status) && isQualifyingSalesStatus(status)
}
