-- Hybrid lead scoring: optional columns for rule / AI decomposition (additive, idempotent).
-- Run: node scripts/run-lead-scores-hybrid-migration.js
-- Code falls back gracefully if columns are missing (dynamic INSERT).

ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS rule_score NUMERIC(6, 2);
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS ai_score NUMERIC(6, 2);
ALTER TABLE lead_scores ADD COLUMN IF NOT EXISTS scoring_method VARCHAR(32);

COMMENT ON COLUMN lead_scores.score IS 'Final blended score 0–100 (canonical for sorting and UI).';
COMMENT ON COLUMN lead_scores.rule_score IS 'Deterministic rule layer score before AI blend.';
COMMENT ON COLUMN lead_scores.ai_score IS 'Model raw score when AI ran; NULL if rules_only or rules_fallback.';
COMMENT ON COLUMN lead_scores.scoring_method IS 'rules_only | hybrid | rules_fallback';

CREATE OR REPLACE VIEW v_latest_lead_scores AS
SELECT DISTINCT ON (ls.lead_id)
  ls.id,
  ls.lead_id,
  ls.score,
  ls.rule_score,
  ls.ai_score,
  ls.scoring_method,
  ls.score_grade,
  ls.model_version,
  ls.reasons,
  ls.features,
  ls.scored_at,
  ls.created_at
FROM lead_scores ls
ORDER BY ls.lead_id, ls.scored_at DESC, ls.created_at DESC, ls.id DESC;
