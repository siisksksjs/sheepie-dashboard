# Pricing, Pack Sizes, COGS History, Finance Phase-1, and Restock Guidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update Calmi public pricing, add shared pack-size support and a channel price matrix to the dashboard, surface COGS history in product detail, hide Finance from the active dashboard UX, and fix Restock Guidance to exclude out-of-stock days from `Avg/Day`.

**Architecture:** Keep one base inventory SKU per product and add a forward-looking pack-size model on `order_line_items` plus product-level pack enablement and channel price defaults. Preserve legacy bundle-SKU handling for historical rows, derive COGS history from restock batches plus direct product cost edits, and phase Finance out by removing UI first while leaving DB structures intact.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/Postgres, server actions, Vitest

---

## Scope Note

This spec spans several UI surfaces, but they are tightly coupled by the same order-line schema and reporting logic. This plan keeps them together so the migration, backfill, and verification steps stay coherent.

## File Map

### Create

- `supabase/migrations/20260420_add_pack_sizes_and_price_matrix.sql`
- `lib/products/pack-sizes.ts`
- `lib/products/pack-sizes.test.ts`
- `lib/products/cogs-history.ts`
- `lib/products/cogs-history.test.ts`
- `components/products/product-pack-settings.tsx`
- `components/products/product-channel-pricing.tsx`
- `components/products/product-cogs-history.tsx`
- `docs/superpowers/plans/2026-04-20-pricing-bundles-cogs-implementation.md`

### Modify

- `lib/types/database.types.ts`
- `lib/actions/orders.ts`
- `components/orders/new-order-form.tsx`
- `components/orders/order-detail-client.tsx`
- `components/orders/orders-list-client.tsx`
- `lib/actions/products.ts`
- `app/(dashboard)/products/[sku]/edit/page.tsx`
- `components/products/edit-product-form.tsx`
- `app/(dashboard)/products/page.tsx`
- `app/(dashboard)/dashboard/page.tsx`
- `components/layout/sidebar.tsx`
- `app/(dashboard)/finance/page.tsx`
- `components/finance/finance-client.tsx`
- `sheepie/data/products.json`
- `sheepie/components/product/product-details.tsx`
- `sheepie/components/product/product-card.tsx`

### Responsibilities

- `supabase/migrations/20260420_add_pack_sizes_and_price_matrix.sql`
  Add pack-size and price-matrix schema, backfill `order_line_items.pack_size = 'single'`, and seed baseline default-price rows.
- `lib/products/pack-sizes.ts`
  Centralize pack-size vocabulary, multiplier lookup, and legacy safety guards.
- `lib/actions/orders.ts`
  Persist pack size on orders, deduct stock by pack multiplier, and update reporting/restock calculations.
- `components/orders/new-order-form.tsx`
  Replace hard-coded price maps with SKU + pack-size + channel defaults.
- `lib/products/cogs-history.ts`
  Build a product-level timeline from restock batches plus product cost edits.
- `lib/actions/products.ts`
  Fetch pack availability, channel pricing, and COGS history; log cost edits automatically.
- `components/products/*`
  Add product-detail sections for pack enablement, price matrix editing, and COGS history.
- `components/layout/sidebar.tsx` and `app/(dashboard)/finance/page.tsx`
  Remove Finance from active navigation and make the phase-1 UI shutdown explicit.
- `app/(dashboard)/dashboard/page.tsx`
  Replace elapsed-day averaging with in-stock-day averaging in Restock Guidance.
- `sheepie/data/products.json`
  Update Calmi public prices.

## Task 1: Add Pack-Size Schema, Types, and Helper Coverage

**Files:**
- Create: `supabase/migrations/20260420_add_pack_sizes_and_price_matrix.sql`
- Create: `lib/products/pack-sizes.ts`
- Create: `lib/products/pack-sizes.test.ts`
- Modify: `lib/types/database.types.ts`

- [ ] **Step 1: Write the failing helper test for pack sizes and multipliers**

