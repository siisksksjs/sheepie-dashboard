-- Operations changelog for manual notes and automatic dashboard activity

CREATE TABLE IF NOT EXISTS changelog_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  area TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'automatic')),
  action_summary TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  entity_label TEXT NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS changelog_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id UUID NOT NULL REFERENCES changelog_entries(id) ON DELETE CASCADE,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_logged_at
ON changelog_entries(logged_at DESC);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_area
ON changelog_entries(area);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_source
ON changelog_entries(source);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_entity
ON changelog_entries(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_changelog_items_entry
ON changelog_items(entry_id, display_order);

CREATE TRIGGER update_changelog_entries_updated_at
BEFORE UPDATE ON changelog_entries
FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE changelog_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE changelog_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow authenticated users full access to changelog_entries"
ON changelog_entries FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Allow authenticated users full access to changelog_items"
ON changelog_items FOR ALL
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE changelog_entries IS 'High-level operational change events, both manual and automatically recorded.';
COMMENT ON TABLE changelog_items IS 'Field-by-field before/after values for a changelog entry.';
