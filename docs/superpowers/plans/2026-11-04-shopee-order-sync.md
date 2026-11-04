# Shopee 订单自动同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 卖家在 Seller Center 安排出货后，Shopee 订单几秒内自动进 dashboard 并扣库存，之后状态（取件、取消、退货）也自动跟着更新。

**Architecture:**
- Shopee 推送（`/api/shopee/push`）是主要入口，`pg_cron` 每 15 分钟调用 `/api/shopee/sync` 补漏。两条路都调用 `lib/shopee/sync.ts` 的 `syncShopeeOrders`。
- 写入数据库只通过一个 Postgres RPC `apply_shopee_order`，在一个 transaction 里完成，重复调用不会重复记。库存展开规则抽成 `_apply_order_inventory`，跟 `update_order_status_with_inventory` 共用。
- token 存在只有 service role 能读的 `marketplace_connections`。只有 cron 的那次同步会续期 token。

**Tech Stack:** Next.js 16 App Router、React 19、TypeScript、Supabase（Postgres、pg_cron、pg_net、Realtime）、Vitest、Shopee Open Platform v2

**Spec:** `docs/superpowers/specs/2026-11-04-shopee-order-sync-design.md`

## Global Constraints

- Shopee Live Partner ID `2042739`，API host `https://partner.shopeemobile.com`。
- 推送网址 `https://dashboard.sheepiesleep.com/api/shopee/push`。授权跳转网址 `https://dashboard.sheepiesleep.com/api/shopee/callback`。
- 推送签名：`Authorization` header = hex `HMAC-SHA256(SHOPEE_PUSH_PARTNER_KEY, callbackUrl + "|" + rawBody)`。这里的 key 跟 API 的 `SHOPEE_PARTNER_KEY` 不是同一个。
- API 签名：shop 级 = `HMAC-SHA256(partner_key, partner_id + path + timestamp + access_token + shop_id)`；auth 级 = `partner_id + path + timestamp`。跟 `scripts/shopee-orders.py` 一样。
- `get_order_list` 一次最多查 15 天，`page_size` 100；`get_order_detail` 一次最多 50 张。
- 状态对应以 spec 的"状态对应"表为准，只在 `lib/shopee/status.ts` 定义一次。
- `selling_price` = `model_discounted_price`（每个 pack 的单价），`quantity` = `model_quantity_purchased`。绝不能用 `total_amount`。
- **`order_date` 存成雅加达日期的 `YYYY-MM-DD`**，跟手动录单一样。报表是用 `order_date.slice(0, 10)` 分日期的，如果存精确时间，雅加达凌晨的单会被算到前一天。精确的下单时间另外存在 `external_created_at`。
- `order_id` = Shopee `order_sn`，`channel = 'shopee'`，`source = 'shopee_api'`。
- 环境变量（Next/Vercel）：`SHOPEE_PARTNER_ID`、`SHOPEE_PARTNER_KEY`、`SHOPEE_PUSH_PARTNER_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SHOPEE_SYNC_SECRET`。Vault secret：`shopee_sync_secret`。
- `sync_start_at` 为 null 时（还没按"开始自动同步"），push 和 sync 都不碰订单。
- 不拉买家个人资料；log 和错误信息里不能出现 key 或 token。
- 界面文字用中文，跟 spec 一致。

## Review Focus

1. **同一张订单的推送和定时拉单同时到** → 只能有一张单、一组 `OUT_SALE`。（Task 2：`concurrent applies create one order`）
2. **订单第一次被看到时已经是 `COMPLETED`**（中间跳过了 `PROCESSED`）→ 建成 `shipped`，而且要扣库存。（Task 2：`first sight as shipped still deducts stock`）
3. **dashboard 里已经手动标成 `returned` 的单，Shopee 之后又推 `COMPLETED` / `CANCELLED`** → dashboard 状态不能被改。（Task 2：`returned orders are never overwritten`）
4. **订单因为商品没对应、或出错放进了待处理，之后才配好对应** → 这张单的 `update_time` 已经在同步窗口之外，下一次定时拉单也必须重试。（Task 5：`poll retries open unmapped and error queue items`）
5. **推送进来时 access token 已经过期**（cron 停了）→ 回 200、放进待处理，不能在 push 里续期。（Task 6：`expired token queues instead of refreshing`）

---

## File Map

**Create**
- `supabase/migrations/20261105000100_add_shopee_sync.sql` — 新表、`orders` 新栏位、`_apply_order_inventory`、`apply_shopee_order`、状态查询和"开始同步" RPC
- `supabase/migrations/20261105000200_schedule_shopee_sync.sql` — pg_cron 每 15 分钟
- `supabase/migrations/20261105000300_enable_orders_realtime.sql` — 把 `orders` 加进 `supabase_realtime`
- `lib/shopee/signing.ts`、`lib/shopee/client.ts` — 签名和 API client
- `lib/shopee/status.ts`、`lib/shopee/build-order.ts` — 状态对应、Shopee 订单 → RPC payload
- `lib/shopee/store.ts` — service-role 的数据库读写（薄层，不做单元测试）
- `lib/shopee/sync.ts` — `syncShopeeOrders`、`pollShopeeOrders`
- `lib/shopee/push.ts` — `handleShopeePush`
- `lib/shopee/alerts.ts` — 通知邮件
- `lib/supabase/service.ts` — `createServiceClient()`
- `lib/actions/shopee.ts` — 设置页的 server actions
- `app/api/shopee/{connect,callback,push,sync,token}/route.ts`
- `app/(dashboard)/more/shopee/page.tsx`、`components/shopee/*`
- `components/shell/shopee-live-refresh.tsx`
- Tests：`lib/shopee/*.test.ts`、`lib/shopee/apply-order.postgres.test.ts`

