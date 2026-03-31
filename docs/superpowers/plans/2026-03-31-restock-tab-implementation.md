# Restock Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated `Restock` tab that tracks China order date vs Indonesia arrival date, posts stock into the ledger only on arrival, writes an automatic arrival changelog entry, and updates dashboard restock guidance using the average lead time of the latest 3 completed shipments per `SKU + shipping mode`.

**Architecture:** Reuse the existing `inventory_purchase_batches` and `inventory_purchase_batch_items` tables instead of inventing a second purchase model. Add restock-specific fields plus an arrival-processing Postgres function so the high-integrity transition from `in_transit` to `arrived` happens atomically. Keep lead-time math in pure TypeScript helpers so the dashboard logic is testable outside Supabase and the UI stays thin.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres, server actions, Vitest for new unit coverage

---

## File Map

### Create

- `docs/superpowers/plans/2026-03-31-restock-tab-implementation.md`
- `supabase/migrations/20260331_add_restock_tracking.sql`
- `lib/restock/config.ts`
- `lib/restock/guidance.ts`
- `lib/restock/guidance.test.ts`
- `lib/actions/restock.ts`
- `app/(dashboard)/restock/page.tsx`
- `components/restock/restock-client.tsx`
- `vitest.config.ts`

### Modify

- `package.json`
- `lib/types/database.types.ts`
- `lib/actions/finance.ts`
- `lib/actions/changelog.ts`
- `lib/actions/orders.ts`
- `app/(dashboard)/dashboard/page.tsx`
- `components/layout/sidebar.tsx`
- `components/finance/finance-client.tsx`

### Responsibilities

- `supabase/migrations/20260331_add_restock_tracking.sql`
  Add restock fields to purchase batches, backfill existing rows safely, and create an atomic arrival-processing function.
- `lib/restock/config.ts`
  Hold manual buffer defaults and fallback lead assumptions by `SKU + shipping mode`.
- `lib/restock/guidance.ts`
  Contain pure lead-time and reorder-point calculation helpers.
- `lib/restock/guidance.test.ts`
  Verify the lead-time calculation and fallback behavior.
- `lib/actions/restock.ts`
  Own create/list/arrive server actions for the new `Restock` tab.
- `app/(dashboard)/restock/page.tsx`
  Load restock page data on the server.
- `components/restock/restock-client.tsx`
  Render the create form, in-transit list, and arrived history.
- `lib/actions/orders.ts`
  Replace the hard-coded restock guidance calculation with history-aware logic.
- `app/(dashboard)/dashboard/page.tsx`
  Render learned vs fallback lead+buffer values in the dashboard.
- `components/finance/finance-client.tsx`
  Remove the create-purchase workflow from Finance and replace it with a pointer to the new Restock tab.

## Task 1: Add TDD Harness And Pure Restock Guidance Helpers

**Files:**
- Create: `vitest.config.ts`
- Create: `lib/restock/config.ts`
- Create: `lib/restock/guidance.ts`
- Create: `lib/restock/guidance.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test for lead-time averaging and fallback**

```ts
// lib/restock/guidance.test.ts
import { describe, expect, it } from "vitest"
import {
  averageLatestLeadTimes,
  buildLeadBufferLabel,
  buildReorderWindow,
} from "./guidance"

describe("averageLatestLeadTimes", () => {
  it("uses the latest 3 completed shipments for one sku and mode", () => {
    const result = averageLatestLeadTimes([
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-01-01", arrival_date: "2026-01-10" },
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-02-01", arrival_date: "2026-02-13" },
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-03-01", arrival_date: "2026-03-14" },
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-04-01", arrival_date: "2026-04-16" },
    ])

    expect(result).toBe(13)
  })

  it("returns null when no completed shipments exist", () => {
    const result = averageLatestLeadTimes([
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-04-01", arrival_date: null },
    ])

    expect(result).toBeNull()
  })
})

describe("buildReorderWindow", () => {
  it("uses learned lead days when history exists", () => {
    const result = buildReorderWindow({
      avgDaily: 2.2,
      learnedLeadDays: 13,
      fallbackLeadMin: 7,
      fallbackLeadMax: 10,
      bufferDays: 7,
    })

    expect(result).toEqual({
      leadDays: 13,
      reorderMin: 44,
      reorderMax: 44,
      isFallback: false,
    })
  })

  it("uses fallback lead range when history is missing", () => {
    const result = buildReorderWindow({
      avgDaily: 2.2,
      learnedLeadDays: null,
      fallbackLeadMin: 7,
      fallbackLeadMax: 10,
      bufferDays: 7,
    })

    expect(result).toEqual({
      leadDays: null,
      reorderMin: 31,
      reorderMax: 38,
      isFallback: true,
    })
  })
})

