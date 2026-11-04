export type ShopeeStatusAction =
  | { kind: "apply"; status: "paid" | "shipped" | "cancelled" }
  | { kind: "not_yet" }
  | { kind: "hold" }
  | { kind: "return_review" }

/**
 * The single place that decides what a Shopee order status means for the
 * dashboard. See the "状态对应" table in the shopee-order-sync design spec.
 *
 * - not_yet: do not create the order (unpaid / not yet arranged for pickup)
 * - apply: create or move the order to this dashboard status
 * - hold: leave the order as it is and wait for the final result
 * - return_review: leave the status alone, queue it for a person to decide
 */
export function mapShopeeStatus(status: string): ShopeeStatusAction {
  switch (status) {
    case "UNPAID":
    case "READY_TO_SHIP":
      return { kind: "not_yet" }
    case "PROCESSED":
    case "RETRY_SHIP":
      return { kind: "apply", status: "paid" }
    case "SHIPPED":
    case "TO_CONFIRM_RECEIVE":
    case "COMPLETED":
      return { kind: "apply", status: "shipped" }
    case "CANCELLED":
      return { kind: "apply", status: "cancelled" }
    case "TO_RETURN":
      return { kind: "return_review" }
    case "IN_CANCEL":
    default:
      // Unknown statuses are held rather than guessed at.
      return { kind: "hold" }
  }
}
