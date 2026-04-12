-- Migration 063: generic JSON metadata on opportunities (report CTAs, integrations, etc.)
-- Idempotent — safe to re-run

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN opportunities.metadata IS
  'Extensible JSON: e.g. source, pre_purchase_inspection_id, report_cta. Does not replace core FK columns.';
