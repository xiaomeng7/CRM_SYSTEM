-- PR10D.2 — Store pipeline state before founder dismisses a builder (for restore)

ALTER TABLE b2b_prospects
  ADD COLUMN IF NOT EXISTS dismiss_snapshot JSONB;

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_dismissed
  ON b2b_prospects (prospect_type, relationship_stage)
  WHERE relationship_stage = 'not_fit';
