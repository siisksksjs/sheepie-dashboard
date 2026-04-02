# Duplicate Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click duplicate-order feature that instantly creates a new paid order using today’s date and a fresh order ID while keeping the operator on the same page with a success message showing the new order ID.

**Architecture:** Reuse the existing order creation rules instead of building a parallel duplication flow. Extract the shared create-order body into one internal function in `lib/actions/orders.ts`, then route both manual create and duplicate through it so ledger, settlement, and changelog side effects stay identical.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase server actions, Vitest

---

## File Map

### Create

- `docs/superpowers/plans/2026-04-01-duplicate-order-implementation.md`
- `lib/orders/duplicate-order.test.ts`

### Modify

- `lib/actions/orders.ts`
- `app/(dashboard)/orders/page.tsx`
- `components/orders/order-detail-client.tsx`

### Responsibilities

- `lib/orders/duplicate-order.test.ts`
  Add TDD coverage for duplicate-order payload rules and source-contract checks for the new server action wiring.
- `lib/actions/orders.ts`
  Extract shared create-order logic and add `duplicateOrder(orderId: string)` that generates a fresh ID for today, forces `paid`, and returns the new order ID.
- `app/(dashboard)/orders/page.tsx`
  Add `Duplicate` actions to orders list rows/cards and show a local success/error message while staying on the page.
- `components/orders/order-detail-client.tsx`
  Add `Duplicate Order` action on the detail page and show a local success/error message while staying on the page.

## Task 1: Add TDD Coverage For Duplicate Rules

**Files:**
- Create: `lib/orders/duplicate-order.test.ts`

- [ ] **Step 1: Write the failing unit test for duplicate payload rules**

```ts
import { describe, expect, it } from "vitest"
import { buildDuplicateOrderInput } from "@/lib/actions/orders"

describe("buildDuplicateOrderInput", () => {
  it("forces today's date and paid status while copying sales fields", () => {
    const result = buildDuplicateOrderInput({
      sourceOrder: {
        id: "ord_1",
        order_id: "SHOPE-20260401-001",
        channel: "shopee",
        order_date: "2026-03-30",
        status: "returned",
        channel_fees: 12000,
        notes: "repeat buyer",
        created_at: "2026-03-30T01:00:00.000Z",
        updated_at: "2026-03-30T01:00:00.000Z",
      },
      sourceLineItems: [
        {
          id: "line_1",
          order_id: "ord_1",
          sku: "Calmi-001",
          quantity: 2,
          selling_price: 75000,
          cost_per_unit_snapshot: 12000,
          created_at: "2026-03-30T01:00:00.000Z",
        },
      ],
      nextOrderId: "SHOPE-20260401-002",
      today: "2026-04-01",
    })

    expect(result).toEqual({
      order_id: "SHOPE-20260401-002",
      channel: "shopee",
      order_date: "2026-04-01",
      status: "paid",
      channel_fees: 12000,
      notes: "repeat buyer",
      line_items: [
        {
          sku: "Calmi-001",
          quantity: 2,
          selling_price: 75000,
        },
      ],
    })
  })
})
```

- [ ] **Step 2: Write the failing source-contract tests for the new duplicate action and UI buttons**

```ts
import { describe, expect, it } from "vitest"
import { readFile } from "node:fs/promises"

describe("duplicate order source contract", () => {
  it("expects orders action to export duplicateOrder and reuse createOrder flow", async () => {
    const source = await readFile("lib/actions/orders.ts", "utf8")

    expect(source).toContain("export async function duplicateOrder(orderId: string)")
    expect(source).toContain("generateNextOrderId(")
    expect(source).toContain("status: \"paid\"")
    expect(source).toContain("buildDuplicateOrderInput(")
  })

  it("expects the orders list to expose a Duplicate action", async () => {
    const source = await readFile("app/(dashboard)/orders/page.tsx", "utf8")

    expect(source).toContain("Duplicate")
    expect(source).toContain("duplicateOrder(")
  })

  it("expects the order detail page to expose Duplicate Order", async () => {
    const source = await readFile("components/orders/order-detail-client.tsx", "utf8")

    expect(source).toContain("Duplicate Order")
    expect(source).toContain("duplicateOrder(")
  })
})
```

- [ ] **Step 3: Run the new test file to verify it fails**

Run: `npm test -- lib/orders/duplicate-order.test.ts`

Expected: FAIL because `buildDuplicateOrderInput` and `duplicateOrder` do not exist yet.

- [ ] **Step 4: Commit the failing test**

```bash
git add lib/orders/duplicate-order.test.ts
git commit -m "test: add duplicate order contracts"
```

## Task 2: Implement Shared Duplicate Payload Logic And Server Action

**Files:**
- Modify: `lib/actions/orders.ts`
- Test: `lib/orders/duplicate-order.test.ts`

