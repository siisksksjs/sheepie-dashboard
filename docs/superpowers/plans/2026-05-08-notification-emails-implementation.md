# Notification Emails Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mobile-readable HTML email notifications for reorder-point crossings and weekly/monthly sales reports, sent through Resend to every Supabase Auth user.

**Architecture:** Store alert/report email work as durable Supabase `notification_events`, create restock events from inventory ledger inserts, and send pending events through Supabase Edge Functions using Resend. Keep reusable business rules in small TypeScript/Deno modules so tests can verify route scope, threshold behavior, report periods, and email rendering without hitting external services.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase Postgres, Supabase Edge Functions on Deno, Resend REST API, Vitest, pg-mem

---

## File Map

### Create

- `docs/superpowers/plans/2026-05-08-notification-emails-implementation.md`
- `lib/notifications/restock-alerts.ts`
- `lib/notifications/restock-alerts.test.ts`
- `lib/notifications/email-html.ts`
- `lib/notifications/email-html.test.ts`
- `lib/notifications/periods.ts`
- `lib/notifications/periods.test.ts`
- `lib/notifications/trigger-sender.ts`
- `lib/notifications/source-contracts.test.ts`
- `supabase/migrations/20260508_add_notification_events.sql`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/resend.ts`
- `supabase/functions/_shared/email-html.ts`
- `supabase/functions/_shared/report-periods.ts`
- `supabase/functions/send-notification-events/index.ts`
- `supabase/functions/send-sales-report/index.ts`

### Modify

- `lib/restock/config.ts`
- `lib/types/database.types.ts`
- `lib/actions/inventory.ts`
- `lib/actions/restock.ts`
- `.env.local`

### Responsibilities

- `lib/notifications/restock-alerts.ts`
  Owns restock alert route scope, pure threshold selection, and crossing detection.
- `lib/notifications/email-html.ts`
  Renders mobile-friendly HTML for restock alert batches and sales reports.
- `lib/notifications/periods.ts`
  Computes Jakarta business timezone weekly/monthly report periods.
- `lib/notifications/trigger-sender.ts`
  Invokes the notification Edge Function from server actions after stock-changing workflows.
- `supabase/migrations/20260508_add_notification_events.sql`
  Adds durable notification events, idempotency rules, helper SQL functions, and the ledger trigger.
- `supabase/functions/_shared/*`
  Contains Deno-compatible shared helpers for auth, Resend delivery, HTML rendering, and report periods.
- `supabase/functions/send-notification-events/index.ts`
  Sends pending restock alert events through Resend.
- `supabase/functions/send-sales-report/index.ts`
  Builds weekly/monthly sales report events and sends them through Resend.

## Task 1: Add Pure Restock Alert Rules

**Files:**
- Create: `lib/notifications/restock-alerts.test.ts`
- Create: `lib/notifications/restock-alerts.ts`
- Modify: `lib/restock/config.ts`

- [ ] **Step 1: Write failing tests for route scope, thresholds, and crossings**

Create `lib/notifications/restock-alerts.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  RESTOCK_ALERT_ROUTES,
  buildRestockAlertRouteKey,
  didCrossReorderThreshold,
  getConservativeReorderThreshold,
  getRestockAlertRoutesForSku,
} from "./restock-alerts"

describe("restock alert routes", () => {
  it("limits notification scope to the requested SKU/mode routes", () => {
    expect(RESTOCK_ALERT_ROUTES).toEqual([
      { sku: "Cervi-001", mode: "sea" },
      { sku: "Lumi-001", mode: "air" },
      { sku: "Lumi-001", mode: "sea" },
      { sku: "Calmi-001", mode: "air" },
      { sku: "Calmi-001", mode: "sea" },
    ])
    expect(getRestockAlertRoutesForSku("Cervi-001").map((route) => route.mode)).toEqual(["sea"])
    expect(getRestockAlertRoutesForSku("Lumi-001").map((route) => route.mode)).toEqual(["air", "sea"])
    expect(getRestockAlertRoutesForSku("Calmi-001").map((route) => route.mode)).toEqual(["air", "sea"])
    expect(getRestockAlertRoutesForSku("Cervi-002")).toEqual([])
  })

  it("builds stable route keys", () => {
    expect(buildRestockAlertRouteKey("Lumi-001", "sea")).toBe("Lumi-001:sea")
  })
})

describe("getConservativeReorderThreshold", () => {
  it("uses reorderMax for fallback ranges", () => {
    expect(getConservativeReorderThreshold({ reorderMin: 31, reorderMax: 38 })).toBe(38)
  })

  it("uses the learned single threshold when min and max match", () => {
    expect(getConservativeReorderThreshold({ reorderMin: 44, reorderMax: 44 })).toBe(44)
  })
})

describe("didCrossReorderThreshold", () => {
  it("fires only when stock crosses from above to at or below threshold", () => {
    expect(didCrossReorderThreshold({ previousStock: 41, currentStock: 40, threshold: 40 })).toBe(true)
    expect(didCrossReorderThreshold({ previousStock: 40, currentStock: 39, threshold: 40 })).toBe(false)
    expect(didCrossReorderThreshold({ previousStock: 45, currentStock: 41, threshold: 40 })).toBe(false)
    expect(didCrossReorderThreshold({ previousStock: 35, currentStock: 42, threshold: 40 })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the failing tests**

Run: `npm test -- lib/notifications/restock-alerts.test.ts`

Expected: FAIL because `lib/notifications/restock-alerts.ts` does not exist.

- [ ] **Step 3: Implement the pure alert helper**

Create `lib/notifications/restock-alerts.ts`:

```ts
import type { ShippingMode } from "@/lib/restock/config"

export type RestockAlertRoute = {
  sku: string
  mode: ShippingMode
}

export type ReorderThresholdInput = {
  reorderMin: number
  reorderMax: number
}

export type ReorderCrossingInput = {
  previousStock: number
  currentStock: number
  threshold: number
}

export const RESTOCK_ALERT_ROUTES: RestockAlertRoute[] = [
  { sku: "Cervi-001", mode: "sea" },
  { sku: "Lumi-001", mode: "air" },
  { sku: "Lumi-001", mode: "sea" },
  { sku: "Calmi-001", mode: "air" },
  { sku: "Calmi-001", mode: "sea" },
]

export function buildRestockAlertRouteKey(sku: string, mode: ShippingMode) {
  return `${sku}:${mode}`
}

export function getRestockAlertRoutesForSku(sku: string) {
  return RESTOCK_ALERT_ROUTES.filter((route) => route.sku === sku)
}

export function getConservativeReorderThreshold(input: ReorderThresholdInput) {
  return input.reorderMax
}

export function didCrossReorderThreshold(input: ReorderCrossingInput) {
  return input.previousStock > input.threshold && input.currentStock <= input.threshold
}
```

- [ ] **Step 4: Update the existing restock guidance config to include only the requested alert routes**

Modify `lib/restock/config.ts` so `RESTOCK_GUIDANCE_CONFIG` contains these route entries:

```ts
export const RESTOCK_GUIDANCE_CONFIG: RestockGuidanceConfig[] = [
  {
    sku: "Cervi-001",
    name: "CerviCloud Pillow",
    mode: "sea",
    fallbackLeadMin: 28,
    fallbackLeadMax: 42,
    bufferDays: 14,
  },
  {
    sku: "Lumi-001",
    name: "LumiCloud Eye Mask",
    mode: "air",
    fallbackLeadMin: 7,
    fallbackLeadMax: 10,
    bufferDays: 7,
  },
  {
    sku: "Lumi-001",
    name: "LumiCloud Eye Mask",
    mode: "sea",
    fallbackLeadMin: 28,
    fallbackLeadMax: 42,
    bufferDays: 14,
  },
  {
    sku: "Calmi-001",
    name: "CalmiCloud Ear Plug",
    mode: "air",
    fallbackLeadMin: 7,
    fallbackLeadMax: 10,
    bufferDays: 7,
  },
  {
    sku: "Calmi-001",
    name: "CalmiCloud Ear Plug",
    mode: "sea",
    fallbackLeadMin: 28,
    fallbackLeadMax: 42,
    bufferDays: 14,
  },
]
```

- [ ] **Step 5: Run route tests**

Run: `npm test -- lib/notifications/restock-alerts.test.ts lib/restock/guidance.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/notifications/restock-alerts.ts lib/notifications/restock-alerts.test.ts lib/restock/config.ts
git commit -m "feat: add restock alert route rules"
```

## Task 2: Add Email HTML And Report Period Helpers

**Files:**
- Create: `lib/notifications/email-html.test.ts`
- Create: `lib/notifications/email-html.ts`
- Create: `lib/notifications/periods.test.ts`
- Create: `lib/notifications/periods.ts`

- [ ] **Step 1: Write failing tests for HTML rendering**

Create `lib/notifications/email-html.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  renderRestockAlertEmailHtml,
  renderSalesReportEmailHtml,
} from "./email-html"

describe("renderRestockAlertEmailHtml", () => {
  it("renders mobile-readable restock details without CSV dependency", () => {
    const html = renderRestockAlertEmailHtml({
      title: "Restock reorder alert",
      events: [
        {
          sku: "Lumi-001",
          productName: "LumiCloud Eye Mask",
          shippingMode: "sea",
          threshold: 160,
          previousStock: 185,
          currentStock: 158,
          leadTimeLabel: "Fallback 28-42d + Buffer 14d",
        },
      ],
    })

    expect(html).toContain("Restock reorder alert")
    expect(html).toContain("LumiCloud Eye Mask")
    expect(html).toContain("Lumi-001")
    expect(html).toContain("Sea")
    expect(html).toContain("158")
    expect(html).toContain("160")
    expect(html).toContain("Fallback 28-42d + Buffer 14d")
    expect(html).toContain("<table")
    expect(html).not.toContain(".csv")
  })
})

describe("renderSalesReportEmailHtml", () => {
  it("renders report totals and breakdowns", () => {
    const html = renderSalesReportEmailHtml({
      title: "Weekly sales report",
      periodLabel: "May 4-10, 2026",
      totals: {
        orders: 12,
        unitsSold: 45,
        revenue: 9_500_000,
        cost: 3_000_000,
        profit: 6_500_000,
        returnedUnits: 2,
      },
      bySku: [
        {
          sku: "Calmi-001",
          name: "CalmiCloud Ear Plug",
          unitsSold: 25,
          revenue: 2_500_000,
          profit: 1_600_000,
        },
      ],
      byChannel: [
        {
          channel: "shopee",
          orders: 8,
          revenue: 6_000_000,
          profit: 4_100_000,
        },
      ],
      lowStock: [
        {
          sku: "Lumi-001",
          productName: "LumiCloud Eye Mask",
          shippingMode: "air",
          threshold: 45,
          currentStock: 11,
        },
      ],
    })

    expect(html).toContain("Weekly sales report")
    expect(html).toContain("May 4-10, 2026")
    expect(html).toContain("Rp9,500,000")
    expect(html).toContain("CalmiCloud Ear Plug")
    expect(html).toContain("shopee")
    expect(html).toContain("Low stock")
    expect(html).toContain("Lumi-001")
  })
})
```

- [ ] **Step 2: Write failing tests for Jakarta weekly/monthly periods**

Create `lib/notifications/periods.test.ts`:

```ts
import { describe, expect, it } from "vitest"

import {
  getCompletedMonthlyReportPeriod,
  getCompletedWeeklyReportPeriod,
} from "./periods"

describe("report periods", () => {
  it("returns the completed Monday-Sunday week in Jakarta time", () => {
    expect(getCompletedWeeklyReportPeriod(new Date("2026-05-11T01:00:00.000Z"))).toEqual({
      periodStart: "2026-05-04",
      periodEnd: "2026-05-10",
      label: "May 4-10, 2026",
    })
  })

  it("returns the completed previous month in Jakarta time", () => {
    expect(getCompletedMonthlyReportPeriod(new Date("2026-06-01T01:00:00.000Z"))).toEqual({
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      label: "May 2026",
    })
  })
})
```

- [ ] **Step 3: Run the failing tests**

Run: `npm test -- lib/notifications/email-html.test.ts lib/notifications/periods.test.ts`

Expected: FAIL because helper files do not exist.

- [ ] **Step 4: Implement HTML rendering**

Create `lib/notifications/email-html.ts`:

```ts
type RestockEmailEvent = {
  sku: string
  productName: string
  shippingMode: "air" | "sea"
  threshold: number
  previousStock: number
  currentStock: number
  leadTimeLabel: string
}

type SalesReportSkuRow = {
  sku: string
  name: string
  unitsSold: number
  revenue: number
  profit: number
}

type SalesReportChannelRow = {
  channel: string
  orders: number
  revenue: number
  profit: number
}

type LowStockRow = {
  sku: string
  productName: string
  shippingMode: "air" | "sea"
  threshold: number
  currentStock: number
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value).replace(/\s/g, "")
}

function formatMode(mode: "air" | "sea") {
  return mode === "air" ? "Air" : "Sea"
}

function pageShell(title: string, body: string) {
  return `<!doctype html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;background:#f6f7f9;color:#111827;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;padding:20px;">
      ${body}
      <p style="margin:24px 0 0;color:#6b7280;font-size:12px;">Sent by Sheepie Dashboard.</p>
    </div>
  </body>
</html>`
}

export function renderRestockAlertEmailHtml(input: {
  title: string
  events: RestockEmailEvent[]
}) {
  const rows = input.events.map((event) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(event.productName)}</strong><br /><span style="color:#6b7280;">${escapeHtml(event.sku)}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${formatMode(event.shippingMode)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${event.currentStock}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${event.threshold}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(event.leadTimeLabel)}</td>
    </tr>
  `).join("")

  return pageShell(input.title, `
    <h1 style="margin:0 0 8px;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#4b5563;">The following SKU shipment routes crossed their reorder threshold.</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;">
      <thead>
        <tr>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">SKU</th>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">Mode</th>
          <th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;">Stock</th>
          <th align="right" style="padding:10px;border-bottom:1px solid #e5e7eb;">Reorder</th>
          <th align="left" style="padding:10px;border-bottom:1px solid #e5e7eb;">Lead time</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `)
}

export function renderSalesReportEmailHtml(input: {
  title: string
  periodLabel: string
  totals: {
    orders: number
    unitsSold: number
    revenue: number
    cost: number
    profit: number
    returnedUnits: number
  }
  bySku: SalesReportSkuRow[]
  byChannel: SalesReportChannelRow[]
  lowStock: LowStockRow[]
}) {
  const skuRows = input.bySku.map((row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;"><strong>${escapeHtml(row.name)}</strong><br /><span style="color:#6b7280;">${escapeHtml(row.sku)}</span></td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${row.unitsSold}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.revenue)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.profit)}</td>
    </tr>
  `).join("")
  const channelRows = input.byChannel.map((row) => `
    <tr>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;">${escapeHtml(row.channel)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${row.orders}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.revenue)}</td>
      <td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(row.profit)}</td>
    </tr>
  `).join("")
  const lowStockRows = input.lowStock.map((row) => `
    <li>${escapeHtml(row.productName)} (${escapeHtml(row.sku)}) ${formatMode(row.shippingMode)}: ${row.currentStock} on hand, reorder at ${row.threshold}</li>
  `).join("")

  return pageShell(input.title, `
    <h1 style="margin:0 0 4px;font-size:24px;line-height:1.25;">${escapeHtml(input.title)}</h1>
    <p style="margin:0 0 18px;color:#4b5563;">${escapeHtml(input.periodLabel)}</p>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;">
      <tbody>
        <tr><td style="padding:10px;">Orders</td><td style="padding:10px;text-align:right;"><strong>${input.totals.orders}</strong></td></tr>
        <tr><td style="padding:10px;">Units sold</td><td style="padding:10px;text-align:right;"><strong>${input.totals.unitsSold}</strong></td></tr>
        <tr><td style="padding:10px;">Revenue</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.revenue)}</strong></td></tr>
        <tr><td style="padding:10px;">COGS</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.cost)}</strong></td></tr>
        <tr><td style="padding:10px;">Profit</td><td style="padding:10px;text-align:right;"><strong>${formatCurrency(input.totals.profit)}</strong></td></tr>
        <tr><td style="padding:10px;">Returned units</td><td style="padding:10px;text-align:right;"><strong>${input.totals.returnedUnits}</strong></td></tr>
      </tbody>
    </table>
    <h2 style="font-size:18px;">Sales by SKU</h2>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;"><tbody>${skuRows}</tbody></table>
    <h2 style="font-size:18px;">Sales by channel</h2>
    <table style="width:100%;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;margin-bottom:18px;"><tbody>${channelRows}</tbody></table>
    <h2 style="font-size:18px;">Low stock</h2>
    <ul style="background:#ffffff;border:1px solid #e5e7eb;margin:0;padding:14px 14px 14px 32px;">${lowStockRows || "<li>No monitored SKU routes are below threshold.</li>"}</ul>
  `)
}
```

- [ ] **Step 5: Implement report period helpers**

Create `lib/notifications/periods.ts`:

```ts
const JAKARTA_TIME_ZONE = "Asia/Jakarta"

function getJakartaDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: JAKARTA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  }
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10)
}

function utcDateFromParts(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day))
}

function addDays(date: Date, days: number) {
  const copy = new Date(date)
  copy.setUTCDate(copy.getUTCDate() + days)
  return copy
}

function formatRangeLabel(start: Date, end: Date) {
  const sameMonth = start.getUTCMonth() === end.getUTCMonth()
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear()
  const startLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(start)
  const endLabel = new Intl.DateTimeFormat("en-US", {
    ...(sameMonth ? {} : { month: "short" }),
    day: "numeric",
    year: "numeric",
  }).format(end)

  return `${startLabel}-${endLabel}`
}

export function getCompletedWeeklyReportPeriod(now = new Date()) {
  const parts = getJakartaDateParts(now)
  const today = utcDateFromParts(parts.year, parts.month, parts.day)
  const dayOfWeek = today.getUTCDay()
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1
  const currentWeekMonday = addDays(today, -daysSinceMonday)
  const periodStart = addDays(currentWeekMonday, -7)
  const periodEnd = addDays(currentWeekMonday, -1)

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd),
    label: formatRangeLabel(periodStart, periodEnd),
  }
}

export function getCompletedMonthlyReportPeriod(now = new Date()) {
  const parts = getJakartaDateParts(now)
  const currentMonthStart = utcDateFromParts(parts.year, parts.month, 1)
  const periodEnd = addDays(currentMonthStart, -1)
  const periodStart = utcDateFromParts(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 1)
  const label = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(periodStart)

  return {
    periodStart: toDateKey(periodStart),
    periodEnd: toDateKey(periodEnd),
    label,
  }
}
```

- [ ] **Step 6: Run helper tests**

Run: `npm test -- lib/notifications/email-html.test.ts lib/notifications/periods.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/notifications/email-html.ts lib/notifications/email-html.test.ts lib/notifications/periods.ts lib/notifications/periods.test.ts
git commit -m "feat: add notification email rendering helpers"
```

## Task 3: Add Notification Event Schema And Trigger

**Files:**
- Create: `supabase/migrations/20260508_add_notification_events.sql`
- Modify: `lib/types/database.types.ts`
- Create: `lib/notifications/source-contracts.test.ts`

- [ ] **Step 1: Write failing schema contract tests**

Create `lib/notifications/source-contracts.test.ts`:

```ts
import { readFile } from "node:fs/promises"
import { describe, expect, expectTypeOf, it } from "vitest"

import type { NotificationEvent, NotificationEventStatus, NotificationEventType } from "@/lib/types/database.types"

describe("notification event types", () => {
  it("defines notification event TypeScript contracts", async () => {
    const event = {} as NotificationEvent
    const status = {} as NotificationEventStatus
    const type = {} as NotificationEventType
    const source = await readFile("lib/types/database.types.ts", "utf8")

    expectTypeOf(event.id).toEqualTypeOf<string>()
    expectTypeOf(event.event_type).toEqualTypeOf<NotificationEventType>()
    expectTypeOf(event.status).toEqualTypeOf<NotificationEventStatus>()
    expectTypeOf(event.idempotency_key).toEqualTypeOf<string>()
    expectTypeOf(event.payload).toEqualTypeOf<Record<string, unknown>>()
    expectTypeOf(event.sent_at).toEqualTypeOf<string | null>()
    expectTypeOf(status).toEqualTypeOf<"pending" | "sending" | "sent" | "failed">()
    expectTypeOf(type).toEqualTypeOf<"restock_alert" | "weekly_sales_report" | "monthly_sales_report">()
    expect(source).toContain("export type NotificationEventStatus")
    expect(source).toContain("export type NotificationEvent = {")
  })
})

describe("notification migration contracts", () => {
  it("creates durable notification events and ledger trigger", async () => {
    const source = await readFile("supabase/migrations/20260508_add_notification_events.sql", "utf8")

    expect(source).toMatch(/create table notification_events/i)
    expect(source).toMatch(/idempotency_key text not null unique/i)
    expect(source).toMatch(/event_type text not null check/i)
    expect(source).toMatch(/status text not null default 'pending'/i)
    expect(source).toMatch(/payload jsonb not null default '\{\}'::jsonb/i)
    expect(source).toMatch(/create or replace function enqueue_restock_alert_events/i)
    expect(source).toMatch(/create trigger enqueue_restock_alert_events_after_insert/i)
    expect(source).toMatch(/after insert on inventory_ledger/i)
    expect(source).toMatch(/'Cervi-001', 'sea'/i)
    expect(source).toMatch(/'Lumi-001', 'air'/i)
    expect(source).toMatch(/'Lumi-001', 'sea'/i)
    expect(source).toMatch(/'Calmi-001', 'air'/i)
    expect(source).toMatch(/'Calmi-001', 'sea'/i)
    expect(source).not.toMatch(/Cervi-002/i)
  })
})
```

- [ ] **Step 2: Run the failing contract test**

Run: `npm test -- lib/notifications/source-contracts.test.ts`

Expected: FAIL because the migration and types do not exist.

- [ ] **Step 3: Add TypeScript database types**

Append these exports near the other database types in `lib/types/database.types.ts`:

```ts
export type NotificationEventStatus = 'pending' | 'sending' | 'sent' | 'failed'

export type NotificationEventType =
  | 'restock_alert'
  | 'weekly_sales_report'
  | 'monthly_sales_report'

export type NotificationEvent = {
  id: string
  event_type: NotificationEventType
  status: NotificationEventStatus
  idempotency_key: string
  payload: Record<string, unknown>
  error_message: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}
```

- [ ] **Step 4: Add the notification event migration**

Create `supabase/migrations/20260508_add_notification_events.sql`:

```sql
CREATE TABLE notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('restock_alert', 'weekly_sales_report', 'monthly_sales_report')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  idempotency_key TEXT NOT NULL UNIQUE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notification_events_status_created_at
  ON notification_events(status, created_at);

CREATE TRIGGER update_notification_events_updated_at
BEFORE UPDATE ON notification_events
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notification_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users to read notification_events"
ON notification_events FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "Allow service role full access to notification_events"
ON notification_events FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION get_restock_alert_routes(target_sku TEXT)
RETURNS TABLE (
  sku TEXT,
  shipping_mode TEXT,
  product_name TEXT,
  fallback_lead_min INTEGER,
  fallback_lead_max INTEGER,
  buffer_days INTEGER
)
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM (VALUES
    ('Cervi-001'::TEXT, 'sea'::TEXT, 'CerviCloud Pillow'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER),
    ('Lumi-001'::TEXT, 'air'::TEXT, 'LumiCloud Eye Mask'::TEXT, 7::INTEGER, 10::INTEGER, 7::INTEGER),
    ('Lumi-001'::TEXT, 'sea'::TEXT, 'LumiCloud Eye Mask'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER),
    ('Calmi-001'::TEXT, 'air'::TEXT, 'CalmiCloud Ear Plug'::TEXT, 7::INTEGER, 10::INTEGER, 7::INTEGER),
    ('Calmi-001'::TEXT, 'sea'::TEXT, 'CalmiCloud Ear Plug'::TEXT, 28::INTEGER, 42::INTEGER, 14::INTEGER)
  ) AS routes(sku, shipping_mode, product_name, fallback_lead_min, fallback_lead_max, buffer_days)
  WHERE routes.sku = target_sku;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_restock_route_threshold(
  target_sku TEXT,
  target_shipping_mode TEXT,
  fallback_lead_min INTEGER,
  fallback_lead_max INTEGER,
  buffer_days INTEGER
)
RETURNS TABLE (
  threshold_units INTEGER,
  lead_time_label TEXT,
  learned_lead_days INTEGER,
  is_fallback BOOLEAN
)
AS $$
DECLARE
  start_date DATE := DATE '2025-12-27';
  end_date DATE := CURRENT_DATE;
  unit_sales NUMERIC := 0;
  elapsed_days INTEGER;
  avg_daily NUMERIC := 0;
  avg_lead INTEGER;
BEGIN
  elapsed_days := GREATEST(1, end_date - start_date + 1);

  SELECT COALESCE(SUM(
    oli.quantity *
    CASE COALESCE(oli.pack_size, 'single')
      WHEN 'bundle_2' THEN 2
      WHEN 'bundle_3' THEN 3
      WHEN 'bundle_4' THEN 4
      ELSE 1
    END
  ), 0)
  INTO unit_sales
  FROM orders o
  JOIN order_line_items oli ON oli.order_id = o.id
  WHERE o.status IN ('paid', 'shipped')
    AND o.order_date >= start_date
    AND oli.sku = target_sku
    AND oli.selling_price > 0;

  avg_daily := unit_sales / elapsed_days;

  SELECT ROUND(AVG(lead_days))::INTEGER
  INTO avg_lead
  FROM (
    SELECT (b.arrival_date - b.order_date) AS lead_days
    FROM inventory_purchase_batches b
    JOIN inventory_purchase_batch_items i ON i.batch_id = b.id
    WHERE i.sku = target_sku
      AND b.shipping_mode = target_shipping_mode
      AND b.restock_status = 'arrived'
      AND b.arrival_date IS NOT NULL
      AND b.arrival_date >= b.order_date
    ORDER BY b.arrival_date DESC
    LIMIT 3
  ) latest;

  IF avg_lead IS NOT NULL THEN
    RETURN QUERY SELECT
      CEIL(avg_daily * (avg_lead + buffer_days))::INTEGER,
      FORMAT('Lead %sd + Buffer %sd = %sd', avg_lead, buffer_days, avg_lead + buffer_days),
      avg_lead,
      FALSE;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    CEIL(avg_daily * (fallback_lead_max + buffer_days))::INTEGER,
    FORMAT('Fallback %s-%sd + Buffer %sd', fallback_lead_min, fallback_lead_max, buffer_days),
    NULL::INTEGER,
    TRUE;
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION enqueue_restock_alert_events()
RETURNS TRIGGER
AS $$
DECLARE
  route_record RECORD;
  threshold_record RECORD;
  current_stock_value INTEGER;
  previous_stock_value INTEGER;
  event_key TEXT;
BEGIN
  FOR route_record IN
    SELECT * FROM get_restock_alert_routes(NEW.sku)
  LOOP
    SELECT current_stock
    INTO current_stock_value
    FROM stock_on_hand
    WHERE sku = NEW.sku;

    current_stock_value := COALESCE(current_stock_value, 0);
    previous_stock_value := current_stock_value - NEW.quantity;

    SELECT *
    INTO threshold_record
    FROM get_restock_route_threshold(
      route_record.sku,
      route_record.shipping_mode,
      route_record.fallback_lead_min,
      route_record.fallback_lead_max,
      route_record.buffer_days
    );

    IF threshold_record.threshold_units IS NULL OR threshold_record.threshold_units <= 0 THEN
      CONTINUE;
    END IF;

    IF previous_stock_value > threshold_record.threshold_units
      AND current_stock_value <= threshold_record.threshold_units
    THEN
      event_key := FORMAT(
        'restock_alert:%s:%s:%s:%s',
        route_record.sku,
        route_record.shipping_mode,
        threshold_record.threshold_units,
        NEW.id
      );

      INSERT INTO notification_events (
        event_type,
        idempotency_key,
        payload
      )
      VALUES (
        'restock_alert',
        event_key,
        jsonb_build_object(
          'sku', route_record.sku,
          'productName', route_record.product_name,
          'shippingMode', route_record.shipping_mode,
          'threshold', threshold_record.threshold_units,
          'previousStock', previous_stock_value,
          'currentStock', current_stock_value,
          'leadTimeLabel', threshold_record.lead_time_label,
          'learnedLeadDays', threshold_record.learned_lead_days,
          'isFallback', threshold_record.is_fallback,
          'ledgerEntryId', NEW.id,
          'entryDate', NEW.entry_date
        )
      )
      ON CONFLICT (idempotency_key) DO NOTHING;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enqueue_restock_alert_events_after_insert
AFTER INSERT ON inventory_ledger
FOR EACH ROW EXECUTE FUNCTION enqueue_restock_alert_events();
```

- [ ] **Step 5: Run the contract tests**

Run: `npm test -- lib/notifications/source-contracts.test.ts`

Expected: PASS.

- [ ] **Step 6: Apply the migration locally or to a Supabase branch**

Run locally if Supabase CLI is configured:

```bash
supabase db reset
```

Expected: migrations apply without SQL errors.

If local Supabase is not configured, use the Supabase MCP on a development branch before production:

```text
Apply supabase/migrations/20260508_add_notification_events.sql to a Supabase branch and verify the migration succeeds.
```

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20260508_add_notification_events.sql lib/types/database.types.ts lib/notifications/source-contracts.test.ts
git commit -m "feat: add notification event schema"
```

## Task 4: Add App Hook To Flush Pending Notification Events

**Files:**
- Create: `lib/notifications/trigger-sender.ts`
- Modify: `lib/actions/inventory.ts`
- Modify: `lib/actions/restock.ts`
- Modify: `.env.local`

- [ ] **Step 1: Add local environment keys**

Append these keys to `.env.local` if they do not exist:

```env
RESEND_API_KEY=
EMAIL_FROM="Sheepie Dashboard <alerts@yourdomain.com>"
NOTIFICATION_FUNCTION_SECRET=
```

- [ ] **Step 2: Add the server-side Edge Function invoker**

Create `lib/notifications/trigger-sender.ts`:

```ts
export async function triggerNotificationSender() {
  const functionSecret = process.env.NOTIFICATION_FUNCTION_SECRET
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!functionSecret || !supabaseUrl) {
    return { success: false, skipped: true, error: "Notification sender env is not configured" }
  }

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-notification-events`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-notification-secret": functionSecret,
      },
      body: JSON.stringify({ source: "dashboard" }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { success: false, skipped: false, error: text || response.statusText }
    }

    return { success: true, skipped: false }
  } catch (error) {
    return {
      success: false,
      skipped: false,
      error: error instanceof Error ? error.message : "Unknown notification sender error",
    }
  }
}
```

- [ ] **Step 3: Invoke the sender after manual/app ledger inserts**

Modify `lib/actions/inventory.ts`:

```ts
import { triggerNotificationSender } from "@/lib/notifications/trigger-sender"
```

After the successful `inventory_ledger` insert and path revalidation in `createLedgerEntry`, add:

```ts
  triggerNotificationSender().catch((notificationError) => {
    console.error("Error triggering notification sender:", notificationError)
  })
```

Keep the return value of `createLedgerEntry` unchanged so email delivery failures do not break order entry.

- [ ] **Step 4: Invoke the sender after restock arrival RPCs**

Modify `lib/actions/restock.ts`:

```ts
import { triggerNotificationSender } from "@/lib/notifications/trigger-sender"
```

After `revalidateRestockArrivalPaths()` in `markRestockArrived`, add:

```ts
  triggerNotificationSender().catch((notificationError) => {
    console.error("Error triggering notification sender after restock arrival:", notificationError)
  })
```

- [ ] **Step 5: Run source contract and typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit tracked code changes**

```bash
git add lib/notifications/trigger-sender.ts lib/actions/inventory.ts lib/actions/restock.ts
git commit -m "feat: trigger notification sender after stock changes"
```

## Task 5: Add Shared Edge Function Utilities

**Files:**
- Create: `supabase/functions/_shared/auth.ts`
- Create: `supabase/functions/_shared/resend.ts`
- Create: `supabase/functions/_shared/email-html.ts`
- Create: `supabase/functions/_shared/report-periods.ts`
- Test: `lib/notifications/source-contracts.test.ts`

- [ ] **Step 1: Extend source contracts for Edge Function structure**

Append these tests to `lib/notifications/source-contracts.test.ts`:

```ts
describe("notification edge function source contracts", () => {
  it("defines shared edge helpers and function entrypoints", async () => {
    const authSource = await readFile("supabase/functions/_shared/auth.ts", "utf8")
    const resendSource = await readFile("supabase/functions/_shared/resend.ts", "utf8")
    const notificationSource = await readFile("supabase/functions/send-notification-events/index.ts", "utf8").catch(() => "")
    const reportSource = await readFile("supabase/functions/send-sales-report/index.ts", "utf8").catch(() => "")

    expect(authSource).toContain("assertAuthorizedRequest")
    expect(resendSource).toContain("sendEmail")
    expect(notificationSource).toContain("notification_events")
    expect(reportSource).toContain("weekly_sales_report")
    expect(reportSource).toContain("monthly_sales_report")
  })
})
```

- [ ] **Step 2: Run the failing source contract test**

Run: `npm test -- lib/notifications/source-contracts.test.ts`

Expected: FAIL because `supabase/functions/_shared` files and entrypoints do not exist.

- [ ] **Step 3: Create the auth helper**

Create `supabase/functions/_shared/auth.ts`:

```ts
export function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
    },
  })
}

export function assertAuthorizedRequest(req: Request) {
  const expectedSecret = Deno.env.get("NOTIFICATION_FUNCTION_SECRET")

  if (!expectedSecret) {
    return jsonResponse({ error: "NOTIFICATION_FUNCTION_SECRET is not configured" }, 500)
  }

  const actualSecret = req.headers.get("x-notification-secret")

  if (actualSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401)
  }

  return null
}
```

- [ ] **Step 4: Create the Resend helper**

Create `supabase/functions/_shared/resend.ts`:

```ts
type SendEmailInput = {
  to: string[]
  subject: string
  html: string
}

export async function sendEmail(input: SendEmailInput) {
  const apiKey = Deno.env.get("RESEND_API_KEY")
  const from = Deno.env.get("EMAIL_FROM")

  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not configured")
  }

  if (!from) {
    throw new Error("EMAIL_FROM is not configured")
  }

  if (input.to.length === 0) {
    throw new Error("No recipients found")
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: input.to,
      subject: input.subject,
      html: input.html,
    }),
  })

  const bodyText = await response.text()

  if (!response.ok) {
    throw new Error(bodyText || `Resend failed with ${response.status}`)
  }

  return bodyText ? JSON.parse(bodyText) : {}
}
```

- [ ] **Step 5: Copy the HTML and period helpers into Deno-compatible shared files**

Create `supabase/functions/_shared/email-html.ts` by copying the implementation from `lib/notifications/email-html.ts` and replacing the exported function declarations with Deno-compatible TypeScript exports unchanged.

Create `supabase/functions/_shared/report-periods.ts` by copying the implementation from `lib/notifications/periods.ts` and keeping the exported function names unchanged.

- [ ] **Step 6: Add minimal entrypoints so source contracts can pass before the full sender bodies are added**

Create `supabase/functions/send-notification-events/index.ts`:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const { count, error } = await supabase
    .from("notification_events")
    .select("*", { count: "exact", head: true })

  if (error) {
    return jsonResponse({ error: error.message }, 500)
  }

  return jsonResponse({ pending: count ?? 0 })
})
```

Create `supabase/functions/send-sales-report/index.ts`:

```ts
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  return jsonResponse({
    supportedReports: ["weekly_sales_report", "monthly_sales_report"],
  })
})
```

- [ ] **Step 7: Run source contracts**

Run: `npm test -- lib/notifications/source-contracts.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add lib/notifications/source-contracts.test.ts supabase/functions
git commit -m "feat: add notification edge function helpers"
```

## Task 6: Implement Pending Restock Email Sender

**Files:**
- Modify: `supabase/functions/send-notification-events/index.ts`
- Modify: `supabase/functions/_shared/email-html.ts`

- [ ] **Step 1: Replace the minimal sender with event processing**

Replace `supabase/functions/send-notification-events/index.ts` with:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"
import { renderRestockAlertEmailHtml } from "../_shared/email-html.ts"
import { sendEmail } from "../_shared/resend.ts"

type NotificationEvent = {
  id: string
  payload: {
    sku: string
    productName: string
    shippingMode: "air" | "sea"
    threshold: number
    previousStock: number
    currentStock: number
    leadTimeLabel: string
  }
}

function uniqueEmails(users: Array<{ email?: string | null }>) {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  const { data: events, error: eventsError } = await supabase
    .from("notification_events")
    .select("id, payload")
    .eq("event_type", "restock_alert")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true })
    .limit(20)

  if (eventsError) {
    return jsonResponse({ error: eventsError.message }, 500)
  }

  if (!events || events.length === 0) {
    return jsonResponse({ sent: 0 })
  }

  const eventIds = events.map((event) => event.id)
  await supabase
    .from("notification_events")
    .update({ status: "sending", error_message: null })
    .in("id", eventIds)

  try {
    const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (usersError) {
      throw new Error(usersError.message)
    }

    const recipients = uniqueEmails(userPage.users)
    const html = renderRestockAlertEmailHtml({
      title: "Restock reorder alert",
      events: (events as NotificationEvent[]).map((event) => event.payload),
    })

    await sendEmail({
      to: recipients,
      subject: `Restock reorder alert: ${events.length} route${events.length === 1 ? "" : "s"}`,
      html,
    })

    await supabase
      .from("notification_events")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .in("id", eventIds)

    return jsonResponse({ sent: eventIds.length })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown email send failure"
    await supabase
      .from("notification_events")
      .update({
        status: "failed",
        error_message: message,
      })
      .in("id", eventIds)

    return jsonResponse({ error: message }, 500)
  }
})
```

- [ ] **Step 2: Run typecheck and source contracts**

Run: `npm run typecheck && npm test -- lib/notifications/source-contracts.test.ts`

Expected: PASS.

- [ ] **Step 3: Deploy the sender function with custom auth**

Deploy through Supabase CLI or MCP with JWT verification disabled only because `assertAuthorizedRequest` enforces `NOTIFICATION_FUNCTION_SECRET`:

```bash
supabase functions deploy send-notification-events --no-verify-jwt
```

Expected: function deploys successfully.

- [ ] **Step 4: Add production function secrets**

Set these Supabase Edge Function secrets:

```bash
supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"
supabase secrets set EMAIL_FROM="Sheepie Dashboard <alerts@yourdomain.com>"
supabase secrets set NOTIFICATION_FUNCTION_SECRET="a-long-random-secret"
```

Expected: secrets are accepted. Use the same `NOTIFICATION_FUNCTION_SECRET` value in `.env.local` and production app env.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/send-notification-events/index.ts supabase/functions/_shared/email-html.ts
git commit -m "feat: send pending restock alert emails"
```

## Task 7: Implement Weekly And Monthly Sales Report Sender

**Files:**
- Modify: `supabase/functions/send-sales-report/index.ts`
- Modify: `supabase/functions/_shared/report-periods.ts`

- [ ] **Step 1: Replace the minimal report entrypoint with report generation**

Replace `supabase/functions/send-sales-report/index.ts` with:

```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.2"
import { assertAuthorizedRequest, jsonResponse } from "../_shared/auth.ts"
import { renderSalesReportEmailHtml } from "../_shared/email-html.ts"
import {
  getCompletedMonthlyReportPeriod,
  getCompletedWeeklyReportPeriod,
} from "../_shared/report-periods.ts"
import { sendEmail } from "../_shared/resend.ts"

type ReportKind = "weekly" | "monthly"

type OrderRow = {
  id: string
  channel: string
  order_date: string
  status: string
  channel_fees: number | null
  order_line_items: Array<{
    sku: string
    quantity: number
    pack_size: "single" | "bundle_2" | "bundle_3" | "bundle_4" | null
    selling_price: number
    cost_per_unit_snapshot: number | null
  }>
}

type ProductRow = {
  sku: string
  name: string
  cost_per_unit: number
}

function getPackMultiplier(packSize: string | null) {
  if (packSize === "bundle_2") return 2
  if (packSize === "bundle_3") return 3
  if (packSize === "bundle_4") return 4
  return 1
}

function uniqueEmails(users: Array<{ email?: string | null }>) {
  return Array.from(new Set(users.map((user) => user.email).filter((email): email is string => Boolean(email))))
}

async function createReportEventIfMissing(supabase: ReturnType<typeof createClient>, kind: ReportKind, periodStart: string, periodEnd: string) {
  const eventType = kind === "weekly" ? "weekly_sales_report" : "monthly_sales_report"
  const idempotencyKey = `${eventType}:${periodStart}:${periodEnd}`

  const { data, error } = await supabase
    .from("notification_events")
    .insert({
      event_type: eventType,
      idempotency_key: idempotencyKey,
      payload: { periodStart, periodEnd },
    })
    .select("id")
    .single()

  if (!error) return data.id as string
  if (error.code !== "23505") throw new Error(error.message)

  const { data: existing, error: existingError } = await supabase
    .from("notification_events")
    .select("id")
    .eq("idempotency_key", idempotencyKey)
    .single()

  if (existingError) throw new Error(existingError.message)
  return existing.id as string
}

async function buildReport(supabase: ReturnType<typeof createClient>, periodStart: string, periodEnd: string) {
  const [ordersResult, productsResult, lowStockResult] = await Promise.all([
    supabase
      .from("orders")
      .select(`
        id,
        channel,
        order_date,
        status,
        channel_fees,
        order_line_items (
          sku,
          quantity,
          pack_size,
          selling_price,
          cost_per_unit_snapshot
        )
      `)
      .in("status", ["paid", "shipped", "returned"])
      .gte("order_date", `${periodStart}T00:00:00.000+07:00`)
      .lte("order_date", `${periodEnd}T23:59:59.999+07:00`),
    supabase.from("products").select("sku, name, cost_per_unit"),
    supabase
      .from("notification_events")
      .select("payload")
      .eq("event_type", "restock_alert")
      .in("status", ["pending", "sending", "sent", "failed"])
      .order("created_at", { ascending: false })
      .limit(20),
  ])

  if (ordersResult.error) throw new Error(ordersResult.error.message)
  if (productsResult.error) throw new Error(productsResult.error.message)
  if (lowStockResult.error) throw new Error(lowStockResult.error.message)

  const products = new Map((productsResult.data as ProductRow[]).map((product) => [product.sku, product]))
  const bySku = new Map<string, { sku: string; name: string; unitsSold: number; revenue: number; profit: number }>()
  const byChannel = new Map<string, { channel: string; orders: number; revenue: number; profit: number }>()
  let orders = 0
  let unitsSold = 0
  let revenue = 0
  let cost = 0
  let profit = 0
  let returnedUnits = 0

  for (const order of ordersResult.data as OrderRow[]) {
    const lineItems = order.order_line_items || []
    const totalOrderValue = lineItems.reduce((sum, item) => sum + item.selling_price * item.quantity, 0)

    if (order.status === "returned") {
      for (const item of lineItems) {
        returnedUnits += item.quantity * getPackMultiplier(item.pack_size)
      }
      continue
    }

    orders += 1
    let orderRevenue = 0
    let orderCost = 0

    for (const item of lineItems) {
      const unitCount = item.quantity * getPackMultiplier(item.pack_size)
      const itemTotal = item.selling_price * item.quantity
      const allocatedFee = totalOrderValue > 0 && order.channel_fees
        ? (order.channel_fees * itemTotal) / totalOrderValue
        : 0
      const itemRevenue = itemTotal - allocatedFee
      const product = products.get(item.sku)
      const unitCost = item.cost_per_unit_snapshot ?? product?.cost_per_unit ?? 0
      const itemCost = unitCost * unitCount
      const itemProfit = itemRevenue - itemCost
      const existingSku = bySku.get(item.sku) || {
        sku: item.sku,
        name: product?.name || item.sku,
        unitsSold: 0,
        revenue: 0,
        profit: 0,
      }

      bySku.set(item.sku, {
        ...existingSku,
        unitsSold: existingSku.unitsSold + unitCount,
        revenue: existingSku.revenue + itemRevenue,
        profit: existingSku.profit + itemProfit,
      })

      unitsSold += unitCount
      orderRevenue += itemRevenue
      orderCost += itemCost
    }

    const orderProfit = orderRevenue - orderCost
    const existingChannel = byChannel.get(order.channel) || {
      channel: order.channel,
      orders: 0,
      revenue: 0,
      profit: 0,
    }
    byChannel.set(order.channel, {
      channel: order.channel,
      orders: existingChannel.orders + 1,
      revenue: existingChannel.revenue + orderRevenue,
      profit: existingChannel.profit + orderProfit,
    })

    revenue += orderRevenue
    cost += orderCost
    profit += orderProfit
  }

  const lowStock = (lowStockResult.data || []).map((row: { payload: Record<string, unknown> }) => ({
    sku: String(row.payload.sku),
    productName: String(row.payload.productName),
    shippingMode: row.payload.shippingMode as "air" | "sea",
    threshold: Number(row.payload.threshold),
    currentStock: Number(row.payload.currentStock),
  }))

  return {
    totals: { orders, unitsSold, revenue, cost, profit, returnedUnits },
    bySku: Array.from(bySku.values()).sort((a, b) => b.revenue - a.revenue),
    byChannel: Array.from(byChannel.values()).sort((a, b) => b.revenue - a.revenue),
    lowStock,
  }
}

Deno.serve(async (req) => {
  const authError = assertAuthorizedRequest(req)
  if (authError) return authError

  const body = await req.json().catch(() => ({}))
  const kind = body.kind === "monthly" ? "monthly" : "weekly"
  const period = kind === "monthly"
    ? getCompletedMonthlyReportPeriod()
    : getCompletedWeeklyReportPeriod()
  const supabaseUrl = Deno.env.get("SUPABASE_URL")
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase service env is not configured" }, 500)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)
  const eventId = await createReportEventIfMissing(supabase, kind, period.periodStart, period.periodEnd)

  const { data: existingEvent, error: eventError } = await supabase
    .from("notification_events")
    .select("status")
    .eq("id", eventId)
    .single()

  if (eventError) return jsonResponse({ error: eventError.message }, 500)
  if (existingEvent.status === "sent") return jsonResponse({ sent: 0, skipped: "already sent" })

  await supabase.from("notification_events").update({ status: "sending", error_message: null }).eq("id", eventId)

  try {
    const { data: userPage, error: usersError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) throw new Error(usersError.message)

    const report = await buildReport(supabase, period.periodStart, period.periodEnd)
    const recipients = uniqueEmails(userPage.users)
    const title = kind === "monthly" ? "Monthly sales report" : "Weekly sales report"
    const html = renderSalesReportEmailHtml({
      title,
      periodLabel: period.label,
      ...report,
    })

    await sendEmail({
      to: recipients,
      subject: `${title}: ${period.label}`,
      html,
    })

    await supabase.from("notification_events").update({
      status: "sent",
      sent_at: new Date().toISOString(),
      error_message: null,
      payload: { periodStart: period.periodStart, periodEnd: period.periodEnd, label: period.label },
    }).eq("id", eventId)

    return jsonResponse({ sent: 1, report: kind, period })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown report email failure"
    await supabase.from("notification_events").update({
      status: "failed",
      error_message: message,
    }).eq("id", eventId)

    return jsonResponse({ error: message }, 500)
  }
})
```

- [ ] **Step 2: Deploy the report function with custom auth**

Run:

```bash
supabase functions deploy send-sales-report --no-verify-jwt
```

Expected: function deploys successfully.

- [ ] **Step 3: Smoke test report calls without sending real email by using a Resend test key or development recipient**

Run after secrets are configured:

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/send-sales-report" \
  -H "content-type: application/json" \
  -H "x-notification-secret: $NOTIFICATION_FUNCTION_SECRET" \
  -d '{"kind":"weekly"}'
```

Expected: JSON response includes `"sent":1` or `"skipped":"already sent"`.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/send-sales-report/index.ts supabase/functions/_shared/report-periods.ts
git commit -m "feat: send scheduled sales report emails"
```

## Task 8: Schedule Report And Sender Backups

**Files:**
- Modify: `supabase/migrations/20260508_add_notification_events.sql`

- [ ] **Step 1: Add pg_cron and pg_net scheduling to the migration**

Append this SQL to `supabase/migrations/20260508_add_notification_events.sql` if the Supabase project supports `pg_cron`, `pg_net`, and Vault secrets:

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Store these secrets through Supabase Vault before enabling the jobs:
-- notification_function_secret
-- project_url

SELECT cron.schedule(
  'send-notification-events-every-5-minutes',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-notification-events',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('source', 'cron')
  );
  $$
);

SELECT cron.schedule(
  'send-weekly-sales-report',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-sales-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('kind', 'weekly')
  );
  $$
);

SELECT cron.schedule(
  'send-monthly-sales-report',
  '0 8 1 * *',
  $$
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'project_url') || '/functions/v1/send-sales-report',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-notification-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'notification_function_secret')
    ),
    body := jsonb_build_object('kind', 'monthly')
  );
  $$
);
```

- [ ] **Step 2: Verify the schedule against the product requirement**

The scheduled weekly job runs at 08:00 Jakarta time every Monday and reports the completed previous Monday-Sunday week. The scheduled monthly job runs at 08:00 Jakarta time on the first day of each month and reports the completed previous calendar month.

- [ ] **Step 3: Apply schedule migration to a branch before production**

Run:

```bash
supabase db push
```

Expected: scheduling SQL succeeds on the target Supabase environment.

If Vault is unavailable in the target project, create these schedules in the Supabase Dashboard instead and keep the migration limited to schema/trigger changes.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260508_add_notification_events.sql
git commit -m "feat: schedule notification email jobs"
```

## Task 9: End-To-End Verification

**Files:**
- No new files unless a verification note is added.

- [ ] **Step 1: Run the full local verification suite**

Run:

```bash
npm test
npm run typecheck
npm run lint
```

Expected: all commands pass.

- [ ] **Step 2: Verify event enqueueing on a Supabase branch**

On a branch or local DB, insert a stock-reducing ledger entry that crosses a monitored threshold:

```sql
INSERT INTO inventory_ledger (
  sku,
  movement_type,
  quantity,
  reference,
  entry_date
) VALUES (
  'Lumi-001',
  'ADJUSTMENT',
  -1,
  'Notification test crossing',
  CURRENT_DATE
);

SELECT event_type, status, payload
FROM notification_events
WHERE event_type = 'restock_alert'
ORDER BY created_at DESC
LIMIT 5;
```

Expected: one `restock_alert` event exists only if the insert crossed a calculated threshold. Repeated inserts while already below threshold do not create additional crossing events unless stock first rises above the threshold.

- [ ] **Step 3: Verify Resend delivery**

Call the deployed sender:

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/send-notification-events" \
  -H "content-type: application/json" \
  -H "x-notification-secret: $NOTIFICATION_FUNCTION_SECRET" \
  -d '{"source":"manual-smoke-test"}'
```

Expected: JSON response includes `"sent"` and the event status changes to `sent`.

- [ ] **Step 4: Verify weekly and monthly reports**

Call both report modes:

```bash
curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/send-sales-report" \
  -H "content-type: application/json" \
  -H "x-notification-secret: $NOTIFICATION_FUNCTION_SECRET" \
  -d '{"kind":"weekly"}'

curl -X POST "$NEXT_PUBLIC_SUPABASE_URL/functions/v1/send-sales-report" \
  -H "content-type: application/json" \
  -H "x-notification-secret: $NOTIFICATION_FUNCTION_SECRET" \
  -d '{"kind":"monthly"}'
```

Expected: every Supabase Auth user receives readable HTML email, and repeated calls for the same period return already-sent behavior instead of duplicate emails.

- [ ] **Step 5: Final commit if verification required small fixes**

```bash
git status --short
git add lib/notifications supabase/functions supabase/migrations/20260508_add_notification_events.sql lib/actions lib/types/database.types.ts
git commit -m "fix: stabilize notification email verification"
```

Skip this commit if the worktree is clean.

## Self-Review Notes

- Spec coverage:
  - Restock alert SKU/mode scope: Task 1 and Task 3.
  - Real restock data lead times with fallback: Task 3 SQL threshold function and Task 1 conservative threshold helper.
  - Immediate alerts from ledger inserts: Task 3 trigger and Task 4 sender invocation.
  - Resend delivery to all Supabase Auth users: Task 6 and Task 7.
  - Weekly/monthly HTML reports: Task 2 and Task 7.
  - Retry/idempotency: Task 3 unique keys and status fields, Task 6/7 sender state transitions.
- Placeholder scan:
  - The plan intentionally includes concrete code, commands, expected results, env names, and file paths.
- Type consistency:
  - `NotificationEventType`, `NotificationEventStatus`, and event payload names match across tests, migration, and Edge Functions.
