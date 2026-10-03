import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { Client } from "pg"

const databaseUrl = process.env.TEST_ORDER_DATABASE_URL
const userId = randomUUID()
const migration = new URL(
  "../../supabase/migrations/20261003050501_order_return_disposition.sql",
  import.meta.url
)

if (!databaseUrl) {
  describe.skip("return inventory PostgreSQL integration", () => {
    it("requires an isolated TEST_ORDER_DATABASE_URL", () => {})
  })
} else {
  describe("return inventory PostgreSQL integration", () => {
    let db: Client
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
        CREATE SCHEMA auth; CREATE TABLE auth.users (id uuid PRIMARY KEY);
        CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('role', true) $$;
        INSERT INTO auth.users VALUES ('${userId}');
      `)
      await db.query(
        await readFile(
          new URL(
            "../../supabase/migrations/20260103_initial_schema.sql",
            import.meta.url
          ),
          "utf8"
        )
      )
      await db.query(`
        ALTER TABLE public.order_line_items ADD COLUMN pack_size text DEFAULT 'single';
        GRANT USAGE ON SCHEMA public, auth TO authenticated, anon;
        GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
        GRANT SELECT ON auth.users TO authenticated;
      `)
      await db.query(await readFile(migration, "utf8"))
      await db.query("set role authenticated")
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [
        userId
      ])
    })
    afterAll(async () => {
      await db?.end()
    })

    async function fixture({
      status = "paid",
      pack = "single",
      qty = 2,
      bundle = false,
      legacy = false
    } = {}) {
      const id = randomUUID(),
        label = `TEST-${id}`,
        sku = `SKU-${id}`
      await db.query(
        "insert into products(sku,name,cost_per_unit,reorder_point,is_bundle) values($1,'Test item',10,0,$2)",
        [sku, bundle]
      )
      const components = bundle
        ? [
            { sku: `A-${id}`, qty: 2 },
            { sku: `B-${id}`, qty: 1 }
          ]
        : [{ sku, qty: 1 }]
      if (bundle)
        for (const c of components) {
          await db.query(
            "insert into products(sku,name,cost_per_unit,reorder_point) values($1,'Test component',10,0)",
            [c.sku]
          )
          await db.query(
            "insert into bundle_compositions(bundle_sku,component_sku,quantity) values($1,$2,$3)",
            [sku, c.sku, c.qty]
          )
        }
      await db.query(
        "insert into orders(id,order_id,channel,order_date,status) values($1,$2,'shopee',now(),$3)",
        [id, label, status]
      )
      await db.query(
        "insert into order_line_items(order_id,sku,quantity,selling_price,pack_size) values($1,$2,$3,100,$4)",
        [id, sku, qty, pack]
      )
      const units =
        qty * ({ single: 1, bundle_2: 2, bundle_3: 3, bundle_4: 4 }[pack] ?? 1)
      for (const c of components) {
        await db.query(
          "insert into inventory_ledger(sku,movement_type,quantity,reference) values($1,'IN_PURCHASE',100,'Test stock')",
          [c.sku]
        )
        if (["paid", "shipped"].includes(status) || legacy) {
          await db.query(
            "insert into inventory_ledger(sku,movement_type,quantity,reference) values($1,'OUT_SALE',$2,$3)",
            [c.sku, -units * c.qty, `Order ${label}`]
          )
          if (legacy)
            await db.query(
              "insert into inventory_ledger(sku,movement_type,quantity,reference) values($1,'RETURN',$2,$3)",
              [c.sku, units * c.qty, `Order ${label} - Cancelled`]
            )
        }
      }
      return { id, label, sku, components, units }
    }
    async function change(
      id: string,
      next: string,
      previous: string,
      disposition: string | null = null,
      expected: string | null = null,
      client = db
    ) {
      return (
        await client.query(
          "select public.update_order_status_with_inventory($1,$2,$3,$4,$5,'Defect test') as result",
          [id, next, previous, disposition, expected]
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
    async function movements(label: string) {
      return (
        await db.query(
          "select sku,movement_type,quantity from inventory_ledger where starts_with(reference,$1) order by movement_type,sku",
          [`Order ${label} - `]
        )
      ).rows
    }

    it("keeps packed defective returns out of saleable stock without double deducting", async () => {
      const f = await fixture({ pack: "bundle_3" })
      const before = await stock(f.sku)
      expect(
        await change(f.id, "returned", "paid", "dead_stock")
      ).toMatchObject({
        changed: true,
        return_disposition: "dead_stock",
        ledger_entries: 2
      })
      expect(await stock(f.sku)).toBe(before)
      expect(await movements(f.label)).toEqual([
        { sku: f.sku, movement_type: "OUT_DAMAGE", quantity: -6 },
        { sku: f.sku, movement_type: "RETURN", quantity: 6 }
      ])
    })
    it("restores checked saleable returns and ordinary cancellations", async () => {
      for (const next of ["returned", "cancelled"]) {
        const f = await fixture({ status: "shipped", pack: "bundle_2" })
        const before = await stock(f.sku)
        await change(
          f.id,
          next,
          "shipped",
          next === "returned" ? "restock" : null
        )
        expect(await stock(f.sku)).toBe(before + 4)
        expect(await movements(f.label)).toEqual([
          { sku: f.sku, movement_type: "RETURN", quantity: 4 }
        ])
      }
    })
    it("requires a condition and rejects invalid parameters before changing stock", async () => {
      const f = await fixture(),
        before = await stock(f.sku)
      await expect(change(f.id, "returned", "paid")).rejects.toThrow(
        /Choose whether/
      )
      await expect(change(f.id, "returned", "paid", "unknown")).rejects.toThrow(
        /Invalid return/
      )
      expect(await stock(f.sku)).toBe(before)
      expect(await movements(f.label)).toHaveLength(0)
    })
    it("expands bundle components and their pack multiplier for damage", async () => {
      const f = await fixture({ bundle: true, pack: "bundle_2" })
      const before = await Promise.all(f.components.map((c) => stock(c.sku)))
      await change(f.id, "returned", "paid", "dead_stock")
      expect(await Promise.all(f.components.map((c) => stock(c.sku)))).toEqual(
        before
      )
      const rows = await movements(f.label)
      expect(rows).toHaveLength(4)
      for (const c of f.components)
        expect(
          rows.filter((r) => r.sku === c.sku).map((r) => r.quantity)
        ).toEqual([-f.units * c.qty, f.units * c.qty])
    })
    it("does not restore or write off stock again on retries or closed-status changes", async () => {
      const f = await fixture()
      await change(f.id, "returned", "paid", "dead_stock")
      expect(
        await change(f.id, "returned", "paid", "dead_stock")
      ).toMatchObject({ changed: false, ledger_entries: 0 })
      await change(f.id, "cancelled", "returned", "dead_stock", "dead_stock")
      expect(await movements(f.label)).toHaveLength(2)
      await expect(
        change(f.id, "paid", "cancelled", null, "dead_stock")
      ).rejects.toThrow(/Dead stock cannot/)
      await expect(
        change(f.id, "returned", "cancelled", "restock", "dead_stock")
      ).rejects.toThrow(/Dead stock cannot/)
    })
    it("writes off stock that a legacy cancellation had restored", async () => {
      const f = await fixture({ status: "cancelled", legacy: true }),
        before = await stock(f.sku)
      await change(f.id, "cancelled", "cancelled", "dead_stock")
      expect(await stock(f.sku)).toBe(before - f.units)
      expect(
        (await movements(f.label)).filter(
          (r) => r.movement_type === "OUT_DAMAGE"
        )
      ).toHaveLength(1)
      const imported = await fixture({ status: "returned" })
      await expect(
        change(imported.id, "returned", "returned", "dead_stock")
      ).rejects.toThrow(/No stock restoration/)
    })
    it("rejects stale windows and keeps paid-to-shipped stock unchanged", async () => {
      const f = await fixture(),
        before = await stock(f.sku)
      await change(f.id, "shipped", "paid")
      await expect(
        change(f.id, "returned", "paid", "dead_stock")
      ).rejects.toThrow(/another window/)
      expect(await stock(f.sku)).toBe(before)
      expect(await movements(f.label)).toHaveLength(0)
    })
    it("rolls back the status and every stock movement if a write fails", async () => {
      const f = await fixture(),
        before = await stock(f.sku)
      await db.query("reset role")
      await db.query(`create function public.test_damage_failure() returns trigger language plpgsql as $$ begin if NEW.movement_type='OUT_DAMAGE' then raise exception 'Injected failure'; end if; return NEW; end $$;
        create trigger test_failure before insert on inventory_ledger for each row execute function public.test_damage_failure();`)
      await db.query("set role authenticated")
      try {
        await expect(
          change(f.id, "returned", "paid", "dead_stock")
        ).rejects.toThrow(/Injected failure/)
      } finally {
        await db.query(
          "reset role; drop trigger test_failure on inventory_ledger; drop function public.test_damage_failure(); set role authenticated"
        )
      }
      expect(await stock(f.sku)).toBe(before)
      expect(await movements(f.label)).toHaveLength(0)
      expect(
        (
          await db.query(
            "select status,return_disposition from orders where id=$1",
            [f.id]
          )
        ).rows[0]
      ).toEqual({ status: "paid", return_disposition: null })
    })
    it("allows exactly one inventory write when two requests arrive together", async () => {
      const f = await fixture(),
        worker = new Client({ connectionString: databaseUrl })
      await worker.connect()
      try {
        await worker.query("set role authenticated")
        await worker.query(
          "select set_config('request.jwt.claim.sub',$1,false)",
          [userId]
        )
        const results = await Promise.all([
          change(f.id, "returned", "paid", "dead_stock"),
          change(f.id, "returned", "paid", "dead_stock", null, worker)
        ])
        expect(results.filter((r) => r.changed)).toHaveLength(1)
        expect(await movements(f.label)).toHaveLength(2)
      } finally {
        await worker.end()
      }
    })
    it("requires authenticated execution and an actual user identity", async () => {
      const f = await fixture()
      await db.query("set role anon")
      await expect(
        change(f.id, "returned", "paid", "dead_stock")
      ).rejects.toThrow(/permission denied/)
      await db.query(
        "set role authenticated; select set_config('request.jwt.claim.sub','',false)"
      )
      try {
        await expect(
          change(f.id, "returned", "paid", "dead_stock")
        ).rejects.toThrow(/sign in/)
      } finally {
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          userId
        ])
      }
    })
  })
}
