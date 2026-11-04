# Shopee 订单自动同步 设计

## 摘要

把 Shopee 订单通过 Shopee Open Platform API 自动同步进 dashboard，取代手动录单。

核心规则：**卖家在 Seller Center 安排出货（Arrange Shipment）之后，订单才进 dashboard 并扣库存；快递取件之后自动改成 `shipped`。** 买家付款但还没安排出货的订单，不进 dashboard。

同步是实时的：Shopee 订单状态一变，就会主动推送（Push Mechanism）给 dashboard，几秒内入账。另外每 15 分钟定时拉一次，补上漏掉的推送。

## 背景

- 10 月的 campaign audit 里已经用 `scripts/shopee-orders.py` 接上了 Shopee API（Live Partner ID `2042739`），可以拉到订单、商品、状态和金额。
- token 目前存在本地 `.shopee/token.json`。授权时借用了 `https://dashboard.sheepiesleep.com/favicon.ico` 这个跳转网址来拿授权码。
- dashboard 目前全靠手动录单。Shopee 订单号的格式是 `SHOPE-YYYYMMDD-NNN`，跟 Shopee 的 `order_sn` 对不上。
- 订单是 `paid` / `shipped` 时扣库存。状态变化走 `update_order_status_with_inventory` 这个 RPC。

## 目标

1. 在 Seller Center 按下安排出货后，订单几秒内就出现在 dashboard，库存同时扣掉。推送漏掉的话，最晚 15 分钟内由定时拉单补上。
2. 快递取件后自动改成 `shipped`。取消、退货也会自动同步。
3. 同一张订单不管同步几次，都只记一次，库存也只扣一次。
4. 在 dashboard 里就能授权 Shopee，token 只存在服务器上。
5. 新商品、退货这类需要人来判断的情况，不自动处理，放进"待处理"清单。

## 不做的事

1. 不改 10 月以前已经手动录好的订单，也不去对应或合并它们。
2. 不拉买家个人资料（PII 开关保持关闭）。
3. 不从 dashboard 反向操作 Shopee（比如安排出货、改库存）。

## 状态对应

| Shopee 状态 | 意思 | Dashboard |
|---|---|---|
| `UNPAID` | 还没付款 | 不建单 |
| `READY_TO_SHIP` | 已付款，还没安排出货 | 不建单 |
| `PROCESSED` | 已安排出货，等快递取件 | **建单，`paid`，扣库存** |
| `RETRY_SHIP` | 取件失败，重新安排 | 保持 `paid` |
| `SHIPPED` | 快递已取件 | **`shipped`** |
| `TO_CONFIRM_RECEIVE` | 已送达，等买家确认 | `shipped` |
| `COMPLETED` | 完成 | `shipped` |
| `IN_CANCEL` | 取消申请中 | 不改，等最终结果 |
| `CANCELLED` | 已取消 | `cancelled`，库存加回（按 `restock` 处理） |
| `TO_RETURN` | 退货 / 退款中 | 不改状态，放进"待处理"，由人选择 `restock` 还是 `dead_stock` |

补充规则：

- 第一次看到某张订单时，它可能已经跳过了 `PROCESSED`，比如两次同步之间就被取件了。这时直接按当时的状态建单。如果当时已经是 `shipped`，一样要扣库存。
- 如果第一次看到时已经是 `CANCELLED`，而且 dashboard 里没有这张单，就不建单。
- 状态只往前走。Shopee 返回的状态如果比 dashboard 旧，就忽略。

### 这个规则的取舍

**好处：** 买家在安排出货之前取消的单，不会在 dashboard 里建了又取消，库存也不会扣了又加回。安排出货就代表货真的要出仓了，跟仓库的实际情况一致。

**代价：**

1. **库存会晚一点扣。** 已付款、还没安排出货的单，dashboard 还看不到，所以这段时间 dashboard 上的库存会比实际可卖的多一点。以现在每天约 7 单的量，通常只差几个小时。第二阶段可以在 dashboard 上显示一个"Shopee 待安排出货 N 单"，只显示，不扣库存。
2. **每日 KPI 邮件可能少算。** `order_date` 用的是 Shopee 的下单时间，所以订单会算在正确的日期。但如果晚上下单、隔天早上才安排出货，午夜（雅加达时间）发出的邮件里不会有这张单。之后打开 dashboard 再看，那天的数字是对的。

## 架构

```
Seller Center 安排出货
        │
        ▼
Shopee ──推送（几秒内）──▶ /api/shopee/push ──┐
   ▲                                           │  验证签名 → get_order_detail
   │                                           ▼
   │                                   syncShopeeOrders(order_sn[]) ──▶ 商品对应 ──▶ RPC apply_shopee_order
   │                                           ▲                                          │
   └──每 15 分钟补漏── /api/shopee/sync ────────┘                                          ▼
                          ▲                                               orders / order_line_items /
                     pg_cron、"立即同步"按钮                                inventory_ledger（同一个 transaction）
                                                                                          │
                                                                                          ▼
                                                                   Supabase Realtime → 打开中的 dashboard 自动刷新
```