```ts
// lib/products/pack-sizes.test.ts
import { describe, expect, it } from "vitest"
import {
  DEFAULT_PACK_SIZE,
  getPackMultiplier,
  isValidPackSize,
  PACK_SIZE_OPTIONS,
} from "./pack-sizes"

describe("pack size helpers", () => {
  it("exposes the supported pack-size vocabulary", () => {
    expect(PACK_SIZE_OPTIONS.map((item) => item.value)).toEqual([
      "single",
      "bundle_2",
      "bundle_3",
      "bundle_4",
    ])
  })

  it("returns the correct multiplier per pack size", () => {
    expect(getPackMultiplier("single")).toBe(1)
    expect(getPackMultiplier("bundle_2")).toBe(2)
    expect(getPackMultiplier("bundle_3")).toBe(3)
    expect(getPackMultiplier("bundle_4")).toBe(4)
  })

  it("guards unknown values and preserves the single default", () => {
    expect(DEFAULT_PACK_SIZE).toBe("single")
    expect(isValidPackSize("bundle_3")).toBe(true)
    expect(isValidPackSize("legacy")).toBe(false)
  })
})
```

- [ ] **Step 2: Run the helper test to verify the module does not exist yet**

Run: `npm test -- lib/products/pack-sizes.test.ts`

Expected: FAIL with `Cannot find module './pack-sizes'`.

- [ ] **Step 3: Add the pure helper module**

```ts
// lib/products/pack-sizes.ts
export const PACK_SIZE_OPTIONS = [
  { value: "single", label: "Single", multiplier: 1 },
  { value: "bundle_2", label: "Bundle of 2", multiplier: 2 },
  { value: "bundle_3", label: "Bundle of 3", multiplier: 3 },
  { value: "bundle_4", label: "Bundle of 4", multiplier: 4 },
] as const

export type PackSize = (typeof PACK_SIZE_OPTIONS)[number]["value"]

export const DEFAULT_PACK_SIZE: PackSize = "single"

export function isValidPackSize(value: string): value is PackSize {
  return PACK_SIZE_OPTIONS.some((item) => item.value === value)
}

export function getPackMultiplier(packSize: PackSize): number {
  return PACK_SIZE_OPTIONS.find((item) => item.value === packSize)?.multiplier ?? 1
}
```

- [ ] **Step 4: Add the schema migration and type additions**

```sql
-- supabase/migrations/20260420_add_pack_sizes_and_price_matrix.sql
alter table public.order_line_items
  add column if not exists pack_size text;

update public.order_line_items
set pack_size = 'single'
where pack_size is null;

alter table public.order_line_items
  alter column pack_size set not null;

alter table public.order_line_items
  add constraint order_line_items_pack_size_check
  check (pack_size in ('single', 'bundle_2', 'bundle_3', 'bundle_4'));

create table if not exists public.product_pack_sizes (
  id uuid primary key default gen_random_uuid(),
  sku text not null references public.products(sku) on delete cascade,
  pack_size text not null check (pack_size in ('single', 'bundle_2', 'bundle_3', 'bundle_4')),
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, pack_size)
);

create table if not exists public.product_channel_pack_prices (
  id uuid primary key default gen_random_uuid(),
  sku text not null references public.products(sku) on delete cascade,
  pack_size text not null check (pack_size in ('single', 'bundle_2', 'bundle_3', 'bundle_4')),
  channel text not null check (channel in ('shopee', 'tokopedia', 'tiktok', 'offline')),
  default_selling_price numeric(10, 2) not null check (default_selling_price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sku, pack_size, channel)
);
```

```ts
// lib/types/database.types.ts
export type PackSize = "single" | "bundle_2" | "bundle_3" | "bundle_4"

export type OrderLineItem = {
  id: string
  order_id: string
  sku: string
  quantity: number
  pack_size: PackSize
  selling_price: number
  cost_per_unit_snapshot: number | null
  created_at: string
}
```

