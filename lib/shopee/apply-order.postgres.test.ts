import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"

const databaseUrl = process.env.TEST_ORDER_DATABASE_URL
const userId = randomUUID()
const migrations = [
  "20260103_initial_schema.sql",
  "20260316_add_changelog.sql",
  "20261003050501_order_return_disposition.sql",
  "20261105000100_add_shopee_sync.sql"
].map((name) => new URL(`../../supabase/migrations/${name}`, import.meta.url))

type Line = {
  sku: string
  pack_size: string
  quantity: number
  selling_price: number
}

if (!databaseUrl) {
  describe.skip("apply_shopee_order PostgreSQL integration", () => {
    it("requires an isolated TEST_ORDER_DATABASE_URL", () => {})
  })
} else {
  describe("apply_shopee_order PostgreSQL integration", () => {
    // `db` stays superuser for fixtures and assertions; `svc` and `svc2` call
    // the RPC as service_role, the only role allowed to execute it.
    let db: Client, svc: Client, svc2: Client

    async function serviceClient() {
      const client = new Client({ connectionString: databaseUrl })
      await client.connect()
      await client.query("set role service_role")
      return client
    }

    beforeAll(async () => {
      db = new Client({ connectionString: databaseUrl })
      await db.connect()
      const existing = await db.query(
        "select to_regclass('public.orders') as orders"
      )
      if (existing.rows[0].orders)
        throw new Error(
          "Use an empty disposable database; this test refuses to touch existing orders."
        )
      await db.query(`
        CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN;
        CREATE ROLE service_role NOLOGIN;
        CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('role', true) $$;
        INSERT INTO auth.users VALUES ('${userId}');
      `)
      await db.query(await readFile(migrations[0], "utf8"))
      await db.query(`
        ALTER TABLE public.order_line_items ADD COLUMN pack_size text DEFAULT 'single';
        ALTER TABLE public.order_line_items ADD COLUMN cost_per_unit_snapshot numeric;
        GRANT USAGE ON SCHEMA public, auth TO authenticated, anon, service_role;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT SELECT ON auth.users TO authenticated;
      `)
      for (const file of migrations.slice(1))
        await db.query(await readFile(file, "utf8"))
      svc = await serviceClient()
      svc2 = await serviceClient()
    })
    afterAll(async () => {
      await Promise.all([db?.end(), svc?.end(), svc2?.end()])
    })

    // One single-item SKU and one bundle (A x2 + B x1), each with 100 in stock.
    async function fixture() {
      const id = randomUUID()
      const single = `SKU-${id}`,
        bundle = `BUNDLE-${id}`,
        a = `A-${id}`,
        b = `B-${id}`
      await db.query(
        "insert into products(sku,name,cost_per_unit,reorder_point,is_bundle) values($1,'Single',10,0,false),($2,'Bundle',25,0,true),($3,'Comp A',7,0,false),($4,'Comp B',4,0,false)",
        [single, bundle, a, b]
      )
      await db.query(
        "insert into bundle_compositions(bundle_sku,component_sku,quantity) values($1,$2,2),($1,$3,1)",
        [bundle, a, b]
      )
      for (const sku of [single, a, b])
        await db.query(
          "insert into inventory_ledger(sku,movement_type,quantity,reference) values($1,'IN_PURCHASE',100,'Test stock')",
          [sku]
        )
      const sn = `SN${id.replaceAll("-", "").slice(0, 12).toUpperCase()}`
      const lines: Line[] = [
        {
          sku: single,
          pack_size: "bundle_2",
          quantity: 2,
          selling_price: 218000
        },
        {
          sku: bundle,
          pack_size: "bundle_3",
          quantity: 1,
          selling_price: 500000
        }
      ]
      // single: 2 x 2 = 4; bundle: 1 x 3 = 3 bundles -> A 6, B 3.
      const deducted = { [single]: 4, [a]: 6, [b]: 3 }
      return { sn, single, bundle, a, b, lines, deducted }
    }

    function payload(
      f: Awaited<ReturnType<typeof fixture>>,
      status: string,
      updatedAt: string,
      externalStatus = status.toUpperCase()
    ) {
      return {
        order_sn: f.sn,
        status,
        external_status: externalStatus,
        order_date: "2026-11-03",
        external_created_at: "2026-11-03T20:15:00+07:00",
        external_updated_at: updatedAt,
        lines: f.lines
      }
    }

    async function apply(order: object, via = "push", client = svc) {
      return (
        await client.query(
          "select public.apply_shopee_order($1::jsonb, $2) as result",
          [JSON.stringify(order), via]
        )
      ).rows[0].result
    }
    async function stock(sku: string) {
      return Number(
        (
          await db.query(
            "select current_stock from stock_on_hand where sku=$1",
            [sku]
          )
        ).rows[0].current_stock
      )
    }
    async function ledger(sn: string) {
      return (
        await db.query(
          "select sku,movement_type,quantity,reference,created_by from inventory_ledger where starts_with(reference,$1) order by movement_type,sku",
          [`Order ${sn} - `]
        )
      ).rows
    }
    async function orders(sn: string) {
      return (await db.query("select * from orders where order_id=$1", [sn]))
        .rows
    }
    async function changelog(orderId: string) {
      return (
        await db.query(
          "select area,source,action_summary,entity_type,entity_id,entity_label,created_by from changelog_entries where entity_id=$1 order by logged_at, created_at",
          [orderId]
        )
      ).rows
    }

    it("creates paid order with OUT_SALE ledger", async () => {
      const f = await fixture()
      const result = await apply(
        payload(f, "paid", "2026-11-03T13:16:00Z", "READY_TO_SHIP")
      )
      expect(result).toMatchObject({ action: "created", ledger_entries: 3 })

      const [order] = await orders(f.sn)
      expect(order).toMatchObject({
        id: result.order_id,
        channel: "shopee",
        status: "paid",
        source: "shopee_api",
        external_status: "READY_TO_SHIP",
        synced_via: "push",
        return_disposition: null
      })
      expect(order.external_created_at.toISOString()).toBe(
        "2026-11-03T13:15:00.000Z"
      )
      expect(order.external_updated_at.toISOString()).toBe(
        "2026-11-03T13:16:00.000Z"
      )
      const { rows: dates } = await db.query(
        "select order_date::date::text as day, order_date = '2026-11-03T00:00:00Z'::timestamptz as utc_midnight from orders where id=$1",
        [order.id]
      )
      expect(dates[0]).toEqual({ day: "2026-11-03", utc_midnight: true })

      const { rows: items } = await db.query(
        "select sku,pack_size,quantity,selling_price::numeric::float8 as price,cost_per_unit_snapshot::float8 as cost from order_line_items where order_id=$1 order by sku",
        [order.id]
      )
      expect(items).toEqual([
        {
          sku: f.bundle,
          pack_size: "bundle_3",
          quantity: 1,
          price: 500000,
          cost: 25
        },
        {
          sku: f.single,
          pack_size: "bundle_2",
          quantity: 2,
          price: 218000,
          cost: 10
        }
      ])

      const rows = await ledger(f.sn)
      expect(
        rows.map(({ sku, movement_type, quantity }) => ({
          sku,
          movement_type,
          quantity
        }))
      ).toEqual(
        [f.a, f.b, f.single]
          .sort()
          .map((sku) => ({
            sku,
            movement_type: "OUT_SALE",
            quantity: -f.deducted[sku]
          }))
      )
      for (const row of rows) {
        expect(row.created_by).toBeNull()
        expect(
          row.reference.startsWith(`Order ${f.sn} - Paid (Shopee sync)`)
        ).toBe(true)
      }
      for (const sku of [f.single, f.a, f.b])
        expect(await stock(sku)).toBe(100 - f.deducted[sku])

      expect(await changelog(order.id)).toEqual([
        {
          area: "orders",
          source: "automatic",
          action_summary: "Synced from Shopee",
          entity_type: "order",
          entity_id: order.id,
          entity_label: `Order ${f.sn}`,
          created_by: null
        }
      ])
    })

    it("first sight as shipped still deducts stock", async () => {
      const f = await fixture()
      const result = await apply(
        payload(f, "shipped", "2026-11-03T14:00:00Z"),
        "poll"
      )
      expect(result).toMatchObject({ action: "created", ledger_entries: 3 })
      expect((await orders(f.sn))[0]).toMatchObject({
        status: "shipped",
        synced_via: "poll"
      })
      expect(
        (await ledger(f.sn)).every((r) => r.movement_type === "OUT_SALE")
      ).toBe(true)
      expect(await stock(f.single)).toBe(96)
    })

    it("first sight as cancelled is skipped", async () => {
      const f = await fixture()
      expect(
        await apply(payload(f, "cancelled", "2026-11-03T14:00:00Z"))
      ).toEqual({
        action: "skipped",
        order_id: null,
        ledger_entries: 0
      })
      expect(await orders(f.sn)).toHaveLength(0)
      expect(await ledger(f.sn)).toHaveLength(0)
      const { rows } = await db.query(
        "select count(*)::int as n from changelog_entries where entity_label=$1",
        [`Order ${f.sn}`]
      )
      expect(rows[0].n).toBe(0)
    })

    it("paid then shipped moves no stock", async () => {
      const f = await fixture()
      const created = await apply(payload(f, "paid", "2026-11-03T14:00:00Z"))
      const before = await ledger(f.sn)
      expect(
        await apply(payload(f, "shipped", "2026-11-04T02:00:00Z"), "poll")
      ).toEqual({
        action: "updated",
        order_id: created.order_id,
        ledger_entries: 0
      })
      expect(await ledger(f.sn)).toEqual(before)
      const [order] = await orders(f.sn)
      expect(order).toMatchObject({
        status: "shipped",
        external_status: "SHIPPED",
        synced_via: "push"
      })
      expect(order.external_updated_at.toISOString()).toBe(
        "2026-11-04T02:00:00.000Z"
      )
      expect(
        (await changelog(created.order_id)).map((r) => r.action_summary)
      ).toEqual(["Synced from Shopee", "Updated order status (Shopee sync)"])
    })

    it("paid then cancelled restores stock", async () => {
      const f = await fixture()
      const created = await apply(payload(f, "paid", "2026-11-03T14:00:00Z"))
      expect(
        await apply(payload(f, "cancelled", "2026-11-03T15:00:00Z"))
      ).toEqual({
        action: "updated",
        order_id: created.order_id,
        ledger_entries: 3
      })
      const returns = (await ledger(f.sn)).filter(
        (r) => r.movement_type === "RETURN"
      )
      expect(returns.map(({ sku, quantity }) => ({ sku, quantity }))).toEqual(
        [f.a, f.b, f.single]
          .sort()
          .map((sku) => ({ sku, quantity: f.deducted[sku] }))
      )
      for (const row of returns) {
        expect(row.created_by).toBeNull()
        expect(
          row.reference.startsWith(`Order ${f.sn} - Cancelled (Shopee sync)`)
        ).toBe(true)
      }
      for (const sku of [f.single, f.a, f.b]) expect(await stock(sku)).toBe(100)
      expect((await orders(f.sn))[0]).toMatchObject({
        status: "cancelled",
        return_disposition: "restock",
        external_status: "CANCELLED"
      })
    })

    it("cancelled then reactivated deducts stock again", async () => {
      const f = await fixture()
      await apply(payload(f, "paid", "2026-11-03T14:00:00Z"))
      await apply(payload(f, "cancelled", "2026-11-03T15:00:00Z"))
      expect(
        await apply(payload(f, "shipped", "2026-11-03T16:00:00Z"))
      ).toMatchObject({
        action: "updated",
        ledger_entries: 3
      })
      expect((await orders(f.sn))[0]).toMatchObject({
        status: "shipped",
        return_disposition: null
      })
      for (const sku of [f.single, f.a, f.b])
        expect(await stock(sku)).toBe(100 - f.deducted[sku])
    })

    it("stale update is unchanged", async () => {
      const f = await fixture()
      const created = await apply(payload(f, "shipped", "2026-11-03T15:00:00Z"))
      for (const at of ["2026-11-03T14:00:00Z", "2026-11-03T15:00:00Z"])
        expect(await apply(payload(f, "cancelled", at))).toEqual({
          action: "unchanged",
          order_id: created.order_id,
          ledger_entries: 0
        })
      const [order] = await orders(f.sn)
      expect(order).toMatchObject({
        status: "shipped",
        external_status: "SHIPPED"
      })
      expect(order.external_updated_at.toISOString()).toBe(
        "2026-11-03T15:00:00.000Z"
      )
      expect(await ledger(f.sn)).toHaveLength(3)
      expect(await changelog(created.order_id)).toHaveLength(1)
    })

    it("returned orders are never overwritten", async () => {
      const f = await fixture()
      const created = await apply(payload(f, "paid", "2026-11-03T14:00:00Z"))
      await db.query("set role authenticated")
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
        userId
      ])
      try {
        await db.query(
          "select public.update_order_status_with_inventory($1,'returned','paid','dead_stock')",
          [created.order_id]
        )
      } finally {
        await db.query("reset role")
      }
      const before = await ledger(f.sn)
      const changelogBefore = await changelog(created.order_id)
      expect(
        await apply(payload(f, "shipped", "2026-11-05T00:00:00Z"))
      ).toEqual({
        action: "updated",
        order_id: created.order_id,
        ledger_entries: 0
      })
      const [order] = await orders(f.sn)
      expect(order).toMatchObject({
        status: "returned",
        return_disposition: "dead_stock",
        external_status: "SHIPPED"
      })
      expect(order.external_updated_at.toISOString()).toBe(
        "2026-11-05T00:00:00.000Z"
      )
      expect(await ledger(f.sn)).toEqual(before)
      expect(await changelog(created.order_id)).toEqual(changelogBefore)
    })

    it("same payload twice is idempotent", async () => {
      const f = await fixture()
      const order = payload(f, "paid", "2026-11-03T14:00:00Z")
      const first = await apply(order)
      expect(await apply(order, "poll")).toEqual({
        action: "unchanged",
        order_id: first.order_id,
        ledger_entries: 0
      })
      expect(await orders(f.sn)).toHaveLength(1)
      expect((await orders(f.sn))[0].synced_via).toBe("push")
      expect(await ledger(f.sn)).toHaveLength(3)
      expect(await stock(f.single)).toBe(96)
    })

    it("concurrent applies create one order", async () => {
      const f = await fixture()
      const order = payload(f, "paid", "2026-11-03T14:00:00Z")
      // Hold the first apply's transaction open so the second genuinely runs
      // against an uncommitted insert, then commit once it is seen waiting.
      await svc.query("begin")
      let results: { action: string; order_id: string }[]
      try {
        const first = await apply(order, "push", svc)
        const secondPid = (await svc2.query("select pg_backend_pid() as pid"))
          .rows[0].pid
        const second = apply(order, "poll", svc2)
        for (let i = 0; ; i++) {
          const { rows } = await db.query(
            "select wait_event_type from pg_stat_activity where pid=$1",
            [secondPid]
          )
          if (rows[0]?.wait_event_type === "Lock") break
          if (i > 200)
            throw new Error("second apply never blocked on the first")
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        await svc.query("commit")
        results = [first, await second]
      } catch (error) {
        await svc.query("rollback")
        throw error
      }
      expect(results.map((r) => r.action).sort()).toEqual([
        "created",
        "unchanged"
      ])
      expect(results[0].order_id).toBe(results[1].order_id)
      expect(await orders(f.sn)).toHaveLength(1)
      const rows = await ledger(f.sn)
      expect(rows).toHaveLength(3)
      expect(rows.every((r) => r.movement_type === "OUT_SALE")).toBe(true)
      expect(await stock(f.single)).toBe(96)
    })

    it("concurrent applies via Promise.all create one order", async () => {
      const f = await fixture()
      const order = payload(f, "shipped", "2026-11-03T14:00:00Z")
      const results = await Promise.all([
        apply(order, "push", svc),
        apply(order, "poll", svc2)
      ])
      expect(results.map((r) => r.action).sort()).toEqual([
        "created",
        "unchanged"
      ])
      expect(await orders(f.sn)).toHaveLength(1)
      expect(
        (await ledger(f.sn)).filter((r) => r.movement_type === "OUT_SALE")
      ).toHaveLength(3)
    })

    it("authenticated cannot execute", async () => {
      const f = await fixture()
      for (const role of ["authenticated", "anon"]) {
        await db.query(`set role ${role}`)
        try {
          await expect(
            apply(payload(f, "paid", "2026-11-03T14:00:00Z"), "push", db)
          ).rejects.toThrow(/permission denied/)
        } finally {
          await db.query("reset role")
        }
      }
      expect(await orders(f.sn)).toHaveLength(0)
    })
  })
}