- **推送是主要的同步方式。** 在 Shopee Open Platform 的推送设定（Push Mechanism）里勾选订单状态推送（`order_status_push`），推送网址设成 `https://dashboard.sheepiesleep.com/api/shopee/push`。订单状态一变，Shopee 就会送来 `ordersn`、`status`、`update_time`。
- **定时拉单是备用。** 推送可能会漏，比如 dashboard 刚好在部署、或者网络有问题。所以每 15 分钟还是拉一次，用来补漏。
- 两条路都调用同一个 `syncShopeeOrders(order_sn[])`，后面的处理完全一样。同一张订单不管来几次，都只记一次（见 `apply_shopee_order`）。
- 拉单、推送、授权都写成 Next.js API route，跟 dashboard 部署在一起，可以直接用 `lib/` 里现有的代码。
- 定时触发用 Supabase 现有的 `pg_cron` + `net.http_post`，做法跟每日 KPI 邮件一样。请求里带一个密钥 header，比照 `NOTIFICATION_FUNCTION_SECRET` 的做法。
- dashboard 上的"立即同步"按钮也调用 `/api/shopee/sync`。

## 数据结构

### `marketplace_connections`（新表）

| 栏位 | 说明 |
|---|---|
| `channel` | `'shopee'` |
| `shop_id` | Shopee shop id |
| `access_token` / `refresh_token` | token |
| `access_expires_at` / `refresh_expires_at` | 到期时间 |
| `last_synced_until` | 上次成功同步到哪个时间点 |
| `sync_start_at` | 上线时间，只同步这个时间之后下单的订单 |

- 开 RLS，但不建任何 policy。只有 service role 能读写，前端读不到 token。
- **只有这里能续期 token。** Shopee 每次续期都会换一个新的 refresh token，旧的就失效了。所以只让每 15 分钟的定时同步续期：剩不到 1 小时就续。推送、"立即同步"、本地脚本都只读，不续期，这样就不会有两边同时续期的问题。
- 本地脚本 `scripts/shopee-orders.py` 改成通过 `/api/shopee/token`（要带密钥 header）拿 token，然后删掉 `.shopee/token.json`，不能再自己续期。

### `shopee_listing_map`（新表）

| 栏位 | 说明 |
|---|---|
| `item_id`, `model_id` | Shopee 商品 + 款式（组合不能重复） |
| `item_name`, `model_name` | 方便人看，比如 `Blue, Bundle of 2` |
| `sku` | 对应 `products.sku` |
| `pack_size` | `single` / `bundle_2` / `bundle_3` / `bundle_4` |

Shopee 上的商品目前都**没填 SKU**（10 月的 221 单 `model_sku` 全是空的），所以一定要有这张对应表。`Silence Darkness Kit` 这种组合商品，对应到 dashboard 里 `is_bundle = true` 的 SKU。

### `shopee_sync_queue`（新表，"待处理"清单）

记录同步时没办法自动处理的订单：

- `unmapped_item`：有商品还没在 `shopee_listing_map` 里配好
- `return_review`：Shopee 显示 `TO_RETURN`，要人选 `restock` 还是 `dead_stock`
- `error`：其他错误，附上错误信息

商品对应配好之后，`unmapped_item` 的订单在下一次同步时会自动重试。

### `orders`（加栏位）

- `source text not null default 'manual'`：`'manual'` 或 `'shopee_api'`
- `external_status text`：Shopee 的原始状态，方便对账
- `external_updated_at timestamptz`：Shopee 的 `update_time`，用来判断状态新旧

`order_id` 直接用 Shopee 的 `order_sn`，在 dashboard 搜得到，跟 Seller Center 里的也一样。现有的 `UNIQUE` 约束可以挡掉重复的单。

`order_date` 存成雅加达日期的 `YYYY-MM-DD`，跟手动录单一样。报表是按 `order_date` 的前 10 个字分日期的，如果存精确时间，雅加达凌晨 0–7 点的单会被算到前一天。精确的下单时间另外存在新栏位 `external_created_at`。

## 推送流程（`/api/shopee/push`）

