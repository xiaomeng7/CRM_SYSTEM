-- Migration 073: Relationship Intelligence & Founder Prioritisation (PR8E.1)
-- Extend b2b_prospects + builder_target_scores. Idempotent. No new tables.

ALTER TABLE b2b_prospects
  ADD COLUMN IF NOT EXISTS relationship_strength VARCHAR(30) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS opportunity_potential VARCHAR(30) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS timing_status VARCHAR(30) DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS founder_notes TEXT;

COMMENT ON COLUMN b2b_prospects.relationship_strength IS 'unknown | cold | met_once | known | worked_together | trusted_partner';
COMMENT ON COLUMN b2b_prospects.opportunity_potential IS 'low | medium | high | strategic | unknown';
COMMENT ON COLUMN b2b_prospects.timing_status IS 'unknown | active_project | quoting_projects | growth_mode | slow_period';
COMMENT ON COLUMN b2b_prospects.founder_notes IS 'Founder-only context AI cannot infer';

ALTER TABLE builder_target_scores
  ADD COLUMN IF NOT EXISTS founder_priority_score INT,
  ADD COLUMN IF NOT EXISTS founder_priority_band VARCHAR(1),
  ADD COLUMN IF NOT EXISTS founder_priority_breakdown JSONB;

COMMENT ON COLUMN builder_target_scores.founder_priority_score IS '0–100 composite: fit + relationship + timing + follow-up (PR8E.1)';
COMMENT ON COLUMN builder_target_scores.founder_priority_band IS 'A | B | C | D — A≥90, B≥75, C≥60, D<60';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_opportunity_potential
  ON b2b_prospects(opportunity_potential)
  WHERE prospect_type = 'builder';

CREATE INDEX IF NOT EXISTS idx_builder_target_scores_founder_priority
  ON builder_target_scores(founder_priority_score DESC NULLS LAST);
