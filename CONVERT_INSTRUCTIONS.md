# How to Convert Your Notion Exports

I've already converted your CerviCloud Pillow orders! Here's how to convert the rest.

---

## What the Script Does

The `convert-notion-orders.py` script automatically:
- ✅ Changes delimiter from `;` to `,`
- ✅ Converts dates: "February 9, 2025" → "2025-02-09"
- ✅ Cleans prices: "IDR 612,000.00" → "612000"
- ✅ Trims channel names: "shopee  " → "shopee"
- ✅ Generates unique order IDs: "SHOPEE-20250209-001"
- ✅ Calculates channel fees automatically
- ✅ Handles refunds (status = "returned")
- ✅ Adds your product SKU to every row

---

## Already Converted

✅ **CerviCloud Pillow** → `cervi-pillow-orders.csv` (96 orders)

Breakdown:
- Tokopedia: 62 orders
- Shopee: 31 orders
- Offline: 2 orders
- TikTok: 1 order

---

## Convert Your Other Products

### Step 1: Export from Notion

Export each product table from Notion:
1. Open database (e.g., "CerviCloud Pillow Case")
2. Click `⋮⋮` → Export → CSV
3. Save the file

### Step 2: Run Conversion Script

For each product, run:

```bash
# CerviCloud Pillow Case
python3 convert-notion-orders.py "CerviCloud Pillow Case.csv" CERVI-CASE

# LumiCloud EyeMask
python3 convert-notion-orders.py "LumiCloud EyeMask.csv" LUMI-MASK

# CalmCloud EarPlug
python3 convert-notion-orders.py "CalmCloud EarPlug.csv" CALM-EARPLUG
```

**Replace the CSV filename** with your actual Notion export filename.

### Step 3: Combine All Orders (Optional)

If you want one big orders file:

```bash
# Create header
head -1 cervi-pillow-orders.csv > all-orders.csv

# Append all order files (skip headers)
tail -n +2 cervi-pillow-orders.csv >> all-orders.csv
tail -n +2 cervi-case-orders.csv >> all-orders.csv
tail -n +2 lumi-mask-orders.csv >> all-orders.csv
tail -n +2 calm-earplug-orders.csv >> all-orders.csv

echo "Combined all orders into all-orders.csv"
```

Or just import each file separately in the import page.

---

## Create Products CSV

Create a file called `products.csv`:

```csv
sku,name,variant,cost_per_unit,reorder_point,is_bundle,status
CERVI-PILLOW,CerviCloud Pillow,,192000,10,false,active
CERVI-CASE,CerviCloud Pillow Case,,40000,20,false,active
LUMI-MASK,LumiCloud EyeMask,,4000,30,false,active
CALM-EARPLUG,CalmCloud EarPlug,,4000,30,false,active
```

**Update `cost_per_unit`** with your actual COGS from Notion's "Modal Product" table.

---

## Create Initial Stock CSV

Calculate initial stock = current physical stock + total orders sold

Example:

```csv
sku,quantity,reference,entry_date
CERVI-PILLOW,250,Initial stock before Feb 2025,2025-02-01
CERVI-CASE,200,Initial stock before Feb 2025,2025-02-01
LUMI-MASK,150,Initial stock before Feb 2025,2025-02-01
CALM-EARPLUG,100,Initial stock before Feb 2025,2025-02-01
```

**Set `entry_date`** to a date BEFORE your first order (e.g., 2025-02-01).

---

## Import Into IOMS

### Option A: Import All at Once

1. Go to `http://localhost:3001/import`
2. **Step 1**: Upload `products.csv`
3. **Step 2**: Upload `stock.csv`
4. **Step 3**: Upload `all-orders.csv` (or upload each product file one by one)

### Option B: Import Per Product

You can import orders in batches:

1. Upload `cervi-pillow-orders.csv`
2. Upload `cervi-case-orders.csv`
3. Upload `lumi-mask-orders.csv`
4. Upload `calm-earplug-orders.csv`

The system will handle them all!

---

## Verify After Import

1. **Dashboard** - Check total orders matches Notion
2. **Orders page** - Spot-check dates, channels, prices
3. **Ledger** - Each order should create an OUT_SALE entry
4. **Products** - Stock should be: Initial - Orders Sold

---

## Troubleshooting

### Script Error: "No such file"
**Fix:** Make sure the Notion export filename matches exactly (including the long hash)

```bash
# Use quotes around filenames with spaces
python3 convert-notion-orders.py "CerviCloud Pillow 1f9e6e5b66af813298cad9d70a48947c_all.csv" CERVI-PILLOW
```

### Import Error: "SKU not found"
**Fix:** Import products FIRST before importing orders

### Wrong Stock Levels
**Fix:** Check your initial stock calculation. It should be:
```
Initial Stock = Current Physical Stock + Total Historical Sales
```

For CerviCloud Pillow:
- Current stock: 154 units
- Historical sales: 96 units
- **Initial stock to import: 250 units**

---

## Quick Commands

```bash
# See your converted files
ls -lh *-orders.csv

# Count orders per file
wc -l *-orders.csv

# Preview a file
head -10 cervi-pillow-orders.csv

# Check specific channel
grep shopee cervi-pillow-orders.csv | wc -l
```

---

## You're Ready!

Your CerviCloud Pillow orders are already converted: `cervi-pillow-orders.csv`

Just convert your other 3 products and you're good to go!