- [ ] **Step 1: Add the shared duplicate payload helper**

```ts
export function buildDuplicateOrderInput(input: {
  sourceOrder: Order
  sourceLineItems: OrderLineItem[]
  nextOrderId: string
  today: string
}) {
  return {
    order_id: input.nextOrderId,
    channel: input.sourceOrder.channel,
    order_date: input.today,
    status: "paid" as const,
    channel_fees: input.sourceOrder.channel_fees,
    notes: input.sourceOrder.notes,
    line_items: input.sourceLineItems.map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      selling_price: item.selling_price,
    })),
  }
}
```

- [ ] **Step 2: Extract the current create-order body into one shared internal function**

```ts
async function createOrderRecord(formData: {
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  line_items: {
    sku: string
    quantity: number
    selling_price: number
  }[]
}) {
  const supabase = await createClient()

  const uniqueSkus = [...new Set(formData.line_items.map((item) => item.sku))]
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("sku, cost_per_unit")
    .in("sku", uniqueSkus)

  if (productsError) {
    console.error("Error fetching product costs:", productsError)
    return { success: false, error: productsError.message }
  }

  const productCosts = new Map(products?.map((product) => [product.sku, product.cost_per_unit]) || [])
  const missingSkus = uniqueSkus.filter((sku) => !productCosts.has(sku))

  if (missingSkus.length > 0) {
    return { success: false, error: `Missing product cost for SKU(s): ${missingSkus.join(", ")}` }
  }

  // move the existing order insert, line item insert, ledger generation,
  // marketplace settlement, changelog, and revalidation logic here unchanged
}
```

- [ ] **Step 3: Make `createOrder` delegate to the shared function**

```ts
export async function createOrder(formData: {
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  line_items: {
    sku: string
    quantity: number
    selling_price: number
  }[]
}) {
  return createOrderRecord(formData)
}
```

- [ ] **Step 4: Implement the duplicate server action**

```ts
export async function duplicateOrder(orderId: string) {
  const orderData = await getOrderById(orderId)

  if (!orderData) {
    return { success: false, error: "Order not found" }
  }

  if (orderData.lineItems.length === 0) {
    return { success: false, error: "Source order has no line items" }
  }

  const today = new Date().toISOString().split("T")[0]
  const nextOrderId = await generateNextOrderId(orderData.order.channel, today)

  const duplicateInput = buildDuplicateOrderInput({
    sourceOrder: orderData.order,
    sourceLineItems: orderData.lineItems,
    nextOrderId,
    today,
  })

  const result = await createOrderRecord(duplicateInput)

  if (!result.success) {
    return result
  }

  return {
    success: true,
    data: {
      id: result.data.id,
      order_id: nextOrderId,
    },
  }
}
```

- [ ] **Step 5: Run the duplicate-order test file to verify it passes**

Run: `npm test -- lib/orders/duplicate-order.test.ts`

Expected: PASS

- [ ] **Step 6: Run typecheck after the orders action changes**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 7: Commit the server action**

```bash
git add lib/actions/orders.ts lib/orders/duplicate-order.test.ts
git commit -m "feat: add duplicate order action"
```

## Task 3: Add Duplicate Button To Orders List

**Files:**
- Modify: `app/(dashboard)/orders/page.tsx`
- Test: `lib/orders/duplicate-order.test.ts`

- [ ] **Step 1: Add the failing source-contract assertion for a success message and disabled state in the orders list**

```ts
it("expects the orders list duplicate UI to show success feedback", async () => {
  const source = await readFile("app/(dashboard)/orders/page.tsx", "utf8")

  expect(source).toContain("Duplicated as")
  expect(source).toContain("duplicatingOrderId")
})
```

- [ ] **Step 2: Convert the orders list page to use a small client action area for duplication**

```tsx
import { duplicateOrder, getOrders } from "@/lib/actions/orders"

// inside the page component
const [duplicatingOrderId, setDuplicatingOrderId] = useState<string | null>(null)
const [successMessage, setSuccessMessage] = useState<string | null>(null)
const [errorMessage, setErrorMessage] = useState<string | null>(null)

const handleDuplicate = async (orderId: string) => {
  setDuplicatingOrderId(orderId)
  setSuccessMessage(null)
  setErrorMessage(null)

  const result = await duplicateOrder(orderId)

  if (result.success) {
    setSuccessMessage(`Duplicated as ${result.data.order_id}`)
    router.refresh()
  } else {
    setErrorMessage(result.error || "Failed to duplicate order")
  }

  setDuplicatingOrderId(null)
}
```

- [ ] **Step 3: Add Duplicate buttons in both mobile and desktop order list actions**

