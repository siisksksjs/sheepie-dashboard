# How to Export Notion Data to CSV

Step-by-step guide to export your Notion database and import it into the IOMS.

---

## Quick Overview

Based on your Notion screenshot, you have:
- **Modal Product** table (4 products with COGS)
- **Order tables per product** (CerviCloud Pillow, CerviCloud Pillow Case, etc.)
- **Channels**: Tokopedia (83), Shopee (31), Offline (2), TikTok (1)

We'll export these to 3 CSV files:
1. `products.csv` - Your 4 products
2. `stock.csv` - Initial inventory levels
3. `orders.csv` - Your ~117 historical orders

---

## Step 1: Export Products from Notion

### 1.1 Open Your "Modal Product" Table

1. Open the **Modal Product** database in Notion
2. Click the **`⋮⋮`** (6 dots) icon in the top right
3. Select **"Export"**
4. Format: **"Markdown & CSV"** or **"CSV"**
5. Click **"Export"**
6. Save the file as `notion_products.csv`

### 1.2 Convert to IOMS Format

Open `notion_products.csv` in Excel, Google Sheets, or a text editor.

**Your Notion columns:**
```
Items/Products | COGS | Status | Notes...
```

**Convert to IOMS format:**
```
sku,name,variant,cost_per_unit,reorder_point,is_bundle,status
CERVI-PILLOW,CerviCloud Pillow,,192000,10,false,active
CERVI-CASE,CerviCloud Pillow Case,,40000,20,false,active
LUMI-MASK,LumiCloud EyeMask,,4000,30,false,active
CALM-EARPLUG,CalmCloud EarPlug,,4000,30,false,active
```

**Manual mapping:**
- **sku**: Create short codes (CERVI-PILLOW, LUMI-MASK, etc.)
- **name**: Copy from "Items/Products" column
- **variant**: Leave blank (or add: "Blue", "Standard", etc.)
- **cost_per_unit**: Copy from "COGS" column (192000, 40000, 4000, 4000)
- **reorder_point**: Set manually (10, 20, 30, 30 are good starting points)
- **is_bundle**: `false` for all single products
- **status**: `active` for all

Save as `products.csv`

---

## Step 2: Export Orders from Notion

### Method A: Export Each Product Table Separately (Recommended)

#### 2.1 Export CerviCloud Pillow Orders

1. Open the **CerviCloud Pillow** database
2. Click **`⋮⋮`** (6 dots) → **Export** → **CSV**
3. Save as `cervi-pillow-orders.csv`

#### 2.2 Repeat for Each Product

- Export **CerviCloud Pillow Case** → `cervi-case-orders.csv`
- Export **LumiCloud EyeMask** → `lumi-mask-orders.csv`
- Export **CalmCloud EarPlug** → `calm-earplug-orders.csv`

#### 2.3 Combine All Order Files

Open a spreadsheet (Excel/Google Sheets) or text editor:

1. Create new file with header row:
```
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
```

2. For each exported CSV, add rows like this:

**From `cervi-pillow-orders.csv`:**
```
Date        | Account    | Quantity | Price  | Status | Notes
2024-01-15  | Tokopedia  | 1        | 198000 | Done   | Customer A
2024-01-16  | Shopee     | 1        | 198000 | Done   |
```

**Convert to:**
```
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
TOKO-20240115-001,tokopedia,2024-01-15,CERVI-PILLOW,1,198000,5000,Customer A,paid
SHOPEE-20240116-001,shopee,2024-01-16,CERVI-PILLOW,1,198000,4000,,paid
```

**Mapping rules:**
- **order_id**: `{CHANNEL}-{DATE}-{SEQUENCE}`
  - Tokopedia → `TOKO`
  - Shopee → `SHOPEE`
  - Offline → `OFFLINE`
  - TikTok → `TIKTOK`
  - Example: `TOKO-20240115-001`, `TOKO-20240115-002`, etc.

- **channel**: Lowercase version of Account column
  - "Tokopedia" → `tokopedia`
  - "Shopee" → `shopee`
  - "Offline" → `offline`
  - "TikTok" → `tiktok`

- **order_date**: Format as `YYYY-MM-DD`
  - "Jan 15, 2024" → `2024-01-15`
  - "15/01/2024" → `2024-01-15`

- **sku**: Use the SKU you created in Step 1
  - CerviCloud Pillow orders → `CERVI-PILLOW`
  - CerviCloud Pillow Case orders → `CERVI-CASE`
  - LumiCloud orders → `LUMI-MASK`
  - CalmCloud orders → `CALM-EARPLUG`

- **quantity**: Copy from Quantity column

- **selling_price**: Copy from Price column (198000, 45000, etc.)

- **channel_fees**: Calculate approximate fees
  - Tokopedia: Price × 2.5% (e.g., 198000 × 0.025 = 4950 → round to 5000)
  - Shopee: Price × 2% (e.g., 198000 × 0.02 = 3960 → round to 4000)
  - Offline: 0
  - TikTok: Price × 5%

- **notes**: Copy from Notes column (optional)

- **status**: `paid` (all historical orders are completed)

3. Save as `orders.csv`

---

## Step 3: Create Initial Stock CSV

You need to calculate initial stock **before** your first historical order.

### Formula:
```
Initial Stock = Current Physical Stock + Total Units Sold
```

### Example Calculation:

**CerviCloud Pillow:**
- Current stock in warehouse: 50 units
- Total sold in Notion (count all orders): 117 units
- **Initial stock to import: 50 + 117 = 167**

### Create `stock.csv`:

```
sku,quantity,reference
CERVI-PILLOW,167,Initial stock before historical orders
CERVI-CASE,200,Initial stock before historical orders
LUMI-MASK,150,Initial stock before historical orders
CALM-EARPLUG,100,Initial stock before historical orders
```

**Adjust quantities based on your actual count!**

---

## Quick Method: Use Google Sheets

If manual conversion is tedious, use Google Sheets formulas:

### 1. Import Notion CSV
1. Open Google Sheets
2. **File** → **Import** → Upload your Notion CSV
3. Select "Replace current sheet"

### 2. Create Conversion Sheet

**Sheet 1: Notion Data** (imported)
```
| Date       | Account    | Quantity | Price  |
|------------|------------|----------|--------|
| 2024-01-15 | Tokopedia  | 1        | 198000 |
```

**Sheet 2: IOMS Format** (formulas)
```
=TEXT(A2,"YYYY-MM-DD")                          // order_date
=UPPER(LEFT(B2,FIND(" ",B2)-1))                 // channel prefix
=LOWER(B2)                                       // channel
="TOKO-"&TEXT(A2,"YYYYMMDD")&"-"&TEXT(ROW()-1,"000")  // order_id
```

### 3. Download as CSV
**File** → **Download** → **Comma-separated values (.csv)**

---

## Example: Real Conversion

### Notion Export (CerviCloud Pillow):
```csv
Date,Account,Quantity,Price,Status,Notes
15 Jan 2024,Tokopedia,1,198000,Done,
16 Jan 2024,Shopee,1,198000,Done,VIP customer
17 Jan 2024,Tokopedia,2,198000,Done,
```

### IOMS Format:
```csv
order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status
TOKO-20240115-001,tokopedia,2024-01-15,CERVI-PILLOW,1,198000,5000,,paid
SHOPEE-20240116-001,shopee,2024-01-16,CERVI-PILLOW,1,198000,4000,VIP customer,paid
TOKO-20240117-001,tokopedia,2024-01-17,CERVI-PILLOW,2,198000,10000,,paid
```

**Note:** Channel fees for 2 units = fee × 2 (e.g., 5000 × 2 = 10000)

---

## Tips for Large Datasets

### If you have 100+ orders:

**Option 1: Use Excel/Sheets Formulas**
1. Import all Notion CSVs into one sheet
2. Add column for SKU manually (based on which product table it came from)
3. Use formulas to generate order_id, format dates, etc.
4. Copy formulas down for all rows

**Option 2: Use AI Assistant**
1. Export Notion CSVs
2. Upload to ChatGPT/Claude and say:
   "Convert this Notion export to IOMS format with columns: order_id,channel,order_date,sku,quantity,selling_price,channel_fees,notes,status"
3. Specify your SKU mapping (CERVI-PILLOW, LUMI-MASK, etc.)

**Option 3: Python Script (if technical)**
```python
import pandas as pd

# Read Notion export
df = pd.read_csv('notion_orders.csv')

# Convert columns
df['channel'] = df['Account'].str.lower()
df['order_date'] = pd.to_datetime(df['Date']).dt.strftime('%Y-%m-%d')
df['order_id'] = df['channel'].str[:5].str.upper() + '-' + df['order_date'].str.replace('-','') + '-' + (df.index + 1).astype(str).str.zfill(3)
df['sku'] = 'CERVI-PILLOW'  # Set manually per file
df['status'] = 'paid'

# Save
df.to_csv('orders.csv', index=False)
```

---

## Common Issues

### Issue: Dates in wrong format
**Notion:** "Jan 15, 2024" or "15/01/2024"
**Need:** "2024-01-15"
**Fix in Excel:** `=TEXT(A2, "YYYY-MM-DD")`
**Fix in Sheets:** `=TEXT(A2, "YYYY-MM-DD")`

### Issue: Channel names inconsistent
**Notion:** "Tokopedia", "tokopedia", "TOKOPEDIA"
**Need:** All lowercase: "tokopedia"
**Fix:** `=LOWER(A2)`

### Issue: Order IDs not unique
**Problem:** Same order_id for different orders
**Fix:** Add sequence number:
- TOKO-20240115-001
- TOKO-20240115-002
- TOKO-20240115-003

---

## Validation Checklist

Before importing, verify:

### Products CSV
- [ ] All 4 products listed
- [ ] SKUs are unique (no duplicates)
- [ ] cost_per_unit matches Notion COGS
- [ ] reorder_point set (10, 20, 30 are reasonable)
- [ ] is_bundle = `false` for single products
- [ ] status = `active`

### Stock CSV
- [ ] SKUs match products.csv exactly
- [ ] Quantities are positive numbers
- [ ] Initial stock = current + historical sales

### Orders CSV
- [ ] All order_ids are unique
- [ ] Dates in YYYY-MM-DD format
- [ ] Channels are lowercase (tokopedia, shopee, offline, tiktok)
- [ ] SKUs match products.csv exactly
- [ ] All quantities are positive numbers
- [ ] Selling prices look correct
- [ ] Channel fees calculated (or left blank)
- [ ] Status = `paid` for all historical orders

---

## Ready to Import!

Once you have these 3 CSV files:
1. `products.csv`
2. `stock.csv`
3. `orders.csv`

Go to: `http://localhost:3001/import`

Upload in order:
1. Products first
2. Initial stock second
3. Orders last

The system will validate and show success/error counts!

---

## Need Help?

If you get stuck:
1. Download the template from the import page
2. Compare your CSV with the template format
3. Ensure exact column names (case-sensitive)
4. Check for extra commas or quotes in data

Common fixes:
- Remove extra columns Notion adds
- Ensure no blank rows
- Save as plain CSV (not CSV UTF-8 or Excel CSV)