describe("buildLeadBufferLabel", () => {
  it("renders learned and fallback labels differently", () => {
    expect(buildLeadBufferLabel({ leadDays: 13, fallbackLeadMin: 7, fallbackLeadMax: 10, bufferDays: 7, isFallback: false }))
      .toBe("Lead 13d + Buffer 7d = 20d")

    expect(buildLeadBufferLabel({ leadDays: null, fallbackLeadMin: 7, fallbackLeadMax: 10, bufferDays: 7, isFallback: true }))
      .toBe("Fallback 7-10d + Buffer 7d")
  })
})
```

- [ ] **Step 2: Add a minimal Vitest harness and run the test to verify it fails**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
  },
})
```

```json
// package.json
{
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^3.2.4"
  }
}
```

Run: `npm install`

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: FAIL with `Cannot find module './guidance'` or missing exports.

- [ ] **Step 3: Write the minimal restock config and guidance helpers**

```ts
// lib/restock/config.ts
export type ShippingMode = "air" | "sea"

export type RestockGuidanceConfig = {
  sku: string
  name: string
  mode: ShippingMode
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
}

export const RESTOCK_GUIDANCE_CONFIG: RestockGuidanceConfig[] = [
  { sku: "Cervi-001", name: "CerviCloud Pillow", mode: "sea", fallbackLeadMin: 28, fallbackLeadMax: 42, bufferDays: 14 },
  { sku: "Lumi-001", name: "LumiCloud Eye Mask", mode: "air", fallbackLeadMin: 7, fallbackLeadMax: 10, bufferDays: 7 },
  { sku: "Calmi-001", name: "CalmiCloud Ear Plug", mode: "air", fallbackLeadMin: 7, fallbackLeadMax: 10, bufferDays: 7 },
  { sku: "Calmi-001", name: "CalmiCloud Ear Plug", mode: "sea", fallbackLeadMin: 28, fallbackLeadMax: 42, bufferDays: 14 },
]
```

```ts
// lib/restock/guidance.ts
function daysBetween(orderDate: string, arrivalDate: string) {
  const start = new Date(`${orderDate}T00:00:00.000Z`)
  const end = new Date(`${arrivalDate}T00:00:00.000Z`)
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

type ShipmentSample = {
  sku: string
  shipping_mode: "air" | "sea"
  order_date: string
  arrival_date: string | null
}

export function averageLatestLeadTimes(samples: ShipmentSample[]) {
  const completed = samples
    .filter((sample) => sample.arrival_date)
    .sort((a, b) => (b.arrival_date || "").localeCompare(a.arrival_date || ""))
    .slice(0, 3)

  if (completed.length === 0) return null

  const total = completed.reduce((sum, sample) => {
    return sum + daysBetween(sample.order_date, sample.arrival_date as string)
  }, 0)

  return Math.round(total / completed.length)
}

export function buildReorderWindow(input: {
  avgDaily: number
  learnedLeadDays: number | null
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
}) {
  if (input.learnedLeadDays !== null) {
    const totalDays = input.learnedLeadDays + input.bufferDays
    const reorderUnits = Math.ceil(input.avgDaily * totalDays)

    return {
      leadDays: input.learnedLeadDays,
      reorderMin: reorderUnits,
      reorderMax: reorderUnits,
      isFallback: false,
    }
  }

  return {
    leadDays: null,
    reorderMin: Math.ceil(input.avgDaily * (input.fallbackLeadMin + input.bufferDays)),
    reorderMax: Math.ceil(input.avgDaily * (input.fallbackLeadMax + input.bufferDays)),
    isFallback: true,
  }
}

export function buildLeadBufferLabel(input: {
  leadDays: number | null
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
  isFallback: boolean
}) {
  if (input.isFallback || input.leadDays === null) {
    return `Fallback ${input.fallbackLeadMin}-${input.fallbackLeadMax}d + Buffer ${input.bufferDays}d`
  }

  return `Lead ${input.leadDays}d + Buffer ${input.bufferDays}d = ${input.leadDays + input.bufferDays}d`
}
```

- [ ] **Step 4: Run the test suite to verify the helpers pass**

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit the test harness and guidance utilities**