1. 验证签名：Shopee 会在 `Authorization` header 里放 `HMAC-SHA256(key, 推送网址 + "|" + 原始 body)`。签名对不上就回 401，什么都不做。这里的 key 是推送设定页上的 **Push Partner Key**（环境变量 `SHOPEE_PUSH_PARTNER_KEY`），跟调用 API 用的 Partner Key 不是同一个。测试推送和正式推送各有自己的 key。
2. 不是订单状态推送，或者 `shop_id` 不是我们的：回 200，忽略。
3. **不直接用推送里的状态。** 拿推送里的 `ordersn` 调用 `get_order_detail`，用 API 返回的最新资料来处理。这样推送就算晚到或顺序乱了，结果也是对的。
4. 调用 `syncShopeeOrders([ordersn])`，然后回 200。现在的单量处理一张订单只要一两秒，可以在同一个请求里做完。
5. 处理失败也回 200，并把这张订单放进 `shopee_sync_queue`（`error`）。下一次定时拉单会再处理一次。

## 定时补漏流程（`/api/shopee/sync`）

1. 读 `marketplace_connections`。如果 access token 快过期了，先续期。
2. 调用 `get_order_list`：`time_range_field=update_time`，时间从 `last_synced_until - 1 小时` 到现在。往前多拉一小时，是为了补上边界附近可能漏掉的单。一次最多查 15 天。
3. 每 50 张调用一次 `get_order_detail`，拿 `item_list`、`total_amount`、`order_status`。
4. 每张订单：
   - `create_time` 早于 `sync_start_at`：跳过。
   - 状态对应到"不建单"，而且 dashboard 里也没有这张：跳过。
   - 任何一个商品找不到对应：放进 `shopee_sync_queue`（`unmapped_item`），跳过。
   - 其他情况：调用 `apply_shopee_order`。
5. 全部处理完之后，才更新 `last_synced_until`。中途失败的话，下次会从同一个时间点重来。

## 新 RPC：`apply_shopee_order`

一次处理一张订单。要么全部成功，要么全部不算。

- `SECURITY DEFINER`，只给 `service_role` 执行。现有的 `update_order_status_with_inventory` 会检查 `auth.uid()`，定时同步没有登录用户，所以不能直接用它。
- 订单不存在：建 `orders` 和 `order_line_items`，存 `cost_per_unit_snapshot`。如果状态是 `paid` / `shipped`，就写 `OUT_SALE` ledger，bundle 和 `pack_size` 的展开规则跟现有 RPC 一样。
- 订单已经存在：先锁住这一行。如果 `external_updated_at` 不比现在的新，就什么都不做。否则按状态对应表更新，库存变化的规则跟 `update_order_status_with_inventory` 一样。
- 库存变化的规则（bundle 展开、`pack_size` 倍数、退回库存）抽成一个两边都调用的内部函数，避免两份逻辑越改越不一样。
- `inventory_ledger.created_by` 记成 null，`reference` 写 `Order <order_sn> - Paid (Shopee sync)`，ledger 上看得出是自动记的。
- 写一笔 changelog，`action_summary` 写 "Synced from Shopee"。

line item 的价格用 `model_discounted_price`，数量用 `model_quantity_purchased`，`pack_size` 从对应表拿。

**价格口径：**`selling_price` 记的是卖家折扣后、Shopee 优惠券之前的价格，例如 Lumi 记 218,000。这跟手动录单的做法一样，Shopee 的销售报表也是用这个价格。
- 不能用 `total_amount`（买家实付）。2026 年 10 月有 156/168 单用了 Shopee 优惠券。券是 Shopee 出钱的，不影响我们的收入，但会让买家实付变低：10 月卖家折扣后的价格合计 Rp42.09M，买家实付只有 Rp36.91M。
- 有一点跟手动录单不同：Shopee 活动期间的单，会记成实际的活动价，比如 210,970。手动录单时一律记 218,000。

## 授权流程

1. 设置页加一个"连接 Shopee"按钮，跳到 `/api/v2/shop/auth_partner`，redirect 设成 `https://dashboard.sheepiesleep.com/api/shopee/callback`。网域跟 Shopee 后台设的一样，不用改设定。
2. `/api/shopee/callback` 先确认是已登录的 dashboard 用户，再拿 `code` 换 token，存进 `marketplace_connections`。
3. 页面显示：已连接的 shop、token 到期日、上次同步时间。

`/api/shopee/sync` 和 `/api/shopee/push` 要在 `middleware.ts` 里放行，不能跳去登录页。`sync` 改成检查密钥 header，`push` 改成验证 Shopee 签名。

Vercel 需要新增的环境变量：`SHOPEE_PARTNER_ID`、`SHOPEE_PARTNER_KEY`、`SHOPEE_PUSH_PARTNER_KEY`、`SUPABASE_SERVICE_ROLE_KEY`、`SHOPEE_SYNC_SECRET`。

## 界面

