# Clear Data Feature Setup

## Overview

I've added a "Clear Data" feature to the import page that allows you to reset all ledger and order data. This is useful when testing imports or when you need to re-import data.

---

## What Gets Cleared

✅ **Deleted:**
- All ledger entries (inventory movements)
- All orders
- All order line items
- Stock levels reset to 0

❌ **NOT Deleted:**
- Products (your product catalog remains)
- Bundle compositions

---

## Database Migration Required

To enable this feature, you need to run a migration that creates a helper function to bypass the ledger delete trigger.

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy and paste the contents of `supabase/migrations/20260103_clear_data_function.sql`
5. Click **Run** or press `Cmd/Ctrl + Enter`

### Option 2: Copy SQL Here

```sql
-- Function to clear ledger data (for development/testing)
-- This bypasses the delete trigger by using TRUNCATE
CREATE OR REPLACE FUNCTION clear_ledger()
RETURNS void
SECURITY DEFINER
AS $$
BEGIN
  -- Disable triggers temporarily
  ALTER TABLE inventory_ledger DISABLE TRIGGER prevent_ledger_delete_trigger;

  -- Truncate the ledger
  TRUNCATE inventory_ledger;

  -- Re-enable triggers
  ALTER TABLE inventory_ledger ENABLE TRIGGER prevent_ledger_delete_trigger;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION clear_ledger() TO authenticated;
```

---

## How to Use

1. Navigate to `/import` (or click "Import Data" in sidebar)
2. Scroll to the bottom → **Danger Zone** section
3. Click **"Clear All Ledger & Orders Data"**
4. Confirm the warning prompt
5. Data will be cleared

---

## Safety Features

- **Double confirmation**: Browser alert requires explicit confirmation
- **Clear messaging**: Shows exactly what will be deleted
- **Success/error feedback**: Displays result of operation
- **Products preserved**: Only transactional data is cleared, not master data

---

## Use Cases

### When to Use Clear Data

1. **Testing imports**: Clear test data before importing real data
2. **Re-importing**: Made mistakes in CSV? Clear and re-import
3. **Development**: Reset database to clean state
4. **Wrong data**: Imported wrong orders? Clear and start over

### When NOT to Use

- **Production data**: Never clear production data!
- **Partial cleanup**: This clears ALL data, not selective
- **Fixing individual errors**: Use ADJUSTMENT ledger entries instead

---

## Technical Details

### Deletion Order (Foreign Keys)

```
1. order_line_items (child of orders)
2. orders (references products)
3. inventory_ledger (via special function)
```

### Why Special Function?

The `inventory_ledger` table has a delete trigger (`prevent_ledger_delete_trigger`) that prevents deletions to maintain immutability. The `clear_ledger()` function temporarily disables this trigger to allow clearing for development purposes.

---

## Alternative: Manual SQL Cleanup

If you prefer running SQL directly in Supabase SQL Editor:

```sql
-- Clear order line items
DELETE FROM order_line_items;

-- Clear orders
DELETE FROM orders;

-- Clear ledger (requires function above, or run TRUNCATE manually)
TRUNCATE inventory_ledger;
```

---

## After Clearing Data

Your system will be in this state:
- Products: ✅ Still exist
- Stock levels: 📉 All at 0
- Orders: ❌ Empty
- Ledger: ❌ Empty
- Dashboard: Shows 0 stock, 0 orders, 0 revenue

You can now re-import fresh data!

---

## Troubleshooting

### Error: "Function clear_ledger() does not exist"

**Solution:** Run the migration SQL above in Supabase dashboard

### Error: "Permission denied for function clear_ledger"

**Solution:** The GRANT statement may not have executed. Run:
```sql
GRANT EXECUTE ON FUNCTION clear_ledger() TO authenticated;
```

### Error: "Failed to delete orders"

**Cause:** Foreign key constraint from order_line_items
**Solution:** Function should delete order_line_items first. Check if RLS policies are blocking deletion.

### Clear succeeds but stock still shows

**Cause:** Stock is computed from ledger, may be cached
**Solution:** Refresh the page (hard refresh: Cmd+Shift+R / Ctrl+Shift+F5)

---

## Notes

- This feature is intended for **development/testing**
- In production, consider adding role-based access control
- Consider adding audit logging for who cleared data
- The confirmation dialog helps prevent accidental deletions

---

Ready to use! Go to `/import` and scroll to the bottom.
