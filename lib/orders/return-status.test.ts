import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateOrderStatus } from "@/lib/actions/orders"

const mocks = vi.hoisted(() => ({
  client: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  changelog: vi.fn()
}))
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.client }))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }))
vi.mock("@/lib/notifications/trigger-sender", () => ({ triggerNotificationSender: vi.fn().mockResolvedValue({ success: true }) }))
vi.mock("@/lib/actions/changelog", () => ({
  safeRecordAutomaticChangelogEntry: mocks.changelog
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.client.mockResolvedValue({ rpc: mocks.rpc })
  mocks.rpc.mockResolvedValue({
    data: {
      changed: true,
      status: "returned",
      previous_status: "paid",
      return_disposition: "dead_stock",
      return_note: "Broken seam",
      stock_effect: "Saleable stock unchanged."
    },
    error: null
  })
})

describe("return status action", () => {
  it("requires an explicit condition before a return can mutate inventory", async () => {
    expect(await updateOrderStatus("order", "returned", "paid")).toMatchObject({
      success: false
    })
    expect(mocks.client).not.toHaveBeenCalled()
  })
  it("submits dead stock, expected state and notes in one atomic operation", async () => {
    expect(
      await updateOrderStatus("order", "returned", "paid", {
        disposition: "dead_stock",
        note: " Broken seam "
      })
    ).toEqual({
      success: true,
      data: {
        status: "returned",
        return_disposition: "dead_stock",
        return_note: "Broken seam"
      }
    })
    expect(mocks.rpc).toHaveBeenCalledExactlyOnceWith(
      "update_order_status_with_inventory",
      {
        p_order_id: "order",
        p_new_status: "returned",
        p_expected_status: "paid",
        p_return_disposition: "dead_stock",
        p_expected_disposition: null,
        p_return_note: "Broken seam"
      }
    )
    expect(mocks.revalidate).toHaveBeenCalledWith("/products")
    expect(mocks.revalidate).toHaveBeenCalledWith("/reports")
  })
  it("keeps quick-log undo compatible with normal cancellation", async () => {
    await updateOrderStatus("order", "cancelled", "paid")
    expect(mocks.rpc.mock.calls[0][1]).toMatchObject({
      p_new_status: "cancelled",
      p_return_disposition: null
    })
  })
  it("passes the saved condition to detect concurrent edits", async () => {
    await updateOrderStatus("order", "returned", "cancelled", {
      disposition: "dead_stock",
      previousDisposition: "restock"
    })
    expect(mocks.rpc.mock.calls[0][1].p_expected_disposition).toBe("restock")
  })
  it("propagates transaction failures without retrying or logging success", async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: "Refresh the order" }
    })
    expect(
      await updateOrderStatus("order", "returned", "paid", {
        disposition: "dead_stock"
      })
    ).toEqual({ success: false, error: "Refresh the order" })
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.changelog).not.toHaveBeenCalled()
    expect(mocks.revalidate).not.toHaveBeenCalled()
  })
  it("does not duplicate changelog entries on an idempotent retry", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        changed: false,
        status: "returned",
        return_disposition: "dead_stock"
      },
      error: null
    })
    expect(
      await updateOrderStatus("order", "returned", "paid", {
        disposition: "dead_stock"
      })
    ).toMatchObject({ success: true })
    expect(mocks.changelog).not.toHaveBeenCalled()
  })
  it("rejects unknown conditions and oversized notes before a database call", async () => {
    expect(
      await updateOrderStatus("order", "returned", "paid", {
        disposition: "unknown" as never
      })
    ).toMatchObject({ success: false })
    expect(
      await updateOrderStatus("order", "returned", "paid", {
        disposition: "dead_stock",
        note: "a".repeat(501)
      })
    ).toMatchObject({ success: false })
    expect(mocks.client).not.toHaveBeenCalled()
  })
})