**Modify**
- `lib/types/database.types.ts` — `Order` 加新栏位
- `lib/supabase/middleware.ts` — 放行 `/api/shopee/push|sync|token`
- `lib/orders/return-status.postgres.test.ts` — 改成也载入新 migration，确认重构后行为不变
- `app/(dashboard)/more/page.tsx`、`app/(dashboard)/layout.tsx`
- `components/orders/orders-list-client.tsx`、`components/orders/new-order-form.tsx`、`app/(dashboard)/orders/new/page.tsx`、`app/(dashboard)/orders/page.tsx`
- `scripts/shopee-orders.py`

---

### Task 1: 数据表和共用的库存函数

**Files:**
- Create: `supabase/migrations/20261105000100_add_shopee_sync.sql`（这个 Task 先写第一部分，Task 2 接着写）
- Modify: `lib/orders/return-status.postgres.test.ts`、`lib/types/database.types.ts`

**Interfaces:**
- Produces（SQL）：
  - `marketplace_connections(channel text PK CHECK (channel = 'shopee'), shop_id bigint, access_token text, refresh_token text, access_expires_at timestamptz, refresh_expires_at timestamptz, sync_start_at timestamptz, last_synced_until timestamptz, consecutive_failures int NOT NULL DEFAULT 0, last_sync_error text, last_alert_at timestamptz, updated_at timestamptz)`。开 RLS，不建 policy。
  - `shopee_listing_map(item_id bigint, model_id bigint, item_name text, model_name text, sku text REFERENCES products(sku), pack_size text CHECK IN ('single','bundle_2','bundle_3','bundle_4'), PRIMARY KEY (item_id, model_id))`。authenticated 全部权限。
  - `shopee_sync_queue(order_sn text PRIMARY KEY, reason text CHECK IN ('unmapped_item','return_review','error'), detail jsonb NOT NULL DEFAULT '{}', order_id uuid REFERENCES orders(id), first_seen_at timestamptz DEFAULT now(), last_seen_at timestamptz DEFAULT now(), resolved_at timestamptz)`。authenticated 可读、可改 `resolved_at`；service_role 全部权限。
  - `orders` 新栏位：`source text NOT NULL DEFAULT 'manual' CHECK IN ('manual','shopee_api')`、`external_status text`、`external_created_at timestamptz`、`external_updated_at timestamptz`、`synced_via text CHECK IN ('push','poll')`。
  - `public._apply_order_inventory(p_order_id uuid, p_movement text, p_reference_label text, p_paired_damage boolean, p_created_by uuid) RETURNS integer`：插入 ledger，回传插入的行数。内容就是从 `update_order_status_with_inventory` 里搬出来的那个 line item / bundle 展开 loop。`REVOKE ALL ... FROM PUBLIC`。
  - 重新定义 `update_order_status_with_inventory`，签名和行为都不变，只是改成调用 `_apply_order_inventory`。
- Produces（TS）：`Order` 加 `source: 'manual' | 'shopee_api'`、`external_status: string | null`、`external_created_at: string | null`、`external_updated_at: string | null`、`synced_via: 'push' | 'poll' | null`。

- [ ] **Step 1: 开分支。** 用 superpowers:using-git-worktrees，从 `main` 开 `feat/shopee-order-sync`。把目前在 `feat/restock-pipeline` 工作区里还没追踪的 spec、这份计划、`scripts/shopee-orders.py`、`.gitignore` 里新增的 `/.shopee/` 那一行，复制到 worktree，然后 commit：`docs: add shopee order sync spec and plan`。
- [ ] **Step 2: 准备测试用的 Postgres。** 执行 `docker run --rm -d --name shopee-pg -p 54329:5432 -e POSTGRES_PASSWORD=postgres postgres:15`，然后 `export TEST_ORDER_DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres`。先跑一次 `npx vitest run lib/orders/return-status.postgres.test.ts`，预期 PASS（这是现在的基准）。之后每个 postgres 测试都要在一个空的 database 上跑（`docker restart shopee-pg` 或者每次 `createdb`）。
- [ ] **Step 3: 改测试。** `return-status.postgres.test.ts` 在载入 `20261003050501` 之后，也载入 `20261105000100_add_shopee_sync.sql`。setup 里补上：`CREATE ROLE service_role NOLOGIN`、`ALTER TABLE order_line_items ADD COLUMN cost_per_unit_snapshot numeric`、载入 `20260316_add_changelog.sql`。现有的断言都不改。
- [ ] **Step 4: 跑测试，确认失败**（migration 文件还不存在）。
- [ ] **Step 5: 写 migration 的第一部分**（表、栏位、`_apply_order_inventory`、重新定义的 `update_order_status_with_inventory`）。`changelog_entries` 已经在 production 上，不用重建。
- [ ] **Step 6: 跑 `npx vitest run lib/orders/return-status.postgres.test.ts`，预期 PASS。** 这证明重构没有改变退货和库存的行为。
- [ ] **Step 7:** 更新 `database.types.ts`，执行 `npm run typecheck`，预期 PASS。
- [ ] **Step 8: Commit** `feat(db): add shopee sync tables and shared order inventory helper`