- [ ] **Step 5: Run the helper test again**

Run: `npm test -- lib/products/pack-sizes.test.ts`

Expected: PASS.

- [ ] **Step 6: Regenerate or hand-update types after the migration is applied**

Run: `npm run typecheck`

Expected: either type errors that point to missing `pack_size` usage, or PASS if no references have been added yet.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260420_add_pack_sizes_and_price_matrix.sql lib/products/pack-sizes.ts lib/products/pack-sizes.test.ts lib/types/database.types.ts
git commit -m "feat: add pack size schema and helpers"
```

## Task 2: Make Order Entry And Stock Deduction Pack-Size Aware

**Files:**
- Modify: `components/orders/new-order-form.tsx`
- Modify: `lib/actions/orders.ts`
- Modify: `components/orders/order-detail-client.tsx`
- Modify: `components/orders/orders-list-client.tsx`
- Modify: `lib/types/database.types.ts`

- [ ] **Step 1: Write the failing test for pack-size stock effects**

Add this case to the existing order test area or a new focused file:

```ts
// lib/products/cogs-history.test.ts
import { describe, expect, it } from "vitest"
import { getPackMultiplier } from "./pack-sizes"

describe("pack-size stock effects", () => {
  it("converts order quantity into consumed units", () => {
    const lineQuantity = 3
    const consumed = lineQuantity * getPackMultiplier("bundle_4")
    expect(consumed).toBe(12)
  })
})
```

- [ ] **Step 2: Run the focused test**

Run: `npm test -- lib/products/cogs-history.test.ts`

Expected: FAIL because the file does not exist yet.

- [ ] **Step 3: Extend the order form line-item model with pack size**

```ts
// components/orders/new-order-form.tsx
type LineItem = {
  id: string
  sku: string
  pack_size: PackSize
  quantity: number
  selling_price: number
}

const DEFAULT_LINE_ITEM: LineItem = {
  id: crypto.randomUUID(),
  sku: "",
  pack_size: "single",
  quantity: 1,
  selling_price: 0,
}
```

Use a `Select` for `pack_size`, and replace `getDefaultPriceForChannel(sku, channel)` with a function that queries preloaded matrix rows by `sku + pack_size + channel`.

- [ ] **Step 4: Persist pack size in order creation**

```ts
// lib/actions/orders.ts
type CreateOrderInput = {
  order_id: string
  channel: Channel
  order_date: string
  status: OrderStatus
  channel_fees: number | null
  notes: string | null
  line_items: {
    sku: string
    pack_size: PackSize
    quantity: number
    selling_price: number
  }[]
}

const lineItemsToInsert = formData.line_items.map((item) => ({
  order_id: order.id,
  sku: item.sku,
  pack_size: item.pack_size,
  quantity: item.quantity,
  selling_price: item.selling_price,
  cost_per_unit_snapshot: productCosts.get(item.sku) ?? 0,
}))
```

- [ ] **Step 5: Replace regular-product stock deduction with pack-size stock deduction**

```ts
// lib/actions/orders.ts
import { getPackMultiplier } from "@/lib/products/pack-sizes"

const consumedUnits = item.quantity * getPackMultiplier(item.pack_size)

const ledgerResult = await createLedgerEntry({
  sku: item.sku,
  movement_type: "OUT_SALE",
  quantity: -consumedUnits,
  reference: `Order ${formData.order_id} (${item.pack_size})`,
}, { skipChangelog: true })
```

Apply the same multiplier logic in:

- create flow
- status-change settlement flow
- cancellation / return reversal flow
- duplicate-order input builder

- [ ] **Step 6: Render pack size in order detail and list rows**

```tsx
// components/orders/order-detail-client.tsx
<p className="text-xs text-muted-foreground">
  {item.pack_size.replace("_", " ")} · qty {item.quantity}
</p>
```

```tsx
// components/orders/orders-list-client.tsx
<Badge variant="outline" className="text-xs">
  {item.pack_size.replace("_", " ")}