```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => handleDuplicate(order.id)}
  disabled={duplicatingOrderId === order.id}
>
  {duplicatingOrderId === order.id ? "Duplicating..." : "Duplicate"}
</Button>
```

- [ ] **Step 4: Add local success and error banners above the order list**

```tsx
{successMessage && (
  <div className="mb-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
    {successMessage}
  </div>
)}

{errorMessage && (
  <div className="mb-4 rounded-lg border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
    {errorMessage}
  </div>
)}
```

- [ ] **Step 5: Run the duplicate-order test file again**

Run: `npm test -- lib/orders/duplicate-order.test.ts`

Expected: PASS

- [ ] **Step 6: Commit the orders list UI**

```bash
git add app/(dashboard)/orders/page.tsx lib/orders/duplicate-order.test.ts
git commit -m "feat: add duplicate button to orders list"
```

## Task 4: Add Duplicate Button To Order Detail Page

**Files:**
- Modify: `components/orders/order-detail-client.tsx`
- Test: `lib/orders/duplicate-order.test.ts`

- [ ] **Step 1: Add the failing source-contract assertion for success feedback on the detail page**

```ts
it("expects the order detail duplicate UI to show success feedback", async () => {
  const source = await readFile("components/orders/order-detail-client.tsx", "utf8")

  expect(source).toContain("Duplicated as")
  expect(source).toContain("Duplicate Order")
})
```

- [ ] **Step 2: Import and wire the duplicate action in the detail client**

```tsx
import { duplicateOrder, updateOrderStatus } from "@/lib/actions/orders"

const [duplicating, setDuplicating] = useState(false)
const [successMessage, setSuccessMessage] = useState<string | null>(null)

const handleDuplicate = async () => {
  setDuplicating(true)
  setError(null)
  setSuccessMessage(null)

  const result = await duplicateOrder(order.id)

  if (result.success) {
    setSuccessMessage(`Duplicated as ${result.data.order_id}`)
    router.refresh()
  } else {
    setError(result.error || "Failed to duplicate order")
  }

  setDuplicating(false)
}
```

- [ ] **Step 3: Add the Duplicate Order button near the status badge/actions**

```tsx
<Button
  variant="outline"
  onClick={handleDuplicate}
  disabled={duplicating}
>
  {duplicating ? "Duplicating..." : "Duplicate Order"}
</Button>
```

- [ ] **Step 4: Render the success banner in the detail client**

```tsx
{successMessage && (
  <div className="mt-4 rounded-lg border border-success/20 bg-success/10 px-4 py-3 text-sm text-success">
    {successMessage}
  </div>
)}
```

- [ ] **Step 5: Run the duplicate-order test file**

Run: `npm test -- lib/orders/duplicate-order.test.ts`

Expected: PASS

- [ ] **Step 6: Run typecheck after the detail page changes**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 7: Commit the detail page UI**

```bash
git add components/orders/order-detail-client.tsx lib/orders/duplicate-order.test.ts
git commit -m "feat: add duplicate button to order detail"
```

## Task 5: Final Verification

**Files:**
- Verify: `lib/actions/orders.ts`
- Verify: `app/(dashboard)/orders/page.tsx`
- Verify: `components/orders/order-detail-client.tsx`
- Verify: `lib/orders/duplicate-order.test.ts`

- [ ] **Step 1: Run the focused test file**

Run: `npm test -- lib/orders/duplicate-order.test.ts`

Expected: PASS

- [ ] **Step 2: Run the existing restock helper test file to confirm no unrelated regression**

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS

- [ ] **Step 3: Run typecheck**

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 4: Run a focused lint pass on touched files**

Run: `npx eslint lib/actions/orders.ts app/(dashboard)/orders/page.tsx components/orders/order-detail-client.tsx lib/orders/duplicate-order.test.ts`

Expected: `0 errors` and only pre-existing warnings if any remain in unchanged lines

- [ ] **Step 5: Run build**

Run: `npm run build`

Expected: PASS

- [ ] **Step 6: Manual smoke checklist**

```md
1. Open `/orders`
2. Duplicate an existing order from the list
3. Confirm the page stays in place
4. Confirm a success message shows the new order ID
5. Confirm the new order appears in the order list after refresh
6. Open an order detail page
7. Duplicate from detail view
8. Confirm the success message shows the new order ID
9. Confirm the duplicated order has today's date and status `paid`
10. Confirm ledger entries and changelog were created like a normal paid order
```

## Self-Review

### Spec Coverage

- One-click duplicate action: Task 2, Task 3, Task 4
- Today’s date and forced `paid` status: Task 1, Task 2
- Reuse existing order creation logic: Task 2
- Stay on same page with success message showing new order ID: Task 3, Task 4
- Copy same items, fees, channel, prices, and notes: Task 1, Task 2
- Preserve ledger/settlement/changelog side effects: Task 2, Task 5