### Task 2: `apply_shopee_order` RPC

**Files:**
- Modify: `supabase/migrations/20261105000100_add_shopee_sync.sql`
- Test: `lib/shopee/apply-order.postgres.test.ts`（setup 照 Task 1 改过的 return-status 测试）

**Interfaces:**
- Consumes：Task 1 的表和 `_apply_order_inventory`。
- Produces：`public.apply_shopee_order(p_order jsonb, p_via text) RETURNS jsonb`。`SECURITY DEFINER`，`SET search_path = ''`，只 `GRANT EXECUTE` 给 `service_role`。
  - `p_order` 的格式（TS 型别 `ShopeeOrderPayload`，定义在 Task 4）：`{ order_sn, status: 'paid'|'shipped'|'cancelled', external_status, order_date: 'YYYY-MM-DD', external_created_at, external_updated_at, lines: [{ sku, pack_size, quantity, selling_price }] }`
  - 回传：`{ action: 'created'|'updated'|'unchanged'|'skipped', order_id: uuid|null, ledger_entries: int }`

规则：
1. 用 `order_id = order_sn` 找订单，找到就 `FOR UPDATE` 锁住。
2. **找不到：**
   - `status` 是 `cancelled` → `skipped`。
   - 否则 `INSERT ... ON CONFLICT (order_id) DO NOTHING RETURNING id`。如果没插进去（被另一个请求抢先建了），就重新 `SELECT ... FOR UPDATE`，改走"已存在"的流程。
   - 插 line items，`cost_per_unit_snapshot` 从 `products.cost_per_unit` 拿。
   - 调用 `_apply_order_inventory(id, 'OUT_SALE', 'Order <sn> - Paid (Shopee sync)', false, NULL)`。
   - 写一笔 `changelog_entries`：`area 'orders'`、`source 'automatic'`、`action_summary 'Synced from Shopee'`、`entity_type 'order'`、`entity_id` 是订单 uuid、`entity_label 'Order <sn>'`。
3. **已存在：**
   - `p_order.external_updated_at <= orders.external_updated_at` → `unchanged`。
   - 先更新 `external_status`、`external_updated_at`。
   - 现在的状态是 `returned` → 不改状态，回 `updated`，`ledger_entries` 0。
   - 状态有变：active（`paid`/`shipped`）→ `cancelled`，就用 `RETURN` 并把 `return_disposition` 设成 `'restock'`；不是 active → active，就用 `OUT_SALE`；`paid` ↔ `shipped` 不动库存。
   - 写一笔 changelog：`'Updated order status (Shopee sync)'`。
4. `p_via` 只在建单时写进 `synced_via`。

- [ ] **Step 1: 写会失败的测试**，用 Task 1 的 fixture 写法（单品 + bundle），以 `service_role` 身份执行：
  - `creates paid order with OUT_SALE ledger`：ledger 的数量 = −(quantity × pack 倍数 × bundle 组成数量)；`source = 'shopee_api'`；`order_date::date` = payload 的日期。
  - `first sight as shipped still deducts stock`
  - `first sight as cancelled is skipped`：回 `skipped`，没有建任何资料。
  - `paid then shipped moves no stock`：ledger 行数不变。
  - `paid then cancelled restores stock`：多一笔 `RETURN`，`return_disposition = 'restock'`。
  - `stale update is unchanged`：`external_updated_at` 比较旧，什么都不改。
  - `returned orders are never overwritten`：先用 `update_order_status_with_inventory` 标成 returned/dead_stock，再 apply `shipped` → 状态还是 `returned`，ledger 不变。
  - `same payload twice is idempotent`
  - `concurrent applies create one order`：开两个 `pg.Client`，用 `Promise.all` 同时 apply 同一个 payload → 只有 1 张订单、1 组 `OUT_SALE`。
  - `authenticated cannot execute`：以 authenticated 身份调用会报 permission denied。
- [ ] **Step 2: 跑测试，确认失败**（函数不存在）。
- [ ] **Step 3: 在 migration 里写 `apply_shopee_order`。**
- [ ] **Step 4: 用一个空 database 跑 `npx vitest run lib/shopee/apply-order.postgres.test.ts lib/orders/return-status.postgres.test.ts`，预期都 PASS。**
- [ ] **Step 5: Commit** `feat(db): add apply_shopee_order rpc`

### Task 3: 签名和 Shopee API client

