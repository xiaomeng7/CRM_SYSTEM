-- Minimal audit trail for creative / landing page version forks (publish-new-version).

CREATE TABLE IF NOT EXISTS ad_asset_version_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  object_type VARCHAR(32) NOT NULL CHECK (object_type IN ('creative', 'landing_page')),
  old_id UUID NOT NULL,
  new_id UUID NOT NULL,
  old_version VARCHAR(128),
  new_version VARCHAR(128),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_ad_asset_version_events_type_old ON ad_asset_version_events (object_type, old_id);
CREATE INDEX IF NOT EXISTS idx_ad_asset_version_events_type_new ON ad_asset_version_events (object_type, new_id);
CREATE INDEX IF NOT EXISTS idx_ad_asset_version_events_changed ON ad_asset_version_events (changed_at DESC);

COMMENT ON TABLE ad_asset_version_events IS
  'Append-only log when a new creative or landing_page_versions row is created from a prior version.';
