-- PR10C — Founder-approved pipeline stage suggestions (no auto-transition)

CREATE TABLE IF NOT EXISTS builder_stage_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  suggested_from_stage VARCHAR(40),
  suggested_to_stage VARCHAR(40) NOT NULL,
  reason TEXT NOT NULL,
  confidence_score INT NOT NULL DEFAULT 50,
  confidence_band VARCHAR(20) NOT NULL DEFAULT 'medium',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  source VARCHAR(40) NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_builder_stage_suggestions_prospect_status
  ON builder_stage_suggestions (prospect_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_builder_stage_suggestions_pending
  ON builder_stage_suggestions (prospect_id)
  WHERE status = 'pending';