```bash
git add package.json package-lock.json vitest.config.ts lib/restock/config.ts lib/restock/guidance.ts lib/restock/guidance.test.ts
git commit -m "test: add restock guidance helpers"
```

## Task 2: Add Schema Support For Restock Tracking And Atomic Arrival Processing

**Files:**
- Create: `supabase/migrations/20260331_add_restock_tracking.sql`
- Modify: `lib/types/database.types.ts`

- [ ] **Step 1: Write the failing type-level test for the new restock fields**

```ts
// append to lib/restock/guidance.test.ts
import { expectTypeOf } from "vitest"
import type { InventoryPurchaseBatch } from "@/lib/types/database.types"

describe("inventory purchase batch typing", () => {
  it("includes restock tracking fields", () => {
    const batch = {} as InventoryPurchaseBatch

    expectTypeOf(batch.order_date).toEqualTypeOf<string>()
    expectTypeOf(batch.restock_status).toEqualTypeOf<"in_transit" | "arrived">()
    expectTypeOf(batch.shipping_mode).toEqualTypeOf<"air" | "sea" | null>()
    expectTypeOf(batch.arrival_date).toEqualTypeOf<string | null>()
  })
})
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: FAIL because `InventoryPurchaseBatch` does not yet expose those properties.

- [ ] **Step 2: Add the migration that extends purchase batches and creates the arrival RPC**

```sql
-- supabase/migrations/20260331_add_restock_tracking.sql
ALTER TABLE inventory_purchase_batches
  ADD COLUMN IF NOT EXISTS order_date DATE,
  ADD COLUMN IF NOT EXISTS arrival_date DATE,
  ADD COLUMN IF NOT EXISTS restock_status TEXT CHECK (restock_status IN ('in_transit', 'arrived')),
  ADD COLUMN IF NOT EXISTS shipping_mode TEXT CHECK (shipping_mode IN ('air', 'sea')),
  ADD COLUMN IF NOT EXISTS arrival_processed_at TIMESTAMPTZ;

UPDATE inventory_purchase_batches
SET
  order_date = COALESCE(order_date, entry_date),
  restock_status = COALESCE(restock_status, 'arrived'),
  arrival_date = CASE
    WHEN arrival_date IS NULL AND finance_entry_id IS NOT NULL THEN entry_date
    ELSE arrival_date
  END
WHERE order_date IS NULL OR restock_status IS NULL;

ALTER TABLE inventory_purchase_batches
  ALTER COLUMN order_date SET NOT NULL,
  ALTER COLUMN restock_status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_purchase_batches_status_date
  ON inventory_purchase_batches(restock_status, order_date DESC);

CREATE OR REPLACE FUNCTION process_inventory_purchase_arrival(
  target_batch_id UUID,
  target_arrival_date DATE
) RETURNS VOID AS $$
DECLARE
  batch_record inventory_purchase_batches%ROWTYPE;
  batch_item RECORD;
