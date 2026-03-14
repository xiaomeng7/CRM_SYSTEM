-- ServiceM8 sync: run history, last_synced_at for incremental, no sync_locks table (use pg advisory lock in app).

-- =============================================================================
-- SYNC_RUNS
-- =============================================================================
CREATE TABLE IF NOT EXISTS sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type VARCHAR(50) NOT NULL,
  mode VARCHAR(20) NOT NULL DEFAULT 'full',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,
  fetched_count INTEGER DEFAULT 0,
  created_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_sync_type ON sync_runs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_sync_runs_status ON sync_runs(status);

COMMENT ON TABLE sync_runs IS 'ServiceM8 sync execution history; used for monitoring and incremental since date.';

-- =============================================================================
-- LAST_SYNCED_AT (for incremental sync)
-- =============================================================================
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_accounts_last_synced_at ON accounts(last_synced_at) WHERE last_synced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_synced_at ON contacts(last_synced_at) WHERE last_synced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_last_synced_at ON jobs(last_synced_at) WHERE last_synced_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_last_synced_at ON invoices(last_synced_at) WHERE last_synced_at IS NOT NULL;
