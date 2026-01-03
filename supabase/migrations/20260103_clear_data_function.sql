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