BEGIN
  SELECT *
  INTO batch_record
  FROM inventory_purchase_batches
  WHERE id = target_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found';
  END IF;

  IF batch_record.restock_status = 'arrived' OR batch_record.arrival_processed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Arrival already processed';
  END IF;

  IF target_arrival_date < batch_record.order_date THEN
    RAISE EXCEPTION 'Arrival date cannot be earlier than order date';
  END IF;

  UPDATE inventory_purchase_batches
  SET
    arrival_date = target_arrival_date,
    restock_status = 'arrived',
    arrival_processed_at = now()
  WHERE id = target_batch_id;

  FOR batch_item IN
    SELECT sku, quantity
    FROM inventory_purchase_batch_items
    WHERE batch_id = target_batch_id
  LOOP
    INSERT INTO inventory_ledger (entry_date, sku, movement_type, quantity, reference, created_by)
    VALUES (
      target_arrival_date,
      batch_item.sku,
      'IN_PURCHASE',
      batch_item.quantity,
      'Inventory purchase ' || target_batch_id,
      batch_record.created_by
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql;
```

- [ ] **Step 3: Update the TypeScript batch types to match the migration**

```ts
// lib/types/database.types.ts
export type ShippingMode = "air" | "sea"
export type RestockStatus = "in_transit" | "arrived"

export type InventoryPurchaseBatch = {
  id: string
  entry_date: string
  order_date: string
  arrival_date: string | null
  restock_status: RestockStatus
  shipping_mode: ShippingMode | null
  vendor: string | null
  account_id: string
  finance_entry_id: string | null
  total_amount: number
  notes: string | null
  created_by: string | null
  created_at: string
  arrival_processed_at: string | null
}
```

- [ ] **Step 4: Run tests and typecheck to verify the schema-facing types are now valid**

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

- [ ] **Step 5: Commit the schema and type changes**

```bash
git add supabase/migrations/20260331_add_restock_tracking.sql lib/types/database.types.ts lib/restock/guidance.test.ts
git commit -m "feat: add restock tracking schema"
```

## Task 3: Implement Server-Side Restock Actions And Arrival Changelog Logic

**Files:**
- Create: `lib/actions/restock.ts`
- Modify: `lib/actions/changelog.ts`
- Modify: `lib/actions/finance.ts`

- [ ] **Step 1: Write the failing tests for arrival changelog formatting and learned history filtering**

```ts
// append to lib/restock/guidance.test.ts
import { describe, expect, it } from "vitest"
import { buildArrivalChangelogItems, filterCompletedShipmentSamples } from "./guidance"

describe("filterCompletedShipmentSamples", () => {
  it("ignores batches missing arrival date or shipping mode", () => {
    const result = filterCompletedShipmentSamples([
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-04-01", arrival_date: "2026-04-12" },
      { sku: "Calmi-001", shipping_mode: null, order_date: "2026-04-02", arrival_date: "2026-04-14" },
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-04-03", arrival_date: null },
    ])

    expect(result).toEqual([
      { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-04-01", arrival_date: "2026-04-12" },
    ])
  })
})

describe("buildArrivalChangelogItems", () => {
  it("includes order date, arrival date, lead days, mode, and quantities", () => {
    const result = buildArrivalChangelogItems({
      orderDate: "2026-04-01",
      arrivalDate: "2026-04-12",
      shippingMode: "air",
      items: [
        { sku: "Calmi-001", quantity: 300 },
        { sku: "Lumi-001", quantity: 100 },
      ],
    })

    expect(result.map((item) => item.field_name)).toEqual([
      "Shipping mode",
      "China order date",
      "Warehouse arrival date",
      "Actual lead days",
      "Received items",
    ])
  })
})
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: FAIL because the new helper exports do not exist yet.

- [ ] **Step 2: Add the missing helper functions and extend the changelog allowlist**

```ts
// append to lib/restock/guidance.ts
export function filterCompletedShipmentSamples<T extends {
  sku: string
  shipping_mode: "air" | "sea" | null
  order_date: string
  arrival_date: string | null
}>(samples: T[]) {
  return samples.filter(
    (sample): sample is T & { shipping_mode: "air" | "sea"; arrival_date: string } =>
      Boolean(sample.shipping_mode && sample.arrival_date)
  )
}

export function buildArrivalChangelogItems(input: {
  orderDate: string
  arrivalDate: string
  shippingMode: "air" | "sea"
  items: Array<{ sku: string; quantity: number }>
}) {
  return [
    { field_name: "Shipping mode", new_value: input.shippingMode },
    { field_name: "China order date", new_value: input.orderDate },
    { field_name: "Warehouse arrival date", new_value: input.arrivalDate },
    { field_name: "Actual lead days", new_value: String(daysBetween(input.orderDate, input.arrivalDate)) },
    {
      field_name: "Received items",
      new_value: input.items.map((item) => `${item.sku} x${item.quantity}`).join(", "),
    },
  ]
}
```

```ts
// lib/actions/changelog.ts
const AUTOMATIC_CHANGELOG_EVENT_ALLOWLIST = new Set([
  "Product went out of stock",
  "Product restocked",
  "Restock arrived from China",
])
```

- [ ] **Step 3: Add dedicated restock server actions**

```ts
// lib/actions/restock.ts
"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { buildChangeItem } from "@/lib/changelog"
import { safeRecordAutomaticChangelogEntry } from "./changelog"
import { buildArrivalChangelogItems } from "@/lib/restock/guidance"

export async function createRestock(input: {
  order_date: string
  shipping_mode: "air" | "sea"
  account_id: string
  vendor?: string | null
  notes?: string | null
  items: Array<{ sku: string; quantity: number; unit_cost: number }>
}) {
  const supabase = await createClient()

  const validItems = input.items
    .filter((item) => item.sku && item.quantity > 0)
    .map((item) => ({ ...item, total_cost: item.quantity * item.unit_cost }))

  if (validItems.length === 0) {
    return { success: false, error: "At least one valid restock item is required" }
  }

  const totalAmount = validItems.reduce((sum, item) => sum + item.total_cost, 0)
  const { data: batch, error: batchError } = await supabase
    .from("inventory_purchase_batches")
    .insert([{
      entry_date: input.order_date,
      order_date: input.order_date,
      shipping_mode: input.shipping_mode,
      restock_status: "in_transit",
      account_id: input.account_id,
      vendor: input.vendor?.trim() || null,
      total_amount: totalAmount,
      notes: input.notes?.trim() || null,
    }])
    .select()
    .single()

  if (batchError) {
    return { success: false, error: batchError.message }
  }

  const { error: itemsError } = await supabase
    .from("inventory_purchase_batch_items")
    .insert(validItems.map((item) => ({
      batch_id: batch.id,
      sku: item.sku,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
    })))

  if (itemsError) {
    return { success: false, error: itemsError.message }
  }

  revalidatePath("/restock")
  revalidatePath("/finance")
  return { success: true, data: batch }
}

export async function markRestockArrived(input: {
  batch_id: string
  arrival_date: string
}) {
  const supabase = await createClient()

  const { error: rpcError } = await supabase.rpc("process_inventory_purchase_arrival", {
    target_batch_id: input.batch_id,
    target_arrival_date: input.arrival_date,
  })

  if (rpcError) {
    return { success: false, error: rpcError.message }
  }

  const { data: batch } = await supabase
    .from("inventory_purchase_batches")
    .select("id, order_date, arrival_date, shipping_mode, vendor, notes")
    .eq("id", input.batch_id)
    .single()

  const { data: items } = await supabase
    .from("inventory_purchase_batch_items")
    .select("sku, quantity")
    .eq("batch_id", input.batch_id)

  await safeRecordAutomaticChangelogEntry({
    logged_at: `${input.arrival_date}T00:00:00.000Z`,
    area: "inventory",
    action_summary: "Restock arrived from China",
    entity_type: "inventory_purchase_batch",
    entity_id: input.batch_id,
    entity_label: batch?.vendor || `Restock ${input.batch_id}`,
    notes: batch?.notes || null,
    items: [
      ...buildArrivalChangelogItems({
        orderDate: batch?.order_date || input.arrival_date,
        arrivalDate: batch?.arrival_date || input.arrival_date,
        shippingMode: (batch?.shipping_mode || "air") as "air" | "sea",
        items: (items || []) as Array<{ sku: string; quantity: number }>,
      }),
      buildChangeItem("Vendor", null, batch?.vendor || null),
    ].filter(Boolean),
  })

  revalidatePath("/restock")
  revalidatePath("/dashboard")
  revalidatePath("/ledger")
  revalidatePath("/changelog")
  return { success: true }
}
```

- [ ] **Step 4: Reuse the new restock action from finance instead of posting stock immediately**

```ts
// lib/actions/finance.ts
import { createRestock } from "./restock"

export async function createInventoryPurchase(input: {
  entry_date: string
  account_id: string
  vendor?: string | null
  notes?: string | null
  items: InventoryPurchaseItemInput[]
}) {
  return createRestock({
    order_date: input.entry_date,
    shipping_mode: "air",
    account_id: input.account_id,
    vendor: input.vendor,
    notes: input.notes,
    items: input.items,
  })
}
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS

- [ ] **Step 5: Typecheck and commit the server actions**

Run: `npm run typecheck`

Expected: PASS

```bash
git add lib/actions/restock.ts lib/actions/changelog.ts lib/actions/finance.ts lib/restock/guidance.ts lib/restock/guidance.test.ts
git commit -m "feat: add restock server actions"
```

## Task 4: Add The Restock Page, Sidebar Entry, And Finance Cleanup

**Files:**
- Create: `app/(dashboard)/restock/page.tsx`
- Create: `components/restock/restock-client.tsx`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/finance/finance-client.tsx`

- [ ] **Step 1: Write the failing UI test plan as a route-level smoke check**

```ts
// append to lib/restock/guidance.test.ts
describe("restock route file contract", () => {
  it("expects the sidebar to link to /restock", async () => {
    const sidebarSource = await import("node:fs/promises").then((fs) =>
      fs.readFile("components/layout/sidebar.tsx", "utf8")
    )

    expect(sidebarSource).toContain('href: "/restock"')
    expect(sidebarSource).toContain('name: "Restock"')
  })
})
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: FAIL because the sidebar does not yet contain the Restock route.

- [ ] **Step 2: Add the new Restock route loader**

```ts
// app/(dashboard)/restock/page.tsx
import { getFinanceAccounts } from "@/lib/actions/finance"
import { getProducts } from "@/lib/actions/products"
import { getInventoryPurchaseBatches } from "@/lib/actions/finance"
import { RestockClient } from "@/components/restock/restock-client"

export default async function RestockPage() {
  const [accounts, products, batches] = await Promise.all([
    getFinanceAccounts(),
    getProducts(),
    getInventoryPurchaseBatches({ limit: 100 }),
  ])

  return (
    <RestockClient
      accounts={accounts}
      products={products.filter((product) => product.status === "active")}
      inTransit={batches.filter((batch) => batch.restock_status === "in_transit")}
      arrived={batches.filter((batch) => batch.restock_status === "arrived")}
    />
  )
}
```

- [ ] **Step 3: Implement the Restock client and sidebar link**

```ts
// components/layout/sidebar.tsx
import { Ship } from "lucide-react"

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Products", href: "/products", icon: Package },
  { name: "Ledger", href: "/ledger", icon: FileText },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Restock", href: "/restock", icon: Ship },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Ad Campaigns", href: "/ad-campaigns", icon: TrendingUp },
  { name: "Finance", href: "/finance", icon: Landmark },
  { name: "Changelog", href: "/changelog", icon: History },
]
```

```tsx
// components/restock/restock-client.tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createRestock, markRestockArrived } from "@/lib/actions/restock"
import { formatCurrency, formatDate } from "@/lib/utils"

