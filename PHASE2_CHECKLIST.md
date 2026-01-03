# Phase 2 — Orders Checklist

## ✅ COMPLETED FEATURES

### A) Orders CRUD
- ✅ Orders table with all required fields:
  - order_id (unique external reference)
  - channel (shopee/tokopedia/tiktok/offline)
  - order_date
  - status (paid/shipped/cancelled/returned)
  - channel_fees
  - notes
- ✅ Order line items table:
  - SKU reference
  - Quantity
  - Selling price per unit
- ✅ Orders list page with table view
- ✅ Create order form with dynamic line items
- ✅ Order detail page with full information
- ✅ Status update functionality
- ✅ Empty state for orders list

### B) Auto-Generate Ledger Entries
- ✅ **When order status = "Paid":**
  - Creates OUT_SALE ledger entries for each line item
  - Quantity is negative (reduces stock)
  - Reference: "Order {order_id}"
- ✅ **When order status changes to "Cancelled" (from Paid):**
  - Creates RETURN ledger entries for each line item
  - Quantity is positive (adds stock back)
  - Reference: "Order {order_id} - Cancelled"
- ✅ **When order status changes to "Returned" (from Paid):**
  - Creates RETURN ledger entries for each line item
  - Quantity is positive (adds stock back)
  - Reference: "Order {order_id} - Returned"
- ✅ Automatic ledger generation is **atomic** with order creation/update

### C) Sales Channel Tracking
- ✅ Four channels supported:
  - Shopee
  - Tokopedia
  - TikTok
  - Offline
- ✅ Channel fees tracked per order
- ✅ Channel-specific reporting

### D) Sales Reporting
- ✅ **Sales by Product Report:**
  - Units sold per SKU
  - Revenue per SKU
  - Cost (COGS) per SKU
  - Gross profit per SKU
  - Profit margin % per SKU
- ✅ **Sales by Channel Report:**
  - Number of orders per channel
  - Gross revenue per channel
  - Channel fees per channel
  - Net revenue per channel
- ✅ **Dashboard Summary Stats:**
  - Total revenue
  - Total profit
  - Total fees
  - Units sold
- ✅ Only includes Paid/Shipped orders in reports

### E) Database & Logic
- ✅ Foreign key constraints (orders → products via SKU)
- ✅ Cascade delete on order line items when order is deleted
- ✅ Restrict delete on products if referenced in orders
- ✅ RLS policies for all order tables
- ✅ Indexes for performance:
  - `idx_orders_status`
  - `idx_orders_date`
  - `idx_orders_channel`
  - `idx_order_line_items_order_id`
  - `idx_order_line_items_sku`

### F) UI/UX
- ✅ Orders list with status badges
- ✅ Create order form with multi-line items
- ✅ Add/remove line items dynamically
- ✅ Order detail view with profit calculation
- ✅ Status update with automatic ledger warning
- ✅ Sales reports with charts and tables
- ✅ Revenue card on dashboard
- ✅ Reports navigation added to sidebar
- ✅ Consistent design with Phase 1

### G) Code Quality
- ✅ TypeScript: No errors
- ✅ Server actions for all mutations
- ✅ Proper error handling
- ✅ Revalidation after order operations
- ✅ Clean, readable code

---

## 📊 PRD COMPLIANCE CHECK

| PRD Requirement | Status | Notes |
|----------------|--------|-------|
| Orders CRUD | ✅ | Create, read, update orders |
| Order line items | ✅ | Multiple products per order |
| Auto-generate ledger on Paid | ✅ | OUT_SALE entries created |
| Auto-generate ledger on Cancel | ✅ | RETURN entries created |
| Auto-generate ledger on Return | ✅ | RETURN entries created |
| Sales channel tracking | ✅ | 4 channels supported |
| Units sold per SKU | ✅ | In sales reports |
| Revenue per channel | ✅ | In sales reports |
| Profit calculations | ✅ | Gross profit & net profit |
| Channel fees tracking | ✅ | Per order and in reports |
| Order status workflow | ✅ | Paid → Shipped/Cancelled/Returned |

---

## 🧪 TESTING GUIDE

### Test Workflow: Create Order with Auto-Ledger

1. **Create a test order:**
   - Go to Orders → Create Order
   - Order ID: TEST-001
   - Channel: Shopee
   - Status: Paid
   - Add line item: Select a product, quantity: 5, price: 200000
   - Submit

2. **Verify ledger entries auto-created:**
   - Go to Ledger
   - Find entry: "Order TEST-001"
   - Movement type: Sale Out
   - Quantity: -5 (negative)

3. **Verify stock reduction:**
   - Go to Dashboard
   - Product stock should be reduced by 5 units

4. **Test order cancellation:**
   - Go to Orders → View TEST-001
   - Change status to "Cancelled"
   - Verify ledger shows new RETURN entry: +5 units
   - Verify stock is back to original level

5. **Verify sales reports:**
   - Go to Reports
   - Check "Sales by Product" shows TEST-001 order
   - Check "Sales by Channel" shows Shopee revenue

### Test Profit Calculation

1. Create an order with:
   - Product cost: 100,000 IDR
   - Selling price: 200,000 IDR
   - Quantity: 2
   - Channel fees: 10,000 IDR

2. Expected calculations:
   - Revenue: 400,000 IDR (200k × 2)
   - Cost: 200,000 IDR (100k × 2)
   - Gross profit: 200,000 IDR
   - Channel fees: 10,000 IDR
   - Net profit: 190,000 IDR

3. Verify in:
   - Order detail page
   - Sales reports page

---

## 🎯 KEY FEATURES DEMONSTRATED

### 1. Ledger-First Integrity
- ✅ Orders automatically update inventory via ledger
- ✅ No manual stock edits possible
- ✅ Full audit trail of all movements

### 2. Multi-Line Orders
- ✅ Add multiple products to one order
- ✅ Different selling prices per line item
- ✅ Dynamic add/remove line items in form

### 3. Status Workflow
- ✅ Paid → Creates OUT_SALE entries
- ✅ Shipped → No additional ledger entries
- ✅ Cancelled → Reverses with RETURN entries
- ✅ Returned → Adds stock back with RETURN entries

### 4. Financial Tracking
- ✅ Revenue per order
- ✅ Channel fees per order
- ✅ Gross profit (revenue - cost)
- ✅ Net profit (gross profit - fees)
- ✅ Profit margin %

---

## 🚀 DEPLOYMENT READINESS

- ✅ All Phase 2 features implemented
- ✅ Database migrations complete (already done in Phase 1)
- ✅ No TypeScript errors
- ✅ Auto-ledger generation tested
- ✅ Reports display correctly
- ✅ Dashboard updated with revenue stats

---

## 🔜 READY FOR PHASE 3?

**Prerequisites before proceeding to Phase 3:**
- [ ] User has tested order creation
- [ ] User has verified auto-ledger generation works
- [ ] User has checked sales reports
- [ ] User confirms profit calculations are correct
- [ ] User says "continue" to proceed

---

## 📝 NOTES

- All Phase 2 requirements from PRD have been implemented
- Order system fully integrated with ledger system
- Sales reports provide complete financial visibility
- Code is production-ready
- Ready to build Phase 3 (Bundles & Alerts)

---

## 🎁 BONUS FEATURES (Beyond PRD)

- ✅ Profit margin % in reports
- ✅ Real-time revenue display on dashboard
- ✅ Order detail page with full profit breakdown
- ✅ Empty states for orders list
- ✅ Visual status badges (color-coded)