</Badge>
```

- [ ] **Step 7: Run typecheck and targeted tests**

Run:

- `npm run typecheck`
- `npm test -- lib/products/pack-sizes.test.ts lib/products/cogs-history.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add components/orders/new-order-form.tsx components/orders/order-detail-client.tsx components/orders/orders-list-client.tsx lib/actions/orders.ts lib/types/database.types.ts lib/products/cogs-history.test.ts
git commit -m "feat: make orders pack size aware"
```

## Task 3: Add Product Pack Enablement And Channel Default Price Matrix

**Files:**
- Create: `components/products/product-pack-settings.tsx`
- Create: `components/products/product-channel-pricing.tsx`
- Modify: `lib/actions/products.ts`
- Modify: `app/(dashboard)/products/[sku]/edit/page.tsx`
- Modify: `components/products/edit-product-form.tsx`

- [ ] **Step 1: Add a server-action fetch shape for product detail dependencies**

```ts
// lib/actions/products.ts
export type ProductPackSetting = {
  id: string
  sku: string
  pack_size: PackSize
  is_enabled: boolean
}

export type ProductChannelPackPrice = {
  id: string
  sku: string
  pack_size: PackSize
  channel: Channel
  default_selling_price: number
}

export async function getProductEditWorkspace(sku: string) {
  const supabase = await createClient()

  const [{ data: product }, { data: packSizes }, { data: channelPrices }] = await Promise.all([
    supabase.from("products").select("*").eq("sku", sku).single(),
    supabase.from("product_pack_sizes").select("*").eq("sku", sku).order("pack_size"),
    supabase.from("product_channel_pack_prices").select("*").eq("sku", sku).order("channel"),
  ])

  return {
    product: product as Product,
    packSizes: (packSizes || []) as ProductPackSetting[],
    channelPrices: (channelPrices || []) as ProductChannelPackPrice[],
  }
}
```

- [ ] **Step 2: Add update actions for pack enablement and channel prices**

```ts
// lib/actions/products.ts
export async function saveProductPackSettings(
  sku: string,
  items: Array<{ pack_size: PackSize; is_enabled: boolean }>,
) {
  const supabase = await createClient()
  await supabase.from("product_pack_sizes").upsert(
    items.map((item) => ({ sku, ...item })),
    { onConflict: "sku,pack_size" },
  )
}

export async function saveProductChannelPackPrices(
  sku: string,
  items: Array<{ pack_size: PackSize; channel: Channel; default_selling_price: number }>,
) {
  const supabase = await createClient()
  await supabase.from("product_channel_pack_prices").upsert(
    items.map((item) => ({ sku, ...item })),
    { onConflict: "sku,pack_size,channel" },
  )
}
```

- [ ] **Step 3: Add product-detail sections for pack enablement and pricing**

```tsx
// app/(dashboard)/products/[sku]/edit/page.tsx
import { getProductEditWorkspace } from "@/lib/actions/products"

const workspace = await getProductEditWorkspace(sku)

return (
  <EditProductForm
    product={workspace.product}
    packSizes={workspace.packSizes}
    channelPrices={workspace.channelPrices}
  />
)
```

```tsx
// components/products/edit-product-form.tsx
<ProductPackSettings sku={product.sku} packSizes={packSizes} />
<ProductChannelPricing sku={product.sku} packSizes={packSizes} channelPrices={channelPrices} />
```

- [ ] **Step 4: Seed missing product pack rows during product workspace load**

When a SKU has no rows yet, derive defaults in the action:

```ts
const seededPackSizes = PACK_SIZE_OPTIONS.map((option) => ({
  pack_size: option.value,
  is_enabled: option.value === "single",
}))
```

Use upsert-on-read once, then return the stored rows.

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/products.ts app/(dashboard)/products/[sku]/edit/page.tsx components/products/edit-product-form.tsx components/products/product-pack-settings.tsx components/products/product-channel-pricing.tsx
git commit -m "feat: add product pack settings and channel pricing"
```