- **订单列表：** `source = 'shopee_api'` 的订单加一个 "Shopee" 标签。
- **自动刷新：** 用 Supabase Realtime 订阅 `orders` 表。有新的 Shopee 订单进来时，打开中的订单页和总览页会自动刷新，并跳出提示"新 Shopee 订单 #xxx"，不用手动重新整理。
- **页面顶部：** 显示"上次同步：x 分钟前"，旁边放"立即同步"按钮。
- **待处理：** 有项目的时候显示提醒，比如"2 张 Shopee 订单的商品还没对应 SKU"。
  - 点进去可以配 `item/model → sku + pack_size`。
  - 退货单可以选 `restock` 或 `dead_stock`。
- **手动录单：** 上线之后，如果有人手动建 `channel = shopee` 的订单，要提示"Shopee 订单已自动同步，确定要手动录？"，避免重复记录。

## 切换上线

1. 在 Shopee Open Platform **重新生成 Live Partner Key**（旧的在截图里完整出现过），更新到 Vercel 和 `.env.local`。
2. 部署后，在 dashboard 授权 Shopee。
3. **先测试推送**（Open Platform → Push Mechanism → Set Push → Get Test Push）：
   - 把 Test Push Partner Key 设成 `SHOPEE_PUSH_PARTNER_KEY`。
   - Test Call Back URL 填 `https://dashboard.sheepiesleep.com/api/shopee/push`，按 **Verify and Save**。Shopee 会先送一个验证请求，route 必须回 200 才能保存，所以这一步一定要在部署之后做。
   - 在订单推送那一行（`order_status_push`）按 **Push Test Data**，然后到 Push Log 和 dashboard 的 log 确认收到了、签名也验证通过。测试资料里的订单不是我们店的，应该被忽略，不会建单。
4. **再打开正式推送**：
   - 打开 Get Live Push，填同一个网址。
   - 勾选 `order_status_push`。
   - Deployment Service Area 选离 Vercel 部署地区最近的。
   - 把 `SHOPEE_PUSH_PARTNER_KEY` 换成 Live Push Partner Key，然后保存。
5. 配好现有商品的对应。可以用 10 月的订单资料先列出全部 `item/model` 组合，目前大约 15 种。
6. **不预先定日期，测试都通过就上线。** 按下上线的那一刻，`sync_start_at` 就记成当下的时间。从这一刻起，新的 Shopee 订单不再手动录。
   - 上线之前下单、上线后才安排出货的单不会自动同步，照原来的方式手动录。上线当天对一下 Seller Center 的"待出货"清单，把这些单补录完。
7. 跑一次同步，跟 Seller Center 对一下单数和金额。
8. 实际安排出货一张单，确认几秒内出现在 dashboard。

## 错误处理

- 续期失败（refresh token 过期，超过 30 天没用）：同步停止，dashboard 显示"需要重新连接 Shopee"，并发一封通知邮件（用现有的 notification events）。
- Shopee API 报错或请求超时：这次同步不更新 `last_synced_until`，下次重试。连续失败 3 次就发通知。
- 某一张订单处理失败：放进 `shopee_sync_queue`（`error`），不影响其他订单。
- 推送签名不对：回 401，记一笔 log。短时间内出现很多次，可能是 key 设错了，或者有人在乱打这个网址。
- 推送很久没进来：每次定时拉单时，检查有没有"拉单补上了、但推送没送到"的订单。如果最近 24 小时都靠补漏，就发通知，提醒去看推送设定。

## 测试

- `apply_shopee_order`：用 `pg-mem` / postgres 测试，参考 `return-status.postgres.test.ts`。
  - 新建 `paid` 的单会扣库存。
  - 一开始就是 `shipped` 的单会扣库存。
  - `paid` → `shipped` 不会再扣一次。
  - `CANCELLED` 会把库存加回。
  - 重复执行不会有变化。
  - 旧的状态会被忽略。
  - bundle 和 `pack_size` 有正确展开。
- 状态对应：每个 Shopee 状态都有单元测试。
- 同步流程：mock Shopee API，测试分页、15 天切段、商品没对应时放进待处理、`sync_start_at` 之前的单会跳过。
- 签名：用 Shopee 文件里的范例验证 API 请求的 HMAC 和推送的 HMAC。
- 推送 route：签名错误回 401；其他店的推送会被忽略；推送里的状态比 API 旧时，以 API 为准；处理失败仍然回 200，并放进待处理。

## 第二阶段以后

1. （已提前到第一版）建单和每次状态更新时调用 `get_escrow_detail`，`channel_fees = order_selling_price − escrow_amount`；还没完成的单是 Shopee 的预估，`COMPLETED` 后是最终数字。查询失败不影响同步，下次状态变化再试。
2. 显示"Shopee 待安排出货 N 单"，只显示，不扣库存。
3. Tokopedia / TikTok Shop 用同一套结构：`marketplace_connections`、对应表、待处理清单、`apply_*_order`。