**Files:**
- Create: `lib/shopee/signing.ts`、`lib/shopee/client.ts`
- Test: `lib/shopee/signing.test.ts`、`lib/shopee/client.test.ts`

**Interfaces:**
- Produces：
  - `signApiRequest(input: { partnerId: number; partnerKey: string; path: string; timestamp: number; accessToken?: string; shopId?: number }): string`
  - `verifyPushSignature(input: { callbackUrl: string; rawBody: string; authorization: string | null; pushKey: string }): boolean`（用 `timingSafeEqual`，长度不同时回 false）
  - `class ShopeeApiError extends Error { code: string }`（`code` 是 Shopee 回传的 `error`，例如 `invalid_acceess_token`）
  - `createShopeeClient(opts: { partnerId: number; partnerKey: string; fetchImpl?: typeof fetch; now?: () => number })`，回传：
    - `buildAuthUrl(redirect: string): string`
    - `getTokens(code: string, shopId: number): Promise<ShopeeTokens>`
    - `refreshTokens(refreshToken: string, shopId: number): Promise<ShopeeTokens>`
    - `listOrderSns(tok: ShopeeAuth, range: { from: number; to: number }): Promise<string[]>`：`time_range_field=update_time`，自动按 15 天切段、跟着 `next_cursor` 翻页
    - `getOrderDetails(tok: ShopeeAuth, sns: string[]): Promise<ShopeeOrderDetail[]>`：每 50 张一批，`response_optional_fields=item_list,order_status`
  - `type ShopeeAuth = { shopId: number; accessToken: string }`
  - `type ShopeeTokens = { accessToken: string; refreshToken: string; accessExpiresAt: Date; refreshExpiresAt: Date }`：`expire_in` 秒数提早 300 秒；refresh 期限是现在 + 30 天
  - `type ShopeeOrderDetail = { order_sn: string; order_status: string; create_time: number; update_time: number; item_list: { item_id: number; model_id: number; item_name: string; model_name: string; model_quantity_purchased: number; model_discounted_price: number }[] }`

- [ ] **Step 1: 写会失败的测试：**
  - `signApiRequest matches python script`：输入固定值，预期的 hex 用 Python `hmac.new(key, f"{pid}{path}{ts}{tok}{shop}".encode(), sha256).hexdigest()` 算出来，写死在测试里。
  - `verifyPushSignature accepts valid / rejects tampered body / rejects missing header`
  - `listOrderSns splits 20 days into two calls and follows cursor`：用 fake fetch 记录请求，确认 `time_from`/`time_to` 和 cursor。
  - `getOrderDetails batches 120 sns as 50/50/20`
  - `api error throws ShopeeApiError with code`
  - `requests never put partner key in url`
- [ ] **Step 2:** `npx vitest run lib/shopee/signing.test.ts lib/shopee/client.test.ts`，预期 FAIL。
- [ ] **Step 3: 实现。** 用 `node:crypto`，不加新的套件。
- [ ] **Step 4: 再跑一次，预期 PASS。**
- [ ] **Step 5: Commit** `feat(shopee): add api client and signature helpers`

### Task 4: 状态对应和订单转换

**Files:**
- Create: `lib/shopee/status.ts`、`lib/shopee/build-order.ts`
- Test: `lib/shopee/status.test.ts`、`lib/shopee/build-order.test.ts`

**Interfaces:**
- Consumes：`ShopeeOrderDetail`（Task 3）。
- Produces：
  - `type ShopeeStatusAction = { kind: 'apply'; status: 'paid' | 'shipped' | 'cancelled' } | { kind: 'not_yet' } | { kind: 'hold' } | { kind: 'return_review' }`
  - `mapShopeeStatus(status: string): ShopeeStatusAction`
  - `type ListingKey = \`${number}:${number}\``，`type ListingMap = Map<ListingKey, { sku: string; pack_size: PackSize }>`
  - `type ShopeeOrderPayload`：跟 Task 2 的 `p_order` 一样
  - `buildShopeeOrderPayload(detail: ShopeeOrderDetail, status: 'paid'|'shipped'|'cancelled', map: ListingMap): { kind: 'ok'; payload: ShopeeOrderPayload } | { kind: 'unmapped'; items: { item_id: number; model_id: number; item_name: string; model_name: string }[] }`
  - `jakartaDate(unixSeconds: number): string`

- [ ] **Step 1: 写会失败的测试：**
  - `mapShopeeStatus`：用 `it.each` 把 spec 表里的每一行都测一次，包括 `UNPAID`、`READY_TO_SHIP` → `not_yet`；`PROCESSED`、`RETRY_SHIP` → paid；`SHIPPED`、`TO_CONFIRM_RECEIVE`、`COMPLETED` → shipped；`IN_CANCEL` → hold；`CANCELLED` → cancelled；`TO_RETURN` → return_review；没见过的状态 → hold。
  - `jakartaDate(1793813400)` 应该是 `'2026-11-05'`（这是 2026-11-04 17:30 UTC，雅加达已经是 11/5 00:30）。
  - `builds lines from model_discounted_price and pack map`：Blue Single 218000 × 1 → `{ sku: 'Lumi-001', pack_size: 'single', quantity: 1, selling_price: 218000 }`。
  - `one unmapped item makes whole order unmapped`：两个商品里只要有一个没对应，就回 `unmapped`，并列出没对应的那一个。
  - `model_id 0 is a valid key`
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4: 跑测试，预期 PASS。**
- [ ] **Step 5: Commit** `feat(shopee): map statuses and build order payloads`

