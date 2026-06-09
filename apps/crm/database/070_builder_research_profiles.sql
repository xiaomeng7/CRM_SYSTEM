-- Migration 070: Builder Research Profile Foundation (PR8C)
-- builder_profiles + builder_research_runs. Idempotent.

-- =============================================================================
-- BUILDER_PROFILES — structured research profile per builder prospect
-- =============================================================================
CREATE TABLE IF NOT EXISTS builder_profiles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id         UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  profile_summary     TEXT,
  builder_focus       TEXT,
  project_types       TEXT[] DEFAULT '{}',
  target_suburbs      TEXT[] DEFAULT '{}',
  quality_signals     TEXT[] DEFAULT '{}',
  risk_signals        TEXT[] DEFAULT '{}',
  ideal_contact_angle TEXT,
  smart_home_fit      VARCHAR(20) DEFAULT 'unknown',
  architectural_fit   VARCHAR(20) DEFAULT 'unknown',
  luxury_fit          VARCHAR(20) DEFAULT 'unknown',
  estimated_fit_score INT,
  research_source     VARCHAR(50) DEFAULT 'manual',
  last_researched_at  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id)
);

COMMENT ON TABLE builder_profiles IS 'Structured builder research profile; one row per builder prospect.';
COMMENT ON COLUMN builder_profiles.smart_home_fit IS 'high | medium | low | unknown';
COMMENT ON COLUMN builder_profiles.architectural_fit IS 'high | medium | low | unknown';
COMMENT ON COLUMN builder_profiles.luxury_fit IS 'high | medium | low | unknown';
COMMENT ON COLUMN builder_profiles.estimated_fit_score IS '0–100 deterministic fit score (PR8D+ may auto-compute)';

CREATE INDEX IF NOT EXISTS idx_builder_profiles_prospect_id ON builder_profiles(prospect_id);
CREATE INDEX IF NOT EXISTS idx_builder_profiles_last_researched
  ON builder_profiles(last_researched_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_builder_profiles_fit_score
  ON builder_profiles(estimated_fit_score DESC NULLS LAST);

-- =============================================================================
-- BUILDER_RESEARCH_RUNS — audit trail for manual / future automated research
-- =============================================================================
CREATE TABLE IF NOT EXISTS builder_research_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id   UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  status        VARCHAR(20) NOT NULL DEFAULT 'completed',
  source        VARCHAR(50) NOT NULL DEFAULT 'manual',
  input_url     TEXT,
  summary       TEXT,
  error_message TEXT,
  payload       JSONB NOT NULL DEFAULT '{}',
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at   TIMESTAMPTZ
);

COMMENT ON TABLE builder_research_runs IS 'Research job audit; PR8C manual only, PR8D+ website/AI runs.';
COMMENT ON COLUMN builder_research_runs.status IS 'running | completed | failed | skipped';

CREATE INDEX IF NOT EXISTS idx_builder_research_runs_prospect
  ON builder_research_runs(prospect_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_builder_research_runs_status
  ON builder_research_runs(status);

-- auto-update builder_profiles.updated_at
CREATE OR REPLACE FUNCTION update_builder_profiles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_builder_profiles_updated_at ON builder_profiles;
CREATE TRIGGER trg_builder_profiles_updated_at
  BEFORE UPDATE ON builder_profiles
  FOR EACH ROW EXECUTE FUNCTION update_builder_profiles_updated_at();
