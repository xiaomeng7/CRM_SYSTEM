-- Phase 2A: CRM → ServiceM8 job creation — traceability and idempotency.
-- jobs.source_opportunity_id: which opportunity triggered creation (one job per opportunity by convention).
-- jobs.created_via: 'crm' | 'servicem8-sync' | null (legacy).

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS created_via VARCHAR(50);

COMMENT ON COLUMN jobs.source_opportunity_id IS 'Opportunity from which this job was created (CRM create-servicem8-job).';
COMMENT ON COLUMN jobs.created_via IS 'Creation source: crm | servicem8-sync | null.';

CREATE INDEX IF NOT EXISTS idx_jobs_source_opportunity_id ON jobs(source_opportunity_id) WHERE source_opportunity_id IS NOT NULL;