### Task 5: 同步流程

**Files:**
- Create: `lib/supabase/service.ts`、`lib/shopee/store.ts`、`lib/shopee/sync.ts`
- Test: `lib/shopee/sync.test.ts`（用 fake `SyncDeps`，不连数据库）

**Interfaces:**
- Consumes：Task 3 的 client、Task 4 的 `mapShopeeStatus` / `buildShopeeOrderPayload`、Task 2 的 RPC。
- Produces：
  - `createServiceClient()`：用 `SUPABASE_SERVICE_ROLE_KEY`，没设定就丢错误。
  - `type ShopeeConnection`：`marketplace_connections` 一行，栏位改成 camelCase。
  - `type SyncDeps = { shopee: ReturnType<typeof createShopeeClient>; store: ShopeeStore; now: () => Date }`
  - `interface ShopeeStore`（`createShopeeStore(supabase)` 实现）：
    - `getConnection()`
    - `saveTokens(shopId, tokens)`
    - `saveCursor(until: Date)`
    - `recordFailure(message: string): Promise<number>`（回传失败次数）
    - `resetFailures()`
    - `loadListingMap(): Promise<ListingMap>`
    - `queue(sn, reason, detail, orderId?)`
    - `resolveQueue(sn)`
    - `openRetryableSns(): Promise<string[]>`（`reason IN ('unmapped_item','error')` 而且 `resolved_at` 是 null）
    - `findOrder(sn): Promise<{ id: string; status: OrderStatus } | null>`
    - `applyOrder(payload, via): Promise<ApplyResult>`
  - `syncShopeeOrders(sns: string[], via: 'push' | 'poll', deps: SyncDeps): Promise<{ created: number; updated: number; queued: number; skipped: number; ledgerEntries: number }>`
  - `pollShopeeOrders(deps: SyncDeps, opts: { allowRefresh: boolean }): Promise<PollResult>`

规则：
- `syncShopeeOrders`：
  - 连接不存在、或 `syncStartAt` 是 null → 全部 skip。
  - access token 已过期 → 丢 `ShopeeApiError('expired_token')`，**不续期**。
  - 拿到 detail 之后，每张订单依序判断：
    1. `create_time < syncStartAt` → skip。
    2. 用 `mapShopeeStatus` 判断：
       - `not_yet` / `hold` → skip。
       - `return_review` → 如果找得到订单，`queue(sn, 'return_review', {}, order.id)`；否则 skip。
       - `apply` → `buildShopeeOrderPayload`。`unmapped` 就 `queue(sn, 'unmapped_item', { items })`；`ok` 就 `applyOrder`，成功后 `resolveQueue(sn)`（只解决 `unmapped_item` / `error`）。
    3. 单张出错 → `queue(sn, 'error', { message })`，继续处理下一张。
  - 有任何 `ledgerEntries > 0` 时，调用 `triggerNotificationSender()`（`lib/notifications/trigger-sender.ts`），这样库存降低时的补货提醒会照常发出。
- `pollShopeeOrders`：
  - `allowRefresh` 为 true，而且 access token 剩不到 1 小时 → `refreshTokens` + `saveTokens`。refresh 失败 → `recordFailure`，回 `{ needsReconnect: true }`。
  - 时间窗：`from = (lastSyncedUntil ?? syncStartAt) − 1h`，`to = now`。
  - `sns = listOrderSns(...)` 加上 `openRetryableSns()`，去重。
  - 整次成功 → `saveCursor(to)`、`resetFailures()`；失败 → 不动 cursor，`recordFailure`。

- [ ] **Step 1: 写会失败的测试：**
  - `skips everything before go-live`
  - `skips orders created before sync_start_at`
  - `ready_to_ship is not created`
  - `unmapped order is queued and not applied`
  - `mapped order applies and resolves queue`
  - `poll retries open unmapped and error queue items`：queue 里有一张 unmapped 的单，`listOrderSns` 回空；补上对应之后 poll → `applyOrder` 有被调用。
  - `poll window starts one hour before last cursor`
  - `failed poll keeps cursor and counts failure`
  - `refreshes only when allowRefresh and under one hour left`
  - `refresh failure reports needsReconnect`
  - `one bad order does not stop the batch`
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现**（`store.ts` 是 supabase 的薄包装，不另外测试）。
- [ ] **Step 4: 跑测试，预期 PASS。**
- [ ] **Step 5: Commit** `feat(shopee): add order sync and polling`

### Task 6: 推送处理和 API routes

**Files:**
- Create: `lib/shopee/push.ts`、`app/api/shopee/{push,sync,token,connect,callback}/route.ts`
- Modify: `lib/supabase/middleware.ts`
- Test: `lib/shopee/push.test.ts`、`lib/shopee/middleware-paths.test.ts`

