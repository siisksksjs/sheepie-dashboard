# Notion to IOMS Import Guide

Complete guide for importing your historical data from Notion into the Sheepie IOMS.

---

## Overview

The import process has 3 sequential steps:
1. **Products** - Import product catalog with COGS
2. **Initial Stock** - Set starting inventory levels
3. **Orders** - Import historical order data

**Important:** Complete steps in order! Orders depend on products existing first.

---

## Access the Import Tool

1. Start your dev server: `npm run dev`
2. Navigate to: `http://localhost:3001/import`
3. Or click **"Import Data"** in the sidebar (Admin section)

---

## Step 1: Import Products

### From Notion "Modal Product" Table

Your Notion table shows:
- **Items/Products**: CerviCloud, CerviCloud Pillow Case, LumiCloud, CalmCloud
- **COGS**: 192000, 40000, 4000, 4000

### Create CSV File: `products.csv`

```csv
sku,name,variant,cost_per_unit,reorder_point,is_bundle,status
CERVI-PILLOW,CerviCloud Pillow,,192000,10,false,active
CERVI-CASE,CerviCloud Pillow Case,,40000,20,false,active
LUMI-MASK,LumiCloud EyeMask,,4000,30,false,active
CALM-EARPLUG,CalmCloud EarPlug,,4000,30,false,active
```

### Field Mapping

| CSV Column | Notion Source | Example | Notes |
|------------|---------------|---------|-------|
| `sku` | Create unique ID | `CERVI-PILLOW` | Use product abbreviation + type |
| `name` | Items/Products | `CerviCloud Pillow` | Full product name |
| `variant` | N/A | Leave blank | Or specify: "Blue", "Large", etc. |
| `cost_per_unit` | COGS | `192000` | Cost in IDR (no decimals) |
| `reorder_point` | Set manually | `10` | Alert threshold |
| `is_bundle` | N/A | `false` | For single products |
| `status` | N/A | `active` | Or `discontinued` |

### Upload

1. Click **"Download Template"** to see format
2. Create your `products.csv` file
3. Click **"Upload CSV"** in Step 1 card
4. Verify success count matches your product count
5. Click **"Continue to Step 2 →"**

---

## Step 2: Import Initial Stock

### Determine Starting Inventory

Before importing orders, you need to set the stock level **before** your first historical order.

**Formula:**
```
Initial Stock = Current Physical Stock + Total Historical Sales - Total Historical Returns
```

For example:
- Current stock: 50 CerviCloud Pillows
- Historical sales from Notion: 117 total orders
- Historical returns: 0
- **Initial stock to import: 167**

### Create CSV File: `initial_stock.csv`

```csv
sku,quantity,reference
CERVI-PILLOW,167,Initial stock before historical orders
CERVI-CASE,200,Initial stock before historical orders
LUMI-MASK,150,Initial stock before historical orders
CALM-EARPLUG,100,Initial stock before historical orders
```

### Field Mapping

| CSV Column | Source | Example | Notes |
|------------|--------|---------|-------|
| `sku` | Match products | `CERVI-PILLOW` | Must match Step 1 SKUs |
| `quantity` | Calculate | `167` | Stock level before first order |
| `reference` | Description | `Initial stock...` | Any note you want |

### Upload

1. Click **"Download Template"**
2. Create your `initial_stock.csv`
3. Click **"Upload CSV"** in Step 2 card
4. System creates `IN_PURCHASE` ledger entries
5. Click **"Continue to Step 3 →"**

---

## Step 3: Import Historical Orders

### From Notion Product Tables

Looking at your Notion screenshot:
- **CerviCloud Pillow**: 83 Tokopedia + others
- Each table has: Date, Account (channel), Quantity, Price, Status

### Create Order IDs

Format: `{CHANNEL}-{DATE}-{SEQUENCE}`

Examples:
- `TOKO-20250115-001`
- `SHOPEE-20250115-002`
- `OFFLINE-20250115-003`

### Create CSV File: `orders.csv`

```csv
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
TOKO-20250101-001,tokopedia,2025-01-01,CERVI-PILLOW,1,198000,5000,,paid
TOKO-20250102-001,tokopedia,2025-01-02,CERVI-PILLOW,1,198000,5000,,paid
SHOPEE-20250103-001,shopee,2025-01-03,CERVI-CASE,2,45000,3000,,paid
OFFLINE-20250104-001,offline,2025-01-04,CERVI-PILLOW,1,198000,0,,paid
TIKTOK-20250105-001,tiktok,2025-01-05,LUMI-MASK,1,8000,800,,paid
```

