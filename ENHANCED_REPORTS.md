# Enhanced Reports Documentation

New powerful reporting features with monthly breakdowns and channel-product analysis!

---

## New Report Types

### 1. **Overview Report** (All Time)
Classic all-time sales report showing:
- Total revenue, profit, fees, units sold
- Sales by product (with margins)
- Sales by channel

**Use case:** Get overall business performance

---

### 2. **Monthly Breakdown** ⭐ NEW
Shows sales performance over time with monthly trends.

**Features:**
- **Monthly Sales Trends Table**
  - Orders per month
  - Units sold per month
  - Revenue, cost, profit per month
  - Profit margin %

- **Product Performance Table**
  - Product sales for selected period
  - Units sold, revenue, cost, profit
  - Profit margin %

**Use cases:**
- Track monthly growth
- Identify seasonal trends
- Compare month-to-month performance
- Analyze which months are strongest

**Example Insights:**
- "September had 15 orders worth Rp 12M"
- "August profit margin was 42%, best month this year"
- "Cervi-001 sold 50 units in December, up from 30 in November"

---

### 3. **Channel × Product Analysis** ⭐ NEW
Cross-tabulation showing which products sell best on which channels.

**Features:**
- Sales breakdown by channel AND product
- See performance of each product on each channel
- Compare margins across channels

**Use cases:**
- "Where does Cervi-001 sell best?"
- "Which channel has highest margins for LumiCloud?"
- "Should we focus Shopee on pillows and Tokopedia on cases?"

**Example Insights:**
- "Shopee: Cervi-001 sold 45 units, Rp 39M revenue, 45% margin"
- "Tokopedia: Lumi-001 sold 12 units, Rp 2M revenue, 55% margin"
- "Offline: Best margin at 60% across all products"

---

## How to Use

### Step 1: Select Report Type

**3 Options:**
1. **Overview (All Time)** - Classic report, all historical data
2. **Monthly Breakdown** - Time-based analysis
3. **Channel × Product** - Cross-analysis

### Step 2: Filter by Time Period

**Year Filter:**
- All Years (no filter)
- 2024
- 2025
- 2026

**Month Filter:**
- All Months (no filter)
- January - December (specific month)

**Filter Combinations:**
- **Year only:** "Show all of 2025"
- **Year + Month:** "Show December 2025 only"
- **All time:** No filters selected

---

## Use Case Examples

### Example 1: Monthly Performance Review

**Goal:** See how each month performed in 2025

**Steps:**
1. Select **"Monthly Breakdown"** report
2. Year: **2025**
3. Month: **All Months**

**Result:**
```
Month      | Orders | Units | Revenue    | Profit     | Margin
-----------|--------|-------|------------|------------|--------
2025-02    | 8      | 12    | Rp 8.5M    | Rp 3.2M    | 37.6%
2025-03    | 14     | 18    | Rp 12.8M   | Rp 5.4M    | 42.2%
2025-04    | 12     | 15    | Rp 10.2M   | Rp 4.1M    | 40.2%
...
```

**Insights:**
- March was strongest month (14 orders)
- Consistent 40%+ margins
- Growth trend from Feb to Mar

---

### Example 2: Best Channel for Each Product

**Goal:** Find which channel sells most of each product

**Steps:**
1. Select **"Channel × Product"** report
2. Year: **2025** (or All Years)
3. Month: **All Months**

**Result:**
```
Channel     | SKU       | Product        | Units | Revenue    | Margin
------------|-----------|----------------|-------|------------|--------
Tokopedia   | Cervi-001 | CerviCloud     | 62    | Rp 48M     | 43%
Shopee      | Cervi-001 | CerviCloud     | 31    | Rp 24M     | 41%
Tokopedia   | Lumi-001  | LumiCloud      | 2     | Rp 350K    | 58%
...
```

**Insights:**
- Cervi-001 sells 2× better on Tokopedia vs Shopee
- Lumi-001 has higher margins (58% vs 43%)
- Focus Tokopedia ads on Cervi-001

---

### Example 3: December 2025 Deep Dive

**Goal:** Analyze December performance in detail

**Steps:**
1. Select **"Monthly Breakdown"** report
2. Year: **2025**
3. Month: **December**

**Result:**
- **Monthly Trends:** 1 row showing Dec 2025 totals
- **Product Performance:** Shows which products sold in December

Then switch to **"Channel × Product"** with same filters to see:
- Which channels drove December sales
- Which products sold on which channels

---

## Filter Behavior

### No Filters (All Time)
- Shows all historical data
- Best for overall business health check

### Year Only
- Shows data for entire year (Jan 1 - Dec 31)
- Monthly report shows all 12 months
- Good for year-over-year comparison

### Year + Month
- Shows single month only (e.g., December 2025)
- Monthly report shows 1 row (that month)
- Good for month-specific analysis

---

## Report Metrics Explained

### Revenue
Gross revenue = Sum of (selling_price × quantity) for all orders

### Cost (COGS)
Total cost = Sum of (cost_per_unit × quantity) from products table

### Profit
Gross profit = Revenue - Cost
(Does NOT include channel fees in this calculation)

### Margin %
Profit Margin = (Profit / Revenue) × 100%

**Example:**
- Revenue: Rp 880,000
- Cost: Rp 500,000
- Profit: Rp 380,000
- Margin: (380,000 / 880,000) × 100% = **43.2%**

### Net Revenue (Channel Report Only)
Net Revenue = Gross Revenue - Channel Fees

---

## Performance Notes

Reports are **server-rendered** with **real-time data**:
- Queries database on each filter change
- No caching (always fresh data)
- Typically loads in < 1 second for 100-500 orders

For datasets > 1000 orders:
- Consider adding date range limits
- Load time may increase to 2-3 seconds

---

## Advanced Tips

### Tip 1: Identify Top-Performing Products

1. Go to **Monthly Breakdown**
2. Select current year
3. Look at **Product Performance** table
4. Sort by **Units Sold** (highest to lowest)

Result: See which products are your best sellers

---

### Tip 2: Find Channel with Best Margins

1. Go to **Channel × Product**
2. Select **All Time** (no filters)
3. Look at **Margin %** column
4. Group by channel mentally

Result: See which channel gives best profit margins

---

### Tip 3: Month-over-Month Growth

1. Go to **Monthly Breakdown**
2. Select current year
3. Look at **Monthly Trends** table
4. Compare consecutive months

Result: See if business is growing month-over-month

---

## Data Included

Reports only include orders with status:
- ✅ **Paid**
- ✅ **Shipped**

Excluded orders:
- ❌ Cancelled
- ❌ Returned

This ensures reports show **actual revenue** (not orders that were refunded).

---

## Future Enhancements

Potential additions for v2:
- [ ] Export reports to CSV/Excel
- [ ] Chart visualizations (line charts, bar charts)
- [ ] Year-over-year comparison
- [ ] Quarter-based reporting (Q1, Q2, Q3, Q4)
- [ ] Custom date ranges (e.g., "Last 30 days")
- [ ] Profit after fees (net profit)
- [ ] Customer acquisition cost by channel

---

## Quick Reference

| Report Type | Best For | Time Filter |
|-------------|----------|-------------|
| Overview | All-time business health | No filters |
| Monthly Breakdown | Track growth trends | Year or Year+Month |
| Channel × Product | Channel optimization | Year or All Time |

| Filter Combo | Shows |
|--------------|-------|
| No filters | All historical data |
| 2025 | All of 2025 (12 months) |
| 2025 + December | December 2025 only |

---

Enjoy the enhanced reports! 📊
