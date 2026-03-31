-- Google Ads cost sync observability + stable campaign mapping (idempotent).
-- Prereq: 004_sync_runs_and_last_synced.sql, 028 (campaigns).

-- =============================================================================
-- sync_runs — extend for ad platform runs (ServiceM8 rows remain valid)
-- =============================================================================
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS source VARCHAR(50);
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS run_type VARCHAR(50);
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS target_date DATE;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS mapped_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS summary JSONB;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE sync_runs ADD COLUMN IF NOT EXISTS created_by VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source_target_date
  ON sync_runs (source, target_date);

CREATE INDEX IF NOT EXISTS idx_sync_runs_source_started_at
  ON sync_runs (source, started_at DESC);

COMMENT ON COLUMN sync_runs.source IS 'Logical source, e.g. google_ads (alongside legacy sync_type).';
COMMENT ON COLUMN sync_runs.run_type IS 'Sub-type, e.g. cost_sync.';
COMMENT ON COLUMN sync_runs.target_date IS 'Business date the sync processed (e.g. spend date).';
COMMENT ON COLUMN sync_runs.mapped_count IS 'Rows mapped to local campaigns after aggregation.';
COMMENT ON COLUMN sync_runs.summary IS 'Structured summary (sample_skipped, api_version, counts, etc.).';
COMMENT ON COLUMN sync_runs.error_message IS 'Final error text when status = failed.';

-- =============================================================================
-- campaigns — Google Ads stable id + optional platform fields for auto-create
-- =============================================================================
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS google_campaign_id TEXT;
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS platform VARCHAR(50);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS external_campaign_id TEXT;

-- One non-null google_campaign_id per row; multiple NULLs allowed.
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_google_campaign_id
  ON campaigns (google_campaign_id)
  WHERE google_campaign_id IS NOT NULL;

COMMENT ON COLUMN campaigns.google_campaign_id IS 'Google Ads campaign resource id (numeric string); primary key for cost sync mapping.';
COMMENT ON COLUMN campaigns.platform IS 'Ad platform label, e.g. google.';
COMMENT ON COLUMN campaigns.external_campaign_id IS 'External platform campaign id (e.g. same as google_campaign_id for Google).';
