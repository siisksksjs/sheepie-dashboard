-- Clear only orders data (keep ledger and products)

-- Step 1: Delete order line items first (child table)
DELETE FROM order_line_items;

-- Step 2: Delete orders
DELETE FROM orders;

-- Verify cleanup
SELECT 'Orders' as table_name, COUNT(*) as remaining FROM orders
UNION ALL
SELECT 'Order Line Items', COUNT(*) FROM order_line_items
UNION ALL
SELECT 'Ledger Entries (unchanged)', COUNT(*) FROM inventory_ledger
UNION ALL
SELECT 'Products (unchanged)', COUNT(*) FROM products;
