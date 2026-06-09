-- Migration 072: Builder Research Intelligence Refinement (PR8D.1)
-- Founder decision-support fields on builder_profiles. Idempotent.

ALTER TABLE builder_profiles
  ADD COLUMN IF NOT EXISTS founder_summary TEXT,
  ADD COLUMN IF NOT EXISTS why_bht_fit TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opportunity_summary TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS recommended_founder_action TEXT,
  ADD COLUMN IF NOT EXISTS score_breakdown JSONB;

COMMENT ON COLUMN builder_profiles.founder_summary IS 'Concise founder-facing summary (PR8D.1)';
COMMENT ON COLUMN builder_profiles.why_bht_fit IS 'Up to 5 bullets: why Better Home fits';
COMMENT ON COLUMN builder_profiles.opportunity_summary IS 'Up to 5 bullets: partnership opportunity';
COMMENT ON COLUMN builder_profiles.recommended_founder_action IS 'Deterministic next action for founder';
COMMENT ON COLUMN builder_profiles.score_breakdown IS 'Auditable fit score breakdown (base/quality/risks/synergy)';
