# Finance SOP

## Purpose

This dashboard uses an operations finance model.

Use it to answer 3 different questions:

- `P&L`: Are we profitable?
- `Cash Flow`: Where did money move?
- `Accounts`: How much money is in each bank, cash, or e-wallet account?

This is **not** a full accounting system. It is designed to keep operations practical, consistent, and accurate enough for day-to-day decisions.

## Core Rules

1. Orders drive revenue automatically.
2. COGS is automatic. Do not enter it manually.
3. Inventory purchase is cash out + stock in. It is not an immediate P&L expense.
4. Transfers move money between our own accounts only.
5. Every real money movement should be attached to an account.
6. If the same event already has an automatic flow, do not log it a second time manually.

## What Each Module Means

### Accounts

Use `Accounts` for real money containers:

- bank accounts
- cash
- e-wallets

Examples:

- `BCA Operational`
- `Jago Ads`
- `Cash`
- `GoPay`

Balance logic:

- opening balance
- plus money in
- minus money out
- plus incoming transfers
- minus outgoing transfers

### Finance Entries

Use `Finance Entries` for manual money movements such as:

- salary
- rent
- software subscriptions
- packaging
- shipping expense not already captured elsewhere
- tax
- misc operating expense
- other income
- adjustments

### Transfers

Use `Transfers` only when moving money between your own accounts.

Examples:

- `BCA Operational -> Jago Ads`
- `Cash -> BCA Operational`

Transfer rules:

- affects account balances
- does not affect profit
- does not count as expense
- does not count as income

### Restock Workflow

Use the `Restock` tab when ordering from suppliers.

This flow splits cash timing from stock timing:

- `order_date` records when cash leaves for the supplier
- `arrival_date` records when stock reaches the Indonesia warehouse
- stock enters the ledger automatically only when the batch is marked `arrived`
- the supplier cash-out still lands in Finance on the original `order_date`

### Ad Spend

Ad spend has 2 layers:

- `ad_spend_entries`: campaign spend tracking
- optional linked `finance_entry`: bank/cash movement

If a funding account is selected when adding ad spend:

- campaign spend updates
- P&L updates
- account balance updates

If no funding account is selected:

- campaign spend updates
- P&L updates
- account balance does not move

## P&L Logic

P&L is calculated from a mix of automatic and manual data.

Included in P&L:

- Revenue from orders
- Channel fees from orders
- COGS from sold products
- Ad spend from ad spend entries
- Operating expenses from finance entries
- Other income from finance entries
- Adjustments when intentionally used

Not included in P&L:

- inventory purchases
- transfers between own accounts

Formula:

1. Gross Revenue
2. Less Channel Fees
3. Net Sales
4. Less COGS
5. Gross Profit
6. Less Ad Spend
7. Less Operating Expenses
8. Plus Other Income
9. Plus or minus Adjustments
10. Net Profit

## Cash Flow Logic

Cash flow tracks actual money movement.

Included:

- money in from finance entries
- money out from finance entries
- inventory purchase cash-out
- linked ad spend cash-out

Transfers:

- affect account balances
- should not be read as profit or loss

## Restock Rule

This is the most important finance rule in the dashboard.

When buying stock:

- use `Restock`
- select the account used to pay
- add the products and quantities purchased
- mark the batch `arrived` only when the shipment reaches the warehouse

Do **not**:

- log the same purchase as a normal expense
- log the same purchase as COGS
- create a second manual ledger stock-in for the same purchase

Reason:

- purchase of stock is an asset conversion
- cash goes down now
- stock goes up now
- COGS is recognized later when products are sold

## What To Log Where

### Salary

Log as:

- `Finance Entry`
- category: `Salary`
- direction: `out`
- choose paying account

### Software Subscription

Log as:

- `Finance Entry`
- category: `Software`
- direction: `out`

### Rent

Log as:

- `Finance Entry`
- category: `Rent`
- direction: `out`

### Packaging

Log as:

