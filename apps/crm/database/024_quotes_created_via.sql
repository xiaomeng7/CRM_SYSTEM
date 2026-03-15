-- Phase 2B: CRM -> ServiceM8 quote creation — created_via for traceability.

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS created_via VARCHAR(50);

COMMENT ON COLUMN quotes.created_via IS 'Creation source: crm | servicem8_sync | null.';

CREATE INDEX IF NOT EXISTS idx_quotes_created_via ON quotes(created_via) WHERE created_via IS NOT NULL;
