import { readFile } from "node:fs/promises"
import { DataType, newDb } from "pg-mem"
import { describe, expect, expectTypeOf, it } from "vitest"

import type {
  Channel,
  MonthlyAdSpend,
  SkuAdSetup,
  SkuAdSetupStatus,
  SkuSalesTarget,
} from "../types/database.types"

function buildExecutableMigrationSql(source: string): string {
  return source
    .replace(/^CREATE EXTENSION IF NOT EXISTS btree_gist;\n\n/im, "")
    .replace(/^ALTER TABLE sku_ad_setups\s+ADD CONSTRAINT sku_ad_setups_no_overlap[\s\S]*?\);\n\n/im, "")
    .replace(/^ALTER TABLE sku_ad_setups\s+ADD CONSTRAINT sku_ad_setups_no_scope_overlap[\s\S]*?\);\n\n/im, "")
    .replace(/^ALTER TABLE sku_ad_setups\s+ADD CONSTRAINT sku_ad_setups_channels_check[\s\S]*?\);\n\n/im, "")
    .replace(/^ALTER TABLE sku_sales_targets\s+ADD CONSTRAINT sku_sales_targets_no_overlap[\s\S]*?\);\n\n/im, "")
    .replace(/^ALTER TABLE monthly_ad_spend\s+ADD CONSTRAINT monthly_ad_spend_channels_check[\s\S]*?\);\n\n/im, "")
    .replace(/^DROP TRIGGER IF EXISTS[\s\S]*?EXECUTE FUNCTION update_updated_at\(\);\n\n/gim, "")
    .replace(/^ALTER TABLE .+ ENABLE ROW LEVEL SECURITY;\n/gim, "")
    .replace(/^DROP POLICY IF EXISTS[\s\S]*?WITH CHECK \(true\);\n\n/gim, "")
    .replace(/^COMMENT ON .+;\n/gim, "")
}

async function loadAdsMigrationSource(): Promise<string> {
  const [baseMigration, multiChannelMigration] = await Promise.all([
    readFile("supabase/migrations/20260401_add_sku_ads_reporting.sql", "utf8"),
    readFile("supabase/migrations/20260402_enable_multi_channel_ads_scope.sql", "utf8"),
  ])

  return `${baseMigration}\n\n${multiChannelMigration}`
}

describe("sku ads schema contracts", () => {
  it("defines the new ads reporting entities", async () => {
    const setup = {} as SkuAdSetup
    const spend = {} as MonthlyAdSpend
    const target = {} as SkuSalesTarget
    const source = await readFile("lib/types/database.types.ts", "utf8")

    expectTypeOf(setup.sku).toEqualTypeOf<string>()
    expectTypeOf(setup.channels).toEqualTypeOf<Channel[] | undefined>()
    expectTypeOf(setup.status).toEqualTypeOf<SkuAdSetupStatus>()
    expectTypeOf(spend.month).toEqualTypeOf<string>()
    expectTypeOf(spend.finance_entry_id).toEqualTypeOf<string | null>()
    expectTypeOf(target.daily_target_units).toEqualTypeOf<number>()
    expectTypeOf(target.effective_to).toEqualTypeOf<string | null>()
    expect(source).toMatch(
      /export type SkuAdSetupStatus = 'active' \| 'paused' \| 'ended'/,
    )
    expect(source).toMatch(
      /export type SkuAdSetup = \{[\s\S]*channels\?: Channel\[\][\s\S]*channel_scope_key\?: string[\s\S]*daily_budget_cap: number[\s\S]*end_date: string \| null[\s\S]*status: SkuAdSetupStatus[\s\S]*updated_at: string[\s\S]*\}/,
    )
    expect(source).toMatch(
      /export type MonthlyAdSpend = \{[\s\S]*month: string[\s\S]*channels\?: Channel\[\][\s\S]*channel_scope_key\?: string[\s\S]*actual_spend: number[\s\S]*finance_entry_id: string \| null[\s\S]*updated_at: string[\s\S]*\}/,
    )
    expect(source).toMatch(
      /export type SkuSalesTarget = \{[\s\S]*daily_target_units: number[\s\S]*effective_from: string[\s\S]*effective_to: string \| null[\s\S]*updated_at: string[\s\S]*\}/,
    )
  })
})