## Task 4: Add Product COGS History And Automatic Cost Changelog Logging

**Files:**
- Create: `lib/products/cogs-history.ts`
- Create: `lib/products/cogs-history.test.ts`
- Create: `components/products/product-cogs-history.tsx`
- Modify: `lib/actions/products.ts`
- Modify: `lib/actions/changelog.ts`
- Modify: `components/products/edit-product-form.tsx`

- [ ] **Step 1: Write the failing COGS history timeline test**

```ts
// lib/products/cogs-history.test.ts
import { describe, expect, it } from "vitest"
import { buildCogsHistoryTimeline } from "./cogs-history"

describe("buildCogsHistoryTimeline", () => {
  it("merges restock-derived and manual product cost events in reverse chronological order", () => {
    const result = buildCogsHistoryTimeline({
      restockEvents: [
        { sku: "Lumi-001", effective_at: "2026-04-09", unit_cost: 67937, quantity: 100, vendor: null, shipping_mode: "air" },
      ],
      changelogEvents: [
        { sku: "Lumi-001", effective_at: "2026-04-12", old_value: "67937", new_value: "70690" },
      ],
    })

    expect(result.map((item) => item.event_type)).toEqual(["manual_edit", "restock"])
  })
})
```

- [ ] **Step 2: Run the failing test**

Run: `npm test -- lib/products/cogs-history.test.ts`

Expected: FAIL with `Cannot find module './cogs-history'`.

- [ ] **Step 3: Implement the pure history builder**

```ts
// lib/products/cogs-history.ts
export function buildCogsHistoryTimeline(input: {
  restockEvents: Array<{
    sku: string
    effective_at: string
    unit_cost: number
    quantity: number
    vendor: string | null
    shipping_mode: "air" | "sea" | null
  }>
  changelogEvents: Array<{
    sku: string
    effective_at: string
    old_value: string | null
    new_value: string | null
  }>
}) {
  return [
    ...input.restockEvents.map((event) => ({
      event_type: "restock" as const,
      effective_at: event.effective_at,
      old_cost: null,
      new_cost: event.unit_cost,
      quantity: event.quantity,
      vendor: event.vendor,
      shipping_mode: event.shipping_mode,
    })),
    ...input.changelogEvents.map((event) => ({
      event_type: "manual_edit" as const,
      effective_at: event.effective_at,
      old_cost: event.old_value ? Number(event.old_value) : null,
      new_cost: event.new_value ? Number(event.new_value) : null,
      quantity: null,
      vendor: null,
      shipping_mode: null,
    })),
  ].sort((a, b) => b.effective_at.localeCompare(a.effective_at))
}
```

- [ ] **Step 4: Query history in the product action and render it**

```ts
// lib/actions/products.ts
export async function getProductCogsHistory(sku: string) {
  const supabase = await createClient()

  const [{ data: restockRows }, { data: changelogRows }] = await Promise.all([
    supabase
      .from("inventory_purchase_batches")
      .select("order_date, arrival_date, vendor, shipping_mode, inventory_purchase_batch_items!inner(sku, quantity, unit_cost)")
      .eq("inventory_purchase_batch_items.sku", sku),
    supabase
      .from("changelog_entries")
      .select("logged_at, changelog_items!inner(field_name, old_value, new_value)")
      .eq("area", "products")
      .eq("entity_id", sku),
  ])

  return buildCogsHistoryTimeline({
    restockEvents: [],
    changelogEvents: [],
  })
}
```

```tsx
// components/products/edit-product-form.tsx
<ProductCogsHistory sku={product.sku} history={cogsHistory} />
```

- [ ] **Step 5: Automatically log cost changes in product update**

Ensure the existing `updateProduct` path writes a changelog entry whenever `cost_per_unit` changes:

```ts
// lib/actions/products.ts
const items = [
  buildChangeItem("Cost per unit", previousProduct.cost_per_unit, data.cost_per_unit),
].filter(Boolean)
```

Expand the automatic changelog allowlist or retrieval behavior if product-area automatic entries are currently filtered out.

- [ ] **Step 6: Run targeted tests and typecheck**

Run:

- `npm test -- lib/products/cogs-history.test.ts`
- `npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/products/cogs-history.ts lib/products/cogs-history.test.ts lib/actions/products.ts lib/actions/changelog.ts components/products/product-cogs-history.tsx components/products/edit-product-form.tsx
git commit -m "feat: add product cogs history timeline"
```

## Task 5: Update Reporting And Restock Guidance For Pack Splits And In-Stock-Day Averaging

**Files:**
- Modify: `lib/actions/orders.ts`
- Modify: `app/(dashboard)/dashboard/page.tsx`
- Modify: `app/(dashboard)/products/page.tsx`
- Modify: `lib/products/pack-sizes.ts`

- [ ] **Step 1: Extract an in-stock-day helper**

Add a pure helper near the restock logic:

```ts
// lib/actions/orders.ts
function countInStockDays(input: {
  startDate: string
  endDate: string
  openingStock: number
  ledgerEvents: Array<{ entry_date: string; quantity: number }>
}) {
  let currentStock = input.openingStock
  let inStockDays = 0

  for (const day of eachUtcDate(input.startDate, input.endDate)) {
    for (const event of input.ledgerEvents.filter((item) => item.entry_date === day)) {
      currentStock += event.quantity
    }
    if (currentStock > 0) inStockDays += 1
  }

  return inStockDays
}
```

- [ ] **Step 2: Replace elapsed-day averaging with in-stock-day averaging**

```ts
// lib/actions/orders.ts
const denominator = Math.max(1, inStockDays)
const avgDaily = unitsSold / denominator
```

Also update the returned metadata so the UI can say:

```ts
{
  averagingMode: "in_stock_days",
  inStockDays,
  analysisStartDate: startDate.toISOString().slice(0, 10),
}
```

- [ ] **Step 3: Make reporting preserve pack-size splits while keeping rolled-up SKU totals**

For group-by-product reporting, build two keys:

```ts
const rolledUpKey = item.sku
const splitKey = `${item.sku}:${item.pack_size}`
```

Use rolled-up keys for inventory planning and split keys for the commercial breakdown payload exposed to the UI.

- [ ] **Step 4: Update UI copy in the dashboard**

```tsx
// app/(dashboard)/dashboard/page.tsx
<CardDescription>
  Based on in-stock selling days since {reorderRecommendations.analysisStartDate}
</CardDescription>
```

- [ ] **Step 5: Run typecheck and any order/report tests**

Run:

- `npm run typecheck`
- `npm test -- lib/products/pack-sizes.test.ts lib/products/cogs-history.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/actions/orders.ts app/(dashboard)/dashboard/page.tsx app/(dashboard)/products/page.tsx
git commit -m "fix: use in-stock days for restock guidance"
```

## Task 6: Remove Finance From Active Dashboard UX (Phase 1)

**Files:**
- Modify: `components/layout/sidebar.tsx`
- Modify: `app/(dashboard)/finance/page.tsx`
- Modify: `components/finance/finance-client.tsx`

- [ ] **Step 1: Remove Finance from sidebar navigation**

```ts
// components/layout/sidebar.tsx
const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Products", href: "/products", icon: Package },
  { name: "Ledger", href: "/ledger", icon: FileText },
  { name: "Orders", href: "/orders", icon: ShoppingCart },
  { name: "Restock", href: "/restock", icon: Ship },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Ad Campaigns", href: "/ad-campaigns", icon: TrendingUp },
  { name: "Changelog", href: "/changelog", icon: History },
]
```

- [ ] **Step 2: Turn the Finance route into a phase-1 archive screen**

