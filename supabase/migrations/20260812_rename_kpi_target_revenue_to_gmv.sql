ALTER TABLE monthly_kpi_targets
RENAME COLUMN target_revenue TO target_gmv;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'monthly_kpi_targets_target_revenue_check'
  ) THEN
    ALTER TABLE monthly_kpi_targets
    RENAME CONSTRAINT monthly_kpi_targets_target_revenue_check
    TO monthly_kpi_targets_target_gmv_check;
  END IF;
END $$;
