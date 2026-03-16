ALTER TABLE ad_spend_entries
ADD COLUMN IF NOT EXISTS finance_account_id UUID REFERENCES finance_accounts(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS finance_entry_id UUID REFERENCES finance_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ad_spend_entries_finance_account
ON ad_spend_entries(finance_account_id);

CREATE INDEX IF NOT EXISTS idx_ad_spend_entries_finance_entry
ON ad_spend_entries(finance_entry_id);

COMMENT ON COLUMN ad_spend_entries.finance_account_id IS 'Optional funding account used to pay the ad spend topup.';
COMMENT ON COLUMN ad_spend_entries.finance_entry_id IS 'Linked finance entry created when the spend topup also affects bank or cash balance.';
