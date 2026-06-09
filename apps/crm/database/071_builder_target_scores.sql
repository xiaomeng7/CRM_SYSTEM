-- Migration 071: Builder Target Scores (PR8E)
-- Deterministic founder target ranking. Idempotent.

CREATE TABLE IF NOT EXISTS builder_target_scores (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  target_score    INT NOT NULL DEFAULT 0,
  target_band     VARCHAR(2) NOT NULL DEFAULT 'D',
  next_best_action TEXT,
  score_breakdown JSONB NOT NULL DEFAULT '{}',
  calculated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (prospect_id)
);

COMMENT ON TABLE builder_target_scores IS 'Founder target selection scores — deterministic, explainable ranking.';
COMMENT ON COLUMN builder_target_scores.target_score IS '0–100 composite founder priority score';
COMMENT ON COLUMN builder_target_scores.target_band IS 'A | B | C | D';
COMMENT ON COLUMN builder_target_scores.score_breakdown IS 'Component scores for audit/explainability';

CREATE INDEX IF NOT EXISTS idx_builder_target_scores_score
  ON builder_target_scores(target_score DESC);

CREATE INDEX IF NOT EXISTS idx_builder_target_scores_band
  ON builder_target_scores(target_band, target_score DESC);

CREATE INDEX IF NOT EXISTS idx_builder_target_scores_calculated
  ON builder_target_scores(calculated_at DESC);
