-- Migration 075: Builder Discovery Engine v1 (PR9A)
-- Discovery runs + candidates for controlled builder finding. Idempotent.

CREATE TABLE IF NOT EXISTS builder_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  location TEXT,
  source VARCHAR(50) NOT NULL DEFAULT 'manual_seed',
  status VARCHAR(20) NOT NULL DEFAULT 'running',
  total_found INT NOT NULL DEFAULT 0,
  imported_count INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_runs_created_at
  ON builder_discovery_runs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_runs_status
  ON builder_discovery_runs (status);

CREATE TABLE IF NOT EXISTS builder_discovery_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES builder_discovery_runs(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  location TEXT,
  suburb TEXT,
  source_url TEXT,
  source_name TEXT,
  suggested_builder_type VARCHAR(50) DEFAULT 'unknown',
  suggested_project_focus VARCHAR(50) DEFAULT 'unknown',
  confidence_score INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'candidate',
  matched_prospect_id UUID REFERENCES b2b_prospects(id) ON DELETE SET NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_run_id
  ON builder_discovery_candidates (run_id);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_status
  ON builder_discovery_candidates (status);

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_company_name
  ON builder_discovery_candidates (LOWER(company_name));

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_website
  ON builder_discovery_candidates (LOWER(website));

CREATE INDEX IF NOT EXISTS idx_builder_discovery_candidates_confidence
  ON builder_discovery_candidates (confidence_score DESC);

COMMENT ON TABLE builder_discovery_runs IS 'PR9A — founder-initiated builder discovery searches';
COMMENT ON TABLE builder_discovery_candidates IS 'PR9A — normalized builder candidates pending review/import';