describe("sku ads migration contract", () => {
  it("creates versioned tables without IF NOT EXISTS so drift fails loudly", async () => {
    const source = await loadAdsMigrationSource()

    expect(source).toMatch(/create extension if not exists btree_gist;/i)
    expect(source).toMatch(/create table sku_ad_setups \(/i)
    expect(source).toMatch(/create table monthly_ad_spend \(/i)
    expect(source).toMatch(/create table sku_sales_targets \(/i)
    expect(source).not.toMatch(/create table if not exists sku_ad_setups/i)
    expect(source).not.toMatch(/create table if not exists monthly_ad_spend/i)
    expect(source).not.toMatch(/create table if not exists sku_sales_targets/i)
  })

  it("protects setup and target date windows with exclusion constraints", async () => {
    const source = await loadAdsMigrationSource()

    expect(source).toMatch(
      /alter table sku_ad_setups[\s\S]*add constraint sku_ad_setups_no_overlap[\s\S]*exclude using gist[\s\S]*sku with =[\s\S]*channel_scope_key with =[\s\S]*daterange\(start_date, coalesce\(end_date \+ 1, 'infinity'::date\), '\[\)'\) with &&/i,
    )
    expect(source).toMatch(
      /alter table sku_sales_targets[\s\S]*add constraint sku_sales_targets_no_overlap[\s\S]*exclude using gist[\s\S]*sku with =[\s\S]*daterange\(effective_from, coalesce\(effective_to \+ 1, 'infinity'::date\), '\[\)'\) with &&/i,
    )
  })

  it("keeps the month spend and access safeguards", async () => {
    const source = await loadAdsMigrationSource()

    expect(source).toMatch(
      /daily_budget_cap numeric\(12,\s*2\) not null check \(daily_budget_cap >= 0\)/i,
    )
    expect(source).toMatch(
      /finance_entry_id uuid references finance_entries\(id\) on delete set null/i,
    )
    expect(source).toMatch(
      /daily_target_units integer not null check \(daily_target_units >= 0\)/i,
    )
    expect(source).toMatch(/unique\s*\(sku,\s*channel_scope_key,\s*start_date\)/i)
    expect(source).toMatch(/unique\s*\(month,\s*sku,\s*channel_scope_key\)/i)
    expect(source).toMatch(
      /check \(month = date_trunc\('month', month::timestamp\)::date\)/i,
    )
    expect(source).toMatch(/alter table sku_ad_setups enable row level security;/i)
    expect(source).toMatch(/alter table monthly_ad_spend enable row level security;/i)
    expect(source).toMatch(/alter table sku_sales_targets enable row level security;/i)
    expect(source).toMatch(
      /create policy "Allow authenticated users full access to sku_ad_setups"/i,
    )
    expect(source).toMatch(
      /create policy "Allow authenticated users full access to monthly_ad_spend"/i,
    )
    expect(source).toMatch(
      /create policy "Allow authenticated users full access to sku_sales_targets"/i,
    )
  })

  it("executes the core DDL in pg-mem and enforces the critical table constraints", async () => {
    const migrationSource = await loadAdsMigrationSource()
    const db = newDb()

    db.public.registerFunction({
      name: "gen_random_uuid",
      returns: DataType.uuid,
      implementation: () => "00000000-0000-0000-0000-0000000000ff",
    })
    db.public.registerFunction({
      name: "date_trunc",
      args: [DataType.text, DataType.timestamp],
      returns: DataType.timestamp,
      implementation: (unit: string, value: Date) => {
        if (unit !== "month") {
          throw new Error(`Unsupported date_trunc unit in test: ${unit}`)
        }

        return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1))
      },
    })
    db.public.none(`
      create table products (
        id uuid primary key,
        sku text unique not null
      );

      create table finance_entries (
        id uuid primary key
      );
    `)

    db.public.none(buildExecutableMigrationSql(migrationSource))

    db.public.none(`
      insert into products (id, sku) values
        ('00000000-0000-0000-0000-000000000001', 'LUMI'),
        ('00000000-0000-0000-0000-000000000002', 'CALMI');

      insert into finance_entries (id) values
        ('00000000-0000-0000-0000-000000000101');
    `)

    expect(
      db.public.many(`
        select column_name
        from information_schema.columns
        where table_name = 'sku_ad_setups'
        order by ordinal_position;
      `).map((row) => row.column_name),
    ).toContain("channels")

    expect(
      db.public.many(`
        select column_name
        from information_schema.columns
        where table_name = 'sku_ad_setups'
        order by ordinal_position;
      `).map((row) => row.column_name),
    ).toContain("channel_scope_key")

    expect(
      db.public.many(`
        select column_name
        from information_schema.columns
        where table_name = 'monthly_ad_spend'
        order by ordinal_position;
      `).map((row) => row.column_name),
    ).toContain("channels")

    expect(
      db.public.many(`
        select column_name
        from information_schema.columns
        where table_name = 'monthly_ad_spend'
        order by ordinal_position;
      `).map((row) => row.column_name),
    ).toContain("channel_scope_key")

    db.public.none(`
      insert into sku_sales_targets (
        id,
        sku,
        daily_target_units,
        effective_from,
        effective_to
      ) values (
        '00000000-0000-0000-0000-000000000031',
        'CALMI',
        12,
        '2026-04-01',
        '2026-04-30'
      );
    `)

    expect(() =>
      db.public.none(`
        insert into sku_sales_targets (
          id,
          sku,
          daily_target_units,
          effective_from,
          effective_to
        ) values (
          '00000000-0000-0000-0000-000000000032',
          'CALMI',
          -1,
          '2026-05-01',
          '2026-05-31'
        );
      `),
    ).toThrow()

    const tables = db.public.many(`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('sku_ad_setups', 'monthly_ad_spend', 'sku_sales_targets')
      order by table_name
    `)

    expect(tables.map((row) => row.table_name)).toEqual([
      "monthly_ad_spend",
      "sku_ad_setups",
      "sku_sales_targets",
    ])
  })
})