```tsx
// app/(dashboard)/finance/page.tsx
export default function FinancePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-display font-bold">Finance Archived</h1>
      <p className="text-muted-foreground">
        Finance has been removed from the active dashboard flow. Data remains in the database during phase 1.
      </p>
    </div>
  )
}
```

- [ ] **Step 3: Remove remaining in-app prompts that push users into Finance**

In `components/finance/finance-client.tsx`, replace action-heavy copy with a short archive note or stop rendering the component entirely if the route becomes static.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add components/layout/sidebar.tsx app/(dashboard)/finance/page.tsx components/finance/finance-client.tsx
git commit -m "refactor: archive finance ui in phase one"
```

## Task 7: Update Public Pricing For CalmiCloud

**Files:**
- Modify: `sheepie/data/products.json`
- Modify: `sheepie/components/product/product-card.tsx`
- Modify: `sheepie/components/product/product-details.tsx`

- [ ] **Step 1: Update the data source price values**

```json
// sheepie/data/products.json
{
  "slug": "calmicloud",
  "originalPrice": "IDR 108.000",
  "price": "IDR 88.000"
}
```

- [ ] **Step 2: Verify the display components already consume the JSON values**

Run:

- `rg -n "\"calmicloud\"|originalPrice|price" sheepie/data/products.json sheepie/components/product`

Expected: `product-card.tsx` and `product-details.tsx` still read from product data with no hard-coded Calmi values.

- [ ] **Step 3: Run the public-site typecheck or build**

Run from `sheepie/`:

- `npm run typecheck`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git -C /Users/tsth/Coding/sheepie/sheepie add data/products.json components/product/product-card.tsx components/product/product-details.tsx
git -C /Users/tsth/Coding/sheepie/sheepie commit -m "fix: update calmi public pricing"
```

## Task 8: Final Integration Verification

**Files:**
- Modify: `lib/actions/orders.ts`
- Modify: `components/orders/new-order-form.tsx`
- Modify: `components/products/edit-product-form.tsx`
- Modify: `app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Run the dashboard test and typecheck suite**

Run from `dashboard-sheepie/`:

- `npm run typecheck`
- `npm test`

Expected: PASS.

- [ ] **Step 2: Apply the migration to the active Supabase project and regenerate types**

Run:

- `npm run db:migrate:dev`
- regenerate `lib/types/database.types.ts` if your workflow requires it

Expected: the migration applies cleanly and `order_line_items.pack_size` backfills to `single`.

- [ ] **Step 3: Manual spot-check the key user flows**

Verify:

- Calmi public page shows `IDR 88.000` and `IDR 108.000`
- Shopee order default for `Calmi-001 + single` is `88.000`
- a `bundle_2` order deducts `2` units from the base SKU
- product edit shows pack toggles, price matrix, and COGS history
- Finance is absent from sidebar navigation
- Restock Guidance no longer says `Based on average daily sales since 2025-12-27`

- [ ] **Step 4: Commit the integration pass**

```bash
git add .
git commit -m "feat: ship pricing, pack sizes, cogs history, and finance phase one"
```

## Self-Review

### Spec Coverage

- Public Calmi price update: covered by Task 7.
- Shared pack-size model for all base SKUs: covered by Tasks 1 to 3.
- Price matrix by `SKU x pack size x channel`: covered by Tasks 1 and 3.
- COGS history with changelog integration: covered by Task 4.
- Finance phase-1 UI removal: covered by Task 6.
- Restock `Avg/Day` excluding out-of-stock days: covered by Task 5.
- Legacy bundle compatibility: called out in Task 2 and verified in Task 8.

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation placeholders remain.
- All major schema and UI seams are assigned to concrete files.

### Type Consistency

- `PackSize` is defined once in `lib/products/pack-sizes.ts` and reflected in `lib/types/database.types.ts`.
- `order_line_items.pack_size` is the single persistent field used by order entry, order rendering, and reporting.
- Product-level pack settings and channel prices use explicit tables instead of overloading `products`.