**Interfaces:**
- Consumes：Task 3、5。
- Produces：
  - `handleShopeePush(input: { rawBody: string; authorization: string | null }, deps: SyncDeps & { pushKey: string; callbackUrl: string }): Promise<{ status: 200 | 401; body: { ok: boolean; reason?: string } }>`
  - `isPublicShopeeApiPath(pathname: string): boolean`：`/api/shopee/push`、`/api/shopee/sync`、`/api/shopee/token` 回 true，`connect`、`callback` 回 false。

各个 route：
- **`push`（POST）：** 读 raw body → `handleShopeePush`。规则：
  - 签名不对 → 401。
  - `code !== 3`、或 `shop_id` 不是我们的 → 200，ignored。
  - 否则执行 `syncShopeeOrders([data.ordersn], 'push')`。
  - 出任何错都回 200，并把订单放进 `queue(sn, 'error')`。
- **`sync`（POST）：** header `x-shopee-sync-secret` 要等于 `SHOPEE_SYNC_SECRET`，否则 401 → `pollShopeeOrders(deps, { allowRefresh: true })` → 执行 alerts（Task 7）→ 回 JSON 摘要。
- **`token`（GET）：** 同样检查 secret，回 `{ shop_id, access_token, expires_at }`，不续期。给本地脚本用。
- **`connect`（GET，要登录）：**
  - 产生一个随机 `state`，存进 httpOnly cookie `shopee_oauth_state`（10 分钟）。
  - redirect 到 `buildAuthUrl(<callback>?state=<state>)`。
- **`callback`（GET，要登录）：**
  - `state` 要跟 cookie 一样，否则 400。
  - `getTokens(code, shop_id)` → `saveTokens`。
  - redirect 到 `/more/shopee?connected=1`。
- **middleware：** `isPublicShopeeApiPath` 为 true 时，直接 `NextResponse.next()`，不检查登录。

- [ ] **Step 1: 写会失败的测试：**
  - `bad signature returns 401 and does not sync`
  - `non-order push is ignored with 200`
  - `other shop is ignored`
  - `expired token queues instead of refreshing`：fake 的 `refreshTokens` 不能被调用，queue 收到 `error`，回 200。
  - `valid push syncs the ordersn via push`
  - `public path list`：上面 5 个路径的预期。
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现 `push.ts`、5 个 routes 和 middleware。** routes 加上 `export const runtime = 'nodejs'`。
- [ ] **Step 4: 执行 `npx vitest run lib/shopee` 和 `npm run typecheck`，预期 PASS。**
- [ ] **Step 5: Commit** `feat(shopee): add push, sync, token and oauth routes`

### Task 7: 通知邮件

**Files:**
- Create: `lib/shopee/alerts.ts`
- Modify: `app/api/shopee/sync/route.ts`
- Test: `lib/shopee/alerts.test.ts`

**Interfaces:**
- Produces：
  - `type ShopeeAlert = 'needs_reconnect' | 'repeated_failures' | 'push_silent'`
  - `pickShopeeAlert(input: { needsReconnect: boolean; consecutiveFailures: number; pollCreatedLast24h: number; pushCreatedLast24h: number; lastAlertAt: Date | null; now: Date }): ShopeeAlert | null`
  - `sendShopeeAlert(alert: ShopeeAlert, deps: { supabase; fetchImpl? }): Promise<void>`：直接用 `RESEND_API_KEY` / `EMAIL_FROM` 调用 Resend REST。收件人是 `auth.admin.listUsers` 里的全部 email，跟 `send-notification-events` 一样。发完更新 `last_alert_at`。

规则：
- 优先顺序：`needs_reconnect` > `repeated_failures`（失败 ≥ 3 次）> `push_silent`（24 小时内靠拉单补到的单 > 0，而且推送建的单 = 0）。
- `lastAlertAt` 在 24 小时内的话，回 null，不重复发。

主旨：
- `needs_reconnect`：`Sheepie Dashboard：Shopee 需要重新连接`
- `repeated_failures`：`Sheepie Dashboard：Shopee 同步连续失败`
- `push_silent`：`Sheepie Dashboard：Shopee 推送 24 小时没有进来`

内文：一句说明，加上 `https://dashboard.sheepiesleep.com/more/shopee` 的连结。

- [ ] **Step 1: 写会失败的测试**：上面三个状况、优先顺序、24 小时内不重复、全部正常时回 null。
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现，并接到 `sync` route。** 用 store 查 `orders` 最近 24 小时 `synced_via` 的数量。
- [ ] **Step 4: 跑测试，预期 PASS。**
- [ ] **Step 5: Commit** `feat(shopee): email alerts for sync problems`

### Task 8: 定时拉单和 Realtime

**Files:**
- Create: `supabase/migrations/20261105000200_schedule_shopee_sync.sql`、`supabase/migrations/20261105000300_enable_orders_realtime.sql`
- Test: `lib/shopee/migrations-contract.test.ts`（照 `lib/notifications/source-contracts.test.ts` 的写法，读文件内容来检查）

