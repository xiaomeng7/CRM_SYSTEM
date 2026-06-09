-- Migration 074: Builder Segmentation — Prospects vs Partners (PR8E.3)
-- Extend b2b_prospects + builder_target_scores. Idempotent. No new tables.

ALTER TABLE b2b_prospects
  ADD COLUMN IF NOT EXISTS builder_status VARCHAR(30) DEFAULT 'prospect';

COMMENT ON COLUMN b2b_prospects.builder_status IS 'prospect | active_partner | strategic_partner | inactive_partner';

ALTER TABLE builder_target_scores
  ADD COLUMN IF NOT EXISTS partner_value_score INT,
  ADD COLUMN IF NOT EXISTS partner_value_band VARCHAR(1),
  ADD COLUMN IF NOT EXISTS partner_value_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS score_kind VARCHAR(20);

COMMENT ON COLUMN builder_target_scores.partner_value_score IS 'Partner relationship value score (PR8E.3)';
COMMENT ON COLUMN builder_target_scores.score_kind IS 'prospect_priority | partner_value';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_builder_status
  ON b2b_prospects(builder_status)
  WHERE prospect_type = 'builder';
