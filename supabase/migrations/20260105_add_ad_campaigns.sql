-- Ad Campaigns Tracking
-- Add tables for tracking advertising spend and calculating ROAS

-- Create ad_campaigns table
CREATE TABLE ad_campaigns (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_name TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('tiktok_ads', 'shopee_ads', 'facebook_ads', 'google_ads')),
  start_date DATE NOT NULL,
  end_date DATE,
  total_spend DECIMAL(10,2) NOT NULL DEFAULT 0 CHECK (total_spend >= 0),
  target_channels TEXT[] NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for ad_campaigns
CREATE INDEX idx_ad_campaigns_dates ON ad_campaigns(start_date, end_date);
CREATE INDEX idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX idx_ad_campaigns_platform ON ad_campaigns(platform);

-- Create ad_spend_entries table
CREATE TABLE ad_spend_entries (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  payment_method TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for ad_spend_entries
CREATE INDEX idx_ad_spend_entries_campaign ON ad_spend_entries(campaign_id);
CREATE INDEX idx_ad_spend_entries_date ON ad_spend_entries(entry_date);

-- Create trigger function to auto-update updated_at on ad_campaigns
CREATE OR REPLACE FUNCTION update_ad_campaign_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ad_campaigns_updated_at
  BEFORE UPDATE ON ad_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_ad_campaign_updated_at();

-- Create trigger function to auto-update campaign total_spend when entries added/deleted
CREATE OR REPLACE FUNCTION update_campaign_total_spend()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE ad_campaigns
    SET total_spend = total_spend + NEW.amount
    WHERE id = NEW.campaign_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE ad_campaigns
    SET total_spend = total_spend - OLD.amount
    WHERE id = OLD.campaign_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE ad_campaigns
    SET total_spend = total_spend - OLD.amount + NEW.amount
    WHERE id = NEW.campaign_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_campaign_spend_on_entry_insert
  AFTER INSERT ON ad_spend_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_total_spend();

CREATE TRIGGER trigger_update_campaign_spend_on_entry_delete
  AFTER DELETE ON ad_spend_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_total_spend();

CREATE TRIGGER trigger_update_campaign_spend_on_entry_update
  AFTER UPDATE ON ad_spend_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_campaign_total_spend();

-- Enable Row Level Security
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_spend_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (allow authenticated users full access)
CREATE POLICY "Allow authenticated users full access to ad_campaigns"
  ON ad_campaigns
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users full access to ad_spend_entries"
  ON ad_spend_entries
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Add helpful comments
COMMENT ON TABLE ad_campaigns IS 'Tracks advertising campaigns with period-based attribution';
COMMENT ON TABLE ad_spend_entries IS 'Individual ad spend transactions/topups per campaign';
COMMENT ON COLUMN ad_campaigns.target_channels IS 'Array of channels (tiktok, tokopedia, shopee, offline) that this campaign targets';
COMMENT ON COLUMN ad_campaigns.total_spend IS 'Auto-calculated sum of all ad_spend_entries for this campaign';