内容：
- cron job `shopee-order-sync`，排程 `*/15 * * * *`。
  - `net.http_post` 到 `https://dashboard.sheepiesleep.com/api/shopee/sync`。
  - header `x-shopee-sync-secret` 从 Vault 的 `shopee_sync_secret` 读。
  - 先 unschedule 同名的 job，写法照 `20260704_schedule_daily_kpi_email.sql`。
- Realtime：`ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;`

- [ ] **Step 1: 写会失败的 contract test：**
  - cron 排程是 `*/15 * * * *`。
  - 网址和 header 名称正确。
  - 没有把 secret 写死，而是从 `vault.decrypted_secrets` 读。
  - realtime 那个文件里有 `supabase_realtime` 和 `public.orders`。
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 写两个 migration。**
- [ ] **Step 4: 跑测试，预期 PASS。**
- [ ] **Step 5: Commit** `feat(db): schedule shopee sync and enable orders realtime`

### Task 9: Shopee 设置页

**Files:**
- Create: `app/(dashboard)/more/shopee/page.tsx`、`components/shopee/connection-card.tsx`、`components/shopee/listing-map-editor.tsx`、`components/shopee/sync-queue-list.tsx`、`lib/actions/shopee.ts`
- Modify: `app/(dashboard)/more/page.tsx`（`LINKS` 加 `{ href: "/more/shopee", label: "Shopee 同步", detail: "连接、商品对应、待处理订单" }`）、`supabase/migrations/20261105000100_add_shopee_sync.sql`
- Test: `lib/shopee/settings-actions.test.ts`（输入检查的纯函数）

**Interfaces:**
- 在 migration 里加：
  - `public.get_shopee_connection_status() RETURNS TABLE(connected boolean, shop_id bigint, refresh_expires_at timestamptz, sync_start_at timestamptz, last_synced_until timestamptz, consecutive_failures int, last_sync_error text)`：`SECURITY DEFINER`，`GRANT` 给 authenticated，**不回传 token**。
  - `public.start_shopee_sync() RETURNS timestamptz`：只在 `sync_start_at IS NULL` 时设成 `now()`，回传那个值。`GRANT` 给 authenticated。
  - 这两个函数各加一个 postgres 测试，放进 `apply-order.postgres.test.ts`：`status hides tokens`、`start_shopee_sync only sets once`。
- `lib/actions/shopee.ts`：
  - `getShopeeSettings()`：回传连接状态、对应表、还没解决的 queue。queue 里 `unmapped_item` 的 `detail.items` 要去重，列成"需要对应的商品"。
  - `startShopeeSync()`
  - `syncShopeeNow()`：`pollShopeeOrders(deps, { allowRefresh: false })`
  - `saveListingMapping(input: { item_id: number; model_id: number; item_name: string; model_name: string; sku: string; pack_size: PackSize })`
  - `resolveSyncQueueItem(orderSn: string)`
  - 都要检查登录，完成后 `revalidatePath('/more/shopee')`。

页面内容：
1. **连接卡：**
   - 还没连接：显示"连接 Shopee"按钮（`/api/shopee/connect`）。
   - 已连接：显示 shop id、token 到期日、上次同步"x 分钟前"、"立即同步"按钮。
   - `sync_start_at` 是 null 时，显示"开始自动同步"按钮，按之前要确认，提示"从现在起，新的 Shopee 订单不再手动录"。
   - `consecutive_failures > 0` 时，显示红字错误。
2. **需要对应的商品：** 每个 Shopee 商品/款式一行，选 SKU（products 下拉）和 pack size，按"保存"。下面列出已经对应好的，可以修改。
3. **待处理订单：**
   - `return_review`：显示"去处理"连结到 `/orders/<order_id>`，加上"已处理"按钮。
   - `error`：显示错误信息和"已处理"按钮。

- [ ] **Step 1: 写会失败的测试**：`saveListingMapping` 的输入检查（`pack_size` 不合法、`sku` 是空的，都要拒绝），以及上面两个 postgres 测试。
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现 actions 和页面。** 用 `components/ui` 和 `PageHeader` 现有的样式。
- [ ] **Step 4:** 执行 `npx vitest run lib/shopee`、`npm run typecheck`、`npm run lint`，预期 PASS。再用 `npm run dev` 打开 `/more/shopee`，确认页面在"还没连接"的状态下能正常显示。
- [ ] **Step 5: Commit** `feat(shopee): settings page for connection, mapping and queue`

### Task 10: 订单页的标签、提醒和自动刷新

**Files:**
- Create: `components/shell/shopee-live-refresh.tsx`
- Modify: `components/orders/orders-list-client.tsx`、`app/(dashboard)/orders/page.tsx`、`app/(dashboard)/layout.tsx`、`components/orders/new-order-form.tsx`、`app/(dashboard)/orders/new/page.tsx`
- Test: `lib/orders/shopee-ui-contract.test.ts`（照 `search-ui-contract.test.ts` 的写法）

