import { readFile } from "node:fs/promises"
import { describe, expect, expectTypeOf, it } from "vitest"

import type {
  NotificationEvent,
  NotificationEventStatus,
  NotificationEventType,
} from "@/lib/types/database.types"

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
    expect(source).toMatch(/'Cervi-001'::TEXT, 'sea'::TEXT/i)
    expect(source).toMatch(/'Lumi-001'::TEXT, 'air'::TEXT/i)
    expect(source).toMatch(/'Lumi-001'::TEXT, 'sea'::TEXT/i)
    expect(source).toMatch(/'Calmi-001'::TEXT, 'air'::TEXT/i)
    expect(source).toMatch(/'Calmi-001'::TEXT, 'sea'::TEXT/i)
    expect(source).not.toMatch(/Cervi-002/i)
  })
})