export function RestockClient({ accounts, products, inTransit, arrived }: any) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [items, setItems] = useState([
    { id: crypto.randomUUID(), sku: "", quantity: 1, unit_cost: 0 },
  ])

  function updateItem(id: string, field: "sku" | "quantity" | "unit_cost", value: string | number) {
    setItems((current) => current.map((item) => (
      item.id === id ? { ...item, [field]: value } : item
    )))
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), sku: "", quantity: 1, unit_cost: 0 },
    ])
  }

  async function handleCreate(formData: FormData) {
    setError(null)
    const result = await createRestock({
      order_date: formData.get("order_date") as string,
      shipping_mode: formData.get("shipping_mode") as "air" | "sea",
      account_id: formData.get("account_id") as string,
      vendor: (formData.get("vendor") as string) || null,
      notes: (formData.get("notes") as string) || null,
      items: items.map((item) => ({
        sku: item.sku,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
      })),
    })

    if (!result.success) {
      setError(result.error || "Failed to create restock")
      return
    }

    router.refresh()
  }

  async function handleArrive(batchId: string, arrivalDate: string) {
    const result = await markRestockArrived({ batch_id: batchId, arrival_date: arrivalDate })
    if (!result.success) {
      setError(result.error || "Failed to mark restock arrived")
      return
    }

    router.refresh()
  }

  return (
    <div className="space-y-6">
      <section>
        <h2 className="text-xl font-semibold">Create Restock</h2>
        <form action={handleCreate} className="space-y-4">
          <input name="order_date" type="date" required />
          <select name="shipping_mode" required>
            <option value="air">Air</option>
            <option value="sea">Sea</option>
          </select>
          <select name="account_id" required>
            {accounts.map((account: any) => (
              <option key={account.id} value={account.id}>{account.name}</option>
            ))}
          </select>
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-3 gap-2">
              <select value={item.sku} onChange={(event) => updateItem(item.id, "sku", event.target.value)}>
                <option value="">Select SKU</option>
                {products.map((product: any) => (
                  <option key={product.sku} value={product.sku}>{product.sku}</option>
                ))}
              </select>
              <input type="number" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", Number(event.target.value))} />
              <input type="number" value={item.unit_cost} onChange={(event) => updateItem(item.id, "unit_cost", Number(event.target.value))} />
            </div>
          ))}
          <button type="button" onClick={addItem}>Add Item</button>
          <button type="submit">Create Restock</button>
        </form>
      </section>
      <section>
        <h2 className="text-xl font-semibold">In Transit</h2>
        {inTransit.map((batch: any) => (
          <div key={batch.id} className="flex items-center justify-between gap-4">
            <div>
              <div>{batch.vendor || "Restock"}</div>
              <div>{formatDate(batch.order_date)} · {batch.shipping_mode}</div>
            </div>
            <button onClick={() => handleArrive(batch.id, new Date().toISOString().slice(0, 10))}>
              Mark Arrived
            </button>
          </div>
        ))}
      </section>
      <section>
        <h2 className="text-xl font-semibold">Arrived History</h2>
        {arrived.map((batch: any) => (
          <div key={batch.id}>
            {batch.vendor || "Restock"} · {formatDate(batch.order_date)} to {formatDate(batch.arrival_date)}
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 4: Replace the Finance inventory purchase creation UI with a redirect CTA**

```tsx
// components/finance/finance-client.tsx
import Link from "next/link"

<TabsContent value="inventory-purchases" className="space-y-6">
  <Card>
    <CardHeader>
      <CardTitle>Restock Workflow Moved</CardTitle>
      <CardDescription>
        Create new supplier replenishment orders in the dedicated Restock tab.
      </CardDescription>
    </CardHeader>
    <CardContent className="flex items-center justify-between gap-4">
      <p className="text-sm text-muted-foreground">
        Finance still shows the cash impact, but in-transit and arrival handling now live in Restock.
      </p>
      <Link href="/restock">
        <Button>Open Restock</Button>
      </Link>
    </CardContent>
  </Card>
</TabsContent>
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS

- [ ] **Step 5: Run lint and commit the UI shell**

Run: `npm run lint`

Expected: PASS

```bash
git add app/(dashboard)/restock/page.tsx components/restock/restock-client.tsx components/layout/sidebar.tsx components/finance/finance-client.tsx
git commit -m "feat: add restock workspace"
```

## Task 5: Wire Dashboard Guidance To Learned Restock History

**Files:**
- Modify: `lib/actions/orders.ts`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Write the failing tests for mapping restock history into dashboard guidance**

```ts
// append to lib/restock/guidance.test.ts
import { mapRecommendationRow } from "./guidance"

describe("mapRecommendationRow", () => {
  it("creates a learned recommendation when completed restocks exist", () => {
    const result = mapRecommendationRow({
      sku: "Calmi-001",
      name: "CalmiCloud Ear Plug",
      mode: "air",
      avgDaily: 2,
      fallbackLeadMin: 7,
      fallbackLeadMax: 10,
      bufferDays: 7,
      shipments: [
        { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-01-01", arrival_date: "2026-01-10" },
        { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-02-01", arrival_date: "2026-02-14" },
        { sku: "Calmi-001", shipping_mode: "air", order_date: "2026-03-01", arrival_date: "2026-03-15" },
      ],
    })

    expect(result.isFallback).toBe(false)
    expect(result.leadDays).toBe(12)
    expect(result.reorderMin).toBe(38)
    expect(result.reorderMax).toBe(38)
  })
})
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: FAIL because `mapRecommendationRow` does not exist.

- [ ] **Step 2: Add the recommendation mapping helper**

```ts
// append to lib/restock/guidance.ts
export function mapRecommendationRow(input: {
  sku: string
  name: string
  mode: "air" | "sea"
  avgDaily: number
  fallbackLeadMin: number
  fallbackLeadMax: number
  bufferDays: number
  shipments: Array<{
    sku: string
    shipping_mode: "air" | "sea" | null
    order_date: string
    arrival_date: string | null
  }>
}) {
  const learnedLeadDays = averageLatestLeadTimes(
    filterCompletedShipmentSamples(
      input.shipments.filter(
        (shipment) => shipment.sku === input.sku && shipment.shipping_mode === input.mode
      )
    )
  )

  const window = buildReorderWindow({
    avgDaily: input.avgDaily,
    learnedLeadDays,
    fallbackLeadMin: input.fallbackLeadMin,
    fallbackLeadMax: input.fallbackLeadMax,
    bufferDays: input.bufferDays,
  })

  return {
    sku: input.sku,
    name: input.name,
    mode: input.mode,
    avgDaily: input.avgDaily,
    bufferDays: input.bufferDays,
    fallbackLeadMin: input.fallbackLeadMin,
    fallbackLeadMax: input.fallbackLeadMax,
    leadDays: window.leadDays,
    reorderMin: window.reorderMin,
    reorderMax: window.reorderMax,
    isFallback: window.isFallback,
    leadLabel: buildLeadBufferLabel({
      leadDays: window.leadDays,
      fallbackLeadMin: input.fallbackLeadMin,
      fallbackLeadMax: input.fallbackLeadMax,
      bufferDays: input.bufferDays,
      isFallback: window.isFallback,
    }),
  }
}
```

- [ ] **Step 3: Replace the hard-coded guidance logic in `getReorderRecommendations`**

```ts
// lib/actions/orders.ts
import { RESTOCK_GUIDANCE_CONFIG } from "@/lib/restock/config"
import { mapRecommendationRow } from "@/lib/restock/guidance"

const { data: batches } = await supabase
  .from("inventory_purchase_batches")
  .select(`
    id,
    order_date,
    arrival_date,
    shipping_mode,
    restock_status,
    inventory_purchase_batch_items (sku, quantity)
  `)
  .eq("restock_status", "arrived")
  .not("arrival_date", "is", null)

const shipmentSamples = (batches || []).flatMap((batch: any) =>
  (batch.inventory_purchase_batch_items || []).map((item: any) => ({
    sku: item.sku,
    shipping_mode: batch.shipping_mode,
    order_date: batch.order_date,
    arrival_date: batch.arrival_date,
  }))
)

const recommendations = RESTOCK_GUIDANCE_CONFIG.map((config) =>
  mapRecommendationRow({
    sku: config.sku,
    name: config.name,
    mode: config.mode,
    avgDaily: effectiveUnits.get(config.sku)! / days,
    fallbackLeadMin: config.fallbackLeadMin,
    fallbackLeadMax: config.fallbackLeadMax,
    bufferDays: config.bufferDays,
    shipments: shipmentSamples,
  })
)
```

- [ ] **Step 4: Update the dashboard table to show the new learned label**

```tsx
// app/(dashboard)/dashboard/page.tsx
<TableHead className="text-right">Lead+Buffer</TableHead>

<TableCell className="text-right">
  <div>{rec.leadLabel}</div>
  {rec.isFallback ? (
    <div className="text-xs text-muted-foreground">No completed shipment history yet</div>
  ) : (
    <div className="text-xs text-muted-foreground">Based on latest 3 completed restocks</div>
  )}
</TableCell>
```

Run: `npm test -- lib/restock/guidance.test.ts`

Expected: PASS

- [ ] **Step 5: Run the full verification set and commit**

Run: `npm test`

Expected: PASS

Run: `npm run typecheck`

Expected: PASS

Run: `npm run lint`

Expected: PASS

```bash
git add lib/actions/orders.ts app/(dashboard)/dashboard/page.tsx lib/restock/guidance.ts lib/restock/guidance.test.ts
git commit -m "feat: learn reorder guidance from restock history"
```

## Task 6: Final Verification And Documentation Sweep

**Files:**
- Modify: `README.md` if the new `Restock` tab needs a short mention
- Modify: `FINANCE_SOP.md` if it currently points users to Finance for purchase creation

- [ ] **Step 1: Update ops docs so the workflow location is not contradictory**

```md
## Restock Workflow

Create supplier replenishment orders in the `Restock` tab.

- `order_date` records when cash leaves for the supplier
- `arrival_date` records when stock lands in Indonesia
- stock is added automatically only when the batch is marked `arrived`
```

- [ ] **Step 2: Run an end-to-end manual smoke checklist locally**

```md
1. Open `/restock`
2. Create a new in-transit batch with one SKU
3. Confirm `/ledger` does not change yet
4. Mark the same batch arrived with a later date
5. Confirm `/ledger` now contains `IN_PURCHASE`
6. Confirm `/changelog` shows `Restock arrived from China`
7. Confirm `/dashboard` updates the relevant guidance row
```

Run: `npm run build`

Expected: PASS

- [ ] **Step 3: Commit the doc updates after verification**

```bash
git add README.md FINANCE_SOP.md
git commit -m "docs: document restock workflow"
```

## Self-Review

### Spec Coverage

- New `Restock` tab: Task 4
- Reuse purchase batch model: Task 2
- Cash-out on order date, stock only on arrival: Tasks 2 and 3
- Arrival-only automatic changelog: Task 3
- Learned lead time from latest 3 completed shipments: Tasks 1 and 5
- Manual buffer preserved: Tasks 1 and 5
- Finance no longer owns the operational workflow: Task 4

### Placeholder Scan

- No `TBD`, `TODO`, or “implement later” placeholders remain.
- Every task contains file paths, commands, and concrete code snippets.

### Type Consistency

- `shipping_mode` is defined as `"air" | "sea"` in config, types, and actions.
- `restock_status` is consistently `"in_transit" | "arrived"`.
- `order_date` and `arrival_date` are the canonical timing fields across migration, types, actions, and dashboard logic.