各个改动：
- **订单列表：**
  - `order.source === 'shopee_api'` 时，在订单号后面加一个小标签 `API`。
  - 页面顶部显示"Shopee 上次同步：x 分钟前"。
  - 有还没解决的 queue 时，显示 `N 张 Shopee 订单需要处理 →`，连到 `/more/shopee`。数据从 `getShopeeSettings()` 的精简版拿。
- **`ShopeeLiveRefresh`：**
  - 用 `lib/supabase/client.ts` 订阅 `postgres_changes`（`INSERT` / `UPDATE` on `public.orders`，filter `source=eq.shopee_api`）。
  - 收到就 `router.refresh()`。`INSERT` 时再加 `toast('新 Shopee 订单 #<order_id>')`（sonner）。
  - 放在 dashboard layout 里，unmount 时 `removeChannel`。
- **新增订单表单：**
  - 新增 prop `shopeeSyncLive: boolean`（page 传入 `sync_start_at != null`）。
  - 选 `channel === 'shopee'` 送出时，先 `confirm('Shopee 订单已自动同步，确定要手动录？')`。

- [ ] **Step 1: 写会失败的 contract test**：列表里有 `source === "shopee_api"` 的判断；layout 里有 `ShopeeLiveRefresh`；表单里有那段确认文字。
- [ ] **Step 2: 跑测试，预期 FAIL。**
- [ ] **Step 3: 实现。**
- [ ] **Step 4:** 执行 `npx vitest run`、`npm run typecheck`、`npm run lint`，预期 PASS。用 `npm run dev` 打开 `/orders` 和 `/orders/new`，确认没有 console error。
- [ ] **Step 5: Commit** `feat(orders): shopee badges, sync banner and live refresh`

### Task 11: 本地脚本改用 dashboard 的 token

**Files:**
- Modify: `scripts/shopee-orders.py`

**Interfaces:**
- Consumes：`GET https://dashboard.sheepiesleep.com/api/shopee/token`（header `x-shopee-sync-secret`，值从 `.env.local` 的 `SHOPEE_SYNC_SECRET` 读）。

改动：
- `token()` 改成调用上面的 API。
- 删掉 `auth`、`token <url>` 这两个指令，以及 `save_token`、`.shopee/token.json` 的读写。
- 说明文字改成"授权请在 dashboard → More → Shopee 同步"。
- `orders` 指令维持不变。

- [ ] **Step 1:** 改完后执行 `python3 scripts/shopee-orders.py`，预期印出新的说明文字；`python3 -m py_compile scripts/shopee-orders.py`，预期没有错误。
- [ ] **Step 2: Commit** `chore(scripts): read shopee token from dashboard`

（实际拉单要等 Task 12 上线后才能验证，验证步骤写在 Task 12 第 9 步。）

### Task 12: 上线（需要用户一起操作）

这个 Task 不写代码，每一步完成都要跟用户确认。

- [ ] **1.** 用户在 Shopee Open Platform **重新生成 Live Partner Key**。新的 key 设到 Vercel 和 `.env.local`。
- [ ] **2.** 在 Vercel 设定：`SHOPEE_PARTNER_ID=2042739`、`SHOPEE_PARTNER_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SHOPEE_SYNC_SECRET`（`openssl rand -hex 32`），以及**测试用的** `SHOPEE_PUSH_PARTNER_KEY`。在 Supabase Vault 建 `shopee_sync_secret`，值跟 `SHOPEE_SYNC_SECRET` 一样。
- [ ] **3.** 对 production 执行三个 migration，merge 并部署。
- [ ] **4.** 用户打开 `/more/shopee`，按"连接 Shopee"，同意授权。确认页面显示已连接。
- [ ] **5.** **测试推送：**
  - Test Call Back URL 填推送网址，按 Verify and Save。
  - 在 `order_status_push` 那一行按 Push Test Data。
  - 在 Push Log 和 Vercel log 确认收到了、回了 200、签名验证通过。测试订单应该被忽略，不会建单（因为还没开始同步）。
- [ ] **6.** **打开正式推送：**
  - 打开 Get Live Push，填同一个网址，勾选 `order_status_push`。
  - 用 `vercel inspect` 查 Vercel 的部署地区，Deployment Service Area 选离那里最近的。
  - 把 `SHOPEE_PUSH_PARTNER_KEY` 换成 Live Push Partner Key，重新部署，然后保存。
- [ ] **7.** **商品对应：** 等第一批订单进到"需要对应的商品"，或者先用 10 月的 `escrow.csv` 里的 `item_id`/`model_id` 预先建好，大约 15 种组合。
- [ ] **8.** **用户按"开始自动同步"。**
  - 对一下 Seller Center 的"待出货"清单：上线前下单、还没安排出货的单，照原来的方式手动录。
  - 实际安排出货一张单，确认几秒内出现在 `/orders`，有 `API` 标签，打开中的页面自动刷新，库存也扣了。
- [ ] **9.** 执行 `python3 scripts/shopee-orders.py orders <今天> <今天> /tmp/check.csv`，确认本地脚本能用 dashboard 的 token 拉单。然后删除 `.shopee/token.json`。
- [ ] **10.** 一天后看 `/more/shopee`：没有错误，推送和定时拉单都有在跑。
