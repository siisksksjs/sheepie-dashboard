import { describe, expect, it } from "vitest"
import { mapShopeeStatus, type ShopeeStatusAction } from "./status"

describe("mapShopeeStatus", () => {
  it.each<[string, ShopeeStatusAction]>([
    ["UNPAID", { kind: "not_yet" }],
    ["READY_TO_SHIP", { kind: "not_yet" }],
    ["PROCESSED", { kind: "apply", status: "paid" }],
    ["RETRY_SHIP", { kind: "apply", status: "paid" }],
    ["SHIPPED", { kind: "apply", status: "shipped" }],
    ["TO_CONFIRM_RECEIVE", { kind: "apply", status: "shipped" }],
    ["COMPLETED", { kind: "apply", status: "shipped" }],
    ["IN_CANCEL", { kind: "hold" }],
    ["CANCELLED", { kind: "apply", status: "cancelled" }],
    ["TO_RETURN", { kind: "return_review" }],
  ])("maps %s", (status, expected) => {
    expect(mapShopeeStatus(status)).toEqual(expected)
  })

  it("holds on a status it has never seen", () => {
    expect(mapShopeeStatus("SOMETHING_NEW")).toEqual({ kind: "hold" })
  })
})
