# Order Entry Improvements

New automation features to make order entry faster and easier!

---

## ✅ New Features

### 1. Auto-Generated Order IDs

Order IDs are now **automatically generated** based on:
- **Channel** (Shopee, Tokopedia, TikTok, Offline)
- **Order Date**
- **Sequential number** (queries database for next number)

**Format:** `CHANNEL-YYYYMMDD-XXX`

**Examples:**
- `SHOPE-20260103-001` (First Shopee order on Jan 3, 2026)
- `TOKOP-20260103-001` (First Tokopedia order on Jan 3, 2026)
- `TOKOP-20260103-002` (Second Tokopedia order on Jan 3, 2026)

**How it works:**
1. Select a **channel** (e.g., Shopee)
2. Select a **date** (defaults to today)
3. Order ID **auto-populates** with the next available number
4. **Still editable** if you need to override

---

### 2. Auto-Populated Selling Prices

Default selling prices are now **automatically filled** when you select a product!

**Default Prices:**
- **Cervi-001** (CerviCloud Pillow): Rp 880,000
- **Cervi-002** (Cervi Case): Rp 198,000
- **Lumi-001** (LumiCloud Eye Mask): Rp 180,000
- **Calmi-001** (CalmiCloud Ear Plug): Rp 49,000

**How it works:**
1. Click "Add Product"
2. Select a **product** from dropdown
3. Price **auto-fills** with default price
4. **Still editable** if you need a different price (promo, discount, etc.)

---

## How to Use

### Creating a New Order

1. **Go to** `/orders/new` (or click "Create Order" button)

2. **Select Channel & Date:**
   - Channel: Shopee / Tokopedia / TikTok / Offline
   - Date: Defaults to today
   - **Order ID auto-generates!** (e.g., `SHOPE-20260103-001`)

3. **Add Products:**
   - Click "Add Product"
   - Select product (e.g., Cervi-001)
   - **Price auto-fills!** (e.g., 880,000)
   - Adjust quantity if needed
   - Adjust price if needed (for discounts, promos, etc.)

4. **Set Order Status:**
   - **Paid** (default) → Creates OUT_SALE ledger entries
   - Shipped → Updates status
   - Cancelled / Returned → Creates RETURN ledger entries

5. **Add Optional Info:**
   - Channel fees (if tracking)
   - Notes (customer name, special instructions, etc.)

6. **Submit!**

---

## Examples

### Example 1: Quick Standard Order

**Scenario:** Customer buys 1 CerviCloud Pillow on Shopee today for standard price.

**Steps:**
1. Select Channel: **Shopee**
2. Date: **Today** (auto-filled)
3. Order ID: **SHOPE-20260103-001** (auto-generated)
4. Click "Add Product"
5. Select: **Cervi-001**
6. Quantity: **1** (default)
7. Price: **880,000** (auto-filled)
8. Status: **Paid** (default)
9. Click "Create Order"

**Time saved:** ~30 seconds (no typing order ID or price!)

---

### Example 2: Promo Order with Custom Price

**Scenario:** Customer buys 2 Cervi Cases at promo price of 170,000 each.

**Steps:**
1. Select Channel: **Tokopedia**
2. Date: **Today**
3. Order ID: **TOKOP-20260103-001** (auto-generated)
4. Click "Add Product"
5. Select: **Cervi-002**
6. Quantity: **2**
7. Price: **198,000** (auto-filled) → Change to **170,000**
8. Status: **Paid**
9. Click "Create Order"

**Still editable!** You can override any auto-filled value.

---

### Example 3: Multi-Item Order

**Scenario:** Customer buys 1 Pillow + 1 Eye Mask on offline store.

**Steps:**
1. Select Channel: **Offline**
2. Date: **Today**
3. Order ID: **OFFLI-20260103-001** (auto-generated)
4. Click "Add Product"
5. Select: **Cervi-001**, Quantity: **1**, Price: **880,000** (auto)
6. Click "Add Product" again
7. Select: **Lumi-001**, Quantity: **1**, Price: **180,000** (auto)
8. **Total:** Rp 1,060,000 (auto-calculated)
9. Status: **Paid**
10. Click "Create Order"

---

## Benefits

✅ **Faster order entry** - No typing repetitive info
✅ **Fewer errors** - Auto-generated IDs are always unique
✅ **Consistent pricing** - Default prices reduce mistakes
✅ **Still flexible** - Override any field when needed
✅ **Audit trail** - Sequential IDs make tracking easier

---

## Updating Default Prices

If you need to change default selling prices, update this file:

**File:** `app/(dashboard)/orders/new/page.tsx`

**Line 26-31:**
```typescript
const DEFAULT_PRICES: Record<string, number> = {
  'Cervi-001': 880000,  // CerviCloud Pillow
  'Cervi-002': 198000,  // Cervi Case
  'Lumi-001': 180000,   // LumiCloud Eye Mask
  'Calmi-001': 49000,   // CalmiCloud Ear Plug
}
```

Change the numbers to your new default prices.

---

## Technical Details

### Order ID Generation

- **Server Action:** `generateNextOrderId()` in `lib/actions/orders.ts`
- **Query:** Finds highest existing order ID for channel+date
- **Increment:** Adds 1 to sequence number
- **Format:** 3-digit padded (001, 002, ..., 999)

### Price Auto-Fill

- **Trigger:** When SKU is selected in line item
- **Lookup:** Matches SKU to `DEFAULT_PRICES` map
- **Update:** Sets `selling_price` field automatically
- **Override:** User can still type a different price

---

Enjoy faster order entry! 🚀
