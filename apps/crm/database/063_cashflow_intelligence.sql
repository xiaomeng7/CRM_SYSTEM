-- Cashflow Intelligence (Phase 1A): AI operation audit + daily financial snapshots.
-- Additive only. Does not modify ServiceM8 sync or invoice overdue tables.

-- =============================================================================
-- AI_OPERATION_RUNS — batch/AI job execution audit
-- =============================================================================
CREATE TABLE IF NOT EXISTS ai_operation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMP WITH TIME ZONE,
  model_provider VARCHAR(30),
  model_name VARCHAR(80),
  prompt_version VARCHAR(20),
  tokens_in INT,
  tokens_out INT,
  error_message TEXT,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_operation_runs_type_started
  ON ai_operation_runs(operation_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_operation_runs_status
  ON ai_operation_runs(status) WHERE status IN ('running', 'failed');

COMMENT ON TABLE ai_operation_runs IS 'Audit log for scheduled AI/batch operations (e.g. cashflow_intel).';
COMMENT ON COLUMN ai_operation_runs.operation_type IS 'Job identifier: cashflow_intel, email_ops, etc.';
COMMENT ON COLUMN ai_operation_runs.status IS 'running | completed | failed | skipped';
COMMENT ON COLUMN ai_operation_runs.details IS 'dry_run, snapshot_date, degraded, force, etc.';

-- =============================================================================
-- FINANCIAL_SNAPSHOTS — daily cashflow facts + optional AI narrative (Phase 1A: facts only)
-- =============================================================================
CREATE TABLE IF NOT EXISTS financial_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  facts JSONB NOT NULL,
  ai_summary TEXT,
  recommendations JSONB NOT NULL DEFAULT '[]',
  risks JSONB NOT NULL DEFAULT '[]',
  run_id UUID REFERENCES ai_operation_runs(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_period
  ON financial_snapshots(period_start, period_end);

CREATE INDEX IF NOT EXISTS idx_financial_snapshots_created_at
  ON financial_snapshots(created_at DESC);

COMMENT ON TABLE financial_snapshots IS 'Daily cashflow intelligence snapshot; facts JSON is source of truth for metrics.';
COMMENT ON COLUMN financial_snapshots.snapshot_date IS 'Calendar date in Australia/Adelaide when the snapshot was generated.';
COMMENT ON COLUMN financial_snapshots.facts IS 'Structured metrics (income, overdue, expenses, cashflow gaps).';
COMMENT ON COLUMN financial_snapshots.ai_summary IS 'Optional LLM narrative (Phase 1B+); null in facts-only runs.';

-- =============================================================================
-- AUTOMATION_SETTINGS seeds (table created in 026)
-- =============================================================================
INSERT INTO automation_settings (key, value) VALUES
  ('cashflow_intel_enabled', 'true'),
  (
    'cashflow_weekly_config',
    '{
      "currency": "AUD",
      "timezone": "Australia/Adelaide",
      "weekly_fixed": 800,
      "payroll": [{ "label": "Weekly wages", "amount": 3500, "day_of_week": 5 }],
      "supplier_payments": [{ "label": "Wholesaler", "amount": 1200, "day_of_week": 3 }],
      "quote_conversion_rate": 0.35,
      "pipeline_conversion_rate": 0.25,
      "scheduled_job_conversion_rate": 0.5
    }'
  )
ON CONFLICT (key) DO NOTHING;