### Multi-Product Orders

If one order has multiple products, use same `order_id`:

```csv
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
TOKO-20250101-001,tokopedia,2025-01-01,CERVI-PILLOW,1,198000,5000,,paid
TOKO-20250101-001,tokopedia,2025-01-01,CERVI-CASE,1,45000,0,,paid
```

**Note:** Channel fees only on first line to avoid double-counting.

### Field Mapping

| CSV Column | Notion Source | Example | Notes |
|------------|---------------|---------|-------|
| `order_id` | Create unique ID | `TOKO-20250101-001` | Use channel-date-sequence |
| `channel` | Account column | `tokopedia` | Lowercase: `tokopedia`, `shopee`, `offline`, `tiktok` |
| `order_date` | Date column | `2025-01-01` | Format: `YYYY-MM-DD` |
| `sku` | Match product | `CERVI-PILLOW` | Must exist from Step 1 |
| `quantity` | Quantity | `1` | Units sold |
| `selling_price` | Price | `198000` | Price per unit (IDR) |
| `channel_fees` | Calculate % | `5000` | Optional, for profit tracking |
| `notes` | Notes | Any text | Optional |
| `status` | N/A | `paid` | Historical orders = `paid` |

### Channel Fee Examples

Based on typical Indonesian marketplace fees:
- **Tokopedia**: ~2.5% → `198000 × 0.025 = 4950` → round to `5000`
- **Shopee**: ~2% → `45000 × 0.02 = 900` → round to `900`
- **Offline**: 0
- **TikTok**: ~5% → `8000 × 0.05 = 400`

### Upload

1. Click **"Download Template"**
2. Create your `orders.csv` (this will be large!)
3. Click **"Upload CSV"** in Step 3 card
4. System will:
   - Create order records
   - Auto-generate `OUT_SALE` ledger entries
   - Reduce stock levels
5. Verify success count matches your order count
6. Click **"Go to Dashboard"**

---

## What Happens Under the Hood

### Products Import
```
CSV Row → createProduct() → products table
```

### Stock Import
```
CSV Row → createLedgerEntry(IN_PURCHASE) → inventory_ledger table
```

### Orders Import
```
CSV Row → createOrder() → orders + order_line_items tables
↓
Auto-trigger: createLedgerEntry(OUT_SALE) → inventory_ledger table
↓
Stock reduces automatically (computed from ledger)
```

### Ledger Integrity

**Ledger-first architecture guarantees:**
- Stock = SUM(ledger quantities)
- Initial stock = `+167` ledger entry
- Each order = `-1` ledger entry (or `-quantity`)
- Final stock = Initial + Purchases - Sales
- Full audit trail preserved

---

## Extracting Data from Notion

### Method 1: Manual CSV Export (Recommended)

1. Open each Notion database (CerviCloud Pillow, CerviCloud Pillow Case, etc.)
2. Click **"..."** (three dots) → **"Export"**
3. Format: **CSV**
4. Include subpages: **No**
5. Download and combine into single `orders.csv`

**Combine multiple CSVs:**
```bash
# On Mac/Linux terminal
cat cervicloud-pillow.csv cervicloud-case.csv > combined.csv
# Remove duplicate headers manually in text editor
```

### Method 2: Copy-Paste to Spreadsheet

1. Select all rows in Notion table
2. Copy (Cmd+C / Ctrl+C)
3. Paste into Google Sheets / Excel
4. Add header row: `order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status`
5. Fill in columns (especially `order_id` and `sku`)
6. Export as CSV

### Method 3: Notion API (Advanced)

If you have 1000+ orders, consider using Notion API:
```bash
npm install @notionhq/client
# Write script to fetch and transform data
```

---

## Verification Checklist

After importing all data:

### Check Products
- [ ] Go to `/products`
- [ ] Verify all 4 products exist
- [ ] Verify COGS matches Notion

### Check Stock Levels
- [ ] Go to `/dashboard`
- [ ] Check "Stock on Hand" table
- [ ] Stock should = Initial - Total Orders
- [ ] Example: 167 initial - 117 orders = 50 current

### Check Ledger
- [ ] Go to `/ledger`
- [ ] Find initial stock entries (IN_PURCHASE)
- [ ] Find order entries (OUT_SALE)
- [ ] Count should match: 4 products + 117 orders = 121 entries minimum