- `Finance Entry`
- category: `Packaging`
- direction: `out`

### Other Income

Log as:

- `Finance Entry`
- category: `Other Income`
- direction: `in`

### Bank Balance Correction

Log as:

- `Finance Entry`
- category: `Adjustment`
- direction: `in` or `out`

Use only when the system balance is wrong and needs correction.

### Move Money Between Own Accounts

Log as:

- `Transfer`

Do not log as expense or income.

### Restock Product

Log as:

- `Inventory Purchase`

Do not log the same event separately in:

- `Finance Entry`
- manual stock ledger entry

### Ad Top-Up or Campaign Spend

Log as:

- `Ad Spend Entry`

Best practice:

- always select a funding account

This makes:

- campaign metrics correct
- P&L correct
- bank balance correct

### Marketplace Revenue

Current limitation:

- order revenue affects P&L
- marketplace payout does not automatically increase bank balance yet

So until payout sync exists, bank balance is only correct if you also log actual cash-ins manually when needed.

## Things We Must Not Do

- Do not create `COGS` as a finance expense category.
- Do not log inventory purchase as operating expense.
- Do not log the same supplier payment twice.
- Do not use `Transfer` for supplier payment.
- Do not use `Adjustment` for normal business spending.
- Do not create ad spend in Finance only if it should also exist in campaign reporting.

## Quick Examples

### Example 1: Restock 100 units

Situation:

- buy 100 units of `Calmicloud`
- pay `Rp 8.000.000` from `BCA Operational`

Correct action:

- create `Inventory Purchase`

Result:

- bank balance decreases
- stock increases
- P&L does not change immediately

### Example 2: Add Meta or TikTok ad spend

Situation:

- add ad spend `Rp 500.000`
- pay from `Jago Ads`

Correct action:

- create `Ad Spend Entry`
- select `Jago Ads` as funding account

Result:

- ad metrics update
- P&L includes ad spend
- `Jago Ads` balance decreases

### Example 3: Pay salary

Situation:

- salary payment `Rp 3.500.000`
- paid from `BCA Operational`

Correct action:

- create `Finance Entry`
- category `Salary`
- direction `out`

Result:

- P&L expense increases
- bank balance decreases

### Example 4: Move money to ads account

Situation:

- move `Rp 1.000.000` from `BCA Operational` to `Jago Ads`

Correct action:

- create `Transfer`

Result:

- one account decreases
- the other increases
- P&L does not change

### Example 5: Marketplace payout hits bank

Situation:

- Shopee payout `Rp 4.200.000` arrives in `BCA Operational`

Current temporary action:

- manually log a finance cash-in if you want bank balance to reflect it

Note:

- this does not replace order revenue
- it only reflects the real bank movement

## Daily Operating Routine

1. Use `Restock` for all supplier replenishment orders.
2. Use `Ad Spend` with funding account for ad top-ups.
3. Use `Finance Entries` for salary, rent, software, tax, packaging, and misc expenses.
4. Use `Transfers` for account-to-account movement.
5. Check `Accounts` if a balance looks wrong.

## Weekly Review Routine

1. Review account balances.
2. Check for missing operating expenses.
3. Check whether ad spend entries have funding accounts selected.
4. Review restock cash-outs against supplier payments.

## Monthly Review Routine

1. Review `P&L` for net profit.
2. Review `Cash Flow` for money movement.
3. Compare bank balances in dashboard vs actual bank balances.
4. Use `Adjustment` only if reconciliation shows a real mismatch.

## Current System Limitations

At the moment:

- order revenue improves P&L automatically
- marketplace payouts do not auto-hit bank balance yet
- old ad spend entries may still be unlinked to finance
- initial campaign spend may still need manual handling if no funding account was chosen

## Team Rule Of Thumb

When unsure, ask:

- Is this profit logic?
- Is this real money movement?
- Is this stock purchase?

Then use:

- `P&L rule` for profitability
- `Finance Entry / Transfer / Account` for cash movement
- `Restock` for supplier replenishment