### Check Orders
- [ ] Go to `/orders`
- [ ] Verify order count matches Notion (117 total)
- [ ] Spot-check dates, channels, quantities
- [ ] Click an order → verify line items

### Check Reports
- [ ] Go to `/reports`
- [ ] "Sales by Product" → verify units sold
- [ ] "Sales by Channel" → verify order counts:
  - Tokopedia: 83 orders
  - Shopee: 31 orders
  - Offline: 2 orders
  - TikTok: 1 order
- [ ] Total Revenue should match sum of all selling prices

---

## Common Issues & Solutions

### "Product SKU not found"
**Problem:** Order CSV references SKU that doesn't exist
**Solution:** Import products first (Step 1), ensure SKU matches exactly

### "Stock going negative"
**Problem:** Initial stock too low
**Solution:** Increase initial stock quantity in Step 2. Use formula:
```
Initial = Current + Historical Sales - Historical Returns
```

### "Failed to parse CSV"
**Problem:** CSV format incorrect (wrong delimiter, missing headers)
**Solution:** Download template, match format exactly, ensure comma-separated

### "Duplicate order_id"
**Problem:** Same order_id used twice
**Solution:** Make order IDs unique using `{channel}-{date}-{sequence}` format

### Import shows partial success
**Problem:** Some rows failed
**Solution:**
1. Check error messages in red alert box
2. Fix those specific rows in CSV
3. Re-upload (system will skip duplicates for products)

---

## Sample Data for Testing

Before importing real data, test with sample:

**products_test.csv**
```csv
sku,name,variant,cost_per_unit,reorder_point,is_bundle,status
TEST-001,Test Product 1,,10000,5,false,active
TEST-002,Test Product 2,,20000,10,false,active
```

**stock_test.csv**
```csv
sku,quantity,reference
TEST-001,100,Test initial stock
TEST-002,50,Test initial stock
```

**orders_test.csv**
```csv
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
TEST-001,tokopedia,2025-01-01,TEST-001,2,15000,300,Test order,paid
TEST-002,shopee,2025-01-02,TEST-002,1,25000,500,Test order,paid
```

**Expected Results:**
- 2 products created
- Stock: TEST-001 = 98 (100 - 2), TEST-002 = 49 (50 - 1)
- 2 orders created
- 4 ledger entries (2 IN_PURCHASE + 2 OUT_SALE)

---

## Performance Notes

- **Products**: Fast (~100ms per product)
- **Stock**: Fast (~100ms per entry)
- **Orders**: Slower (~500ms per order, includes ledger generation)

**For large imports:**
- 100 orders = ~50 seconds
- 500 orders = ~4 minutes
- 1000 orders = ~8 minutes

Browser may show "loading" - this is normal! Don't refresh.

---

## After Import: Next Steps

1. **Verify Data**: Use checklist above
2. **Delete Test Data**: If you imported test products, mark as `discontinued`
3. **Set Reorder Points**: Adjust based on actual sales velocity
4. **Create Bundles**: If you have product bundles, define them in `/products/[sku]/bundles`
5. **Go Live**: Start creating new orders through the system!

---

## Need Help?

**Common questions:**

**Q: Can I import orders in multiple batches?**
A: Yes! System will skip duplicate `order_id`. Split by month if needed.

**Q: What if I made a mistake in imported data?**
A: Don't delete! Create ADJUSTMENT ledger entries to fix stock. For orders, cancel them.

**Q: Can I re-import if something goes wrong?**
A: Products will error on duplicate SKU. Delete products first or use different SKUs. Orders will error on duplicate order_id.

**Q: How do I handle returned orders?**
A: Change order status to "Returned" - system auto-creates RETURN ledger entries.

---

## Your Notion Data Structure

Based on your screenshot:

**Sales Channels:**
- Tokopedia: 83 orders
- Shopee: 31 orders
- Offline: 2 orders
- TikTok: 1 order
- **Total: 117 orders**

**Products:**
1. CerviCloud Pillow (COGS: 192,000)
2. CerviCloud Pillow Case (COGS: 40,000)
3. LumiCloud EyeMask (COGS: 4,000)
4. CalmCloud EarPlug (COGS: 4,000)

**Recommended Import Plan:**
1. Import 4 products → expect 4 successes
2. Import initial stock for 4 products → expect 4 successes
3. Import 117 historical orders → expect 117 successes

**Estimated Total Time:** ~10-15 minutes for all 3 steps

---

Good luck with your import! 🚀
