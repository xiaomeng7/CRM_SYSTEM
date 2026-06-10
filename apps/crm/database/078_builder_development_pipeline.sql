-- PR10A — Builder development pipeline stage + activity log

ALTER TABLE b2b_prospects
  ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(40) DEFAULT 'target';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_pipeline_stage
  ON b2b_prospects (pipeline_stage)
  WHERE prospect_type = 'builder';

CREATE TABLE IF NOT EXISTS builder_pipeline_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  activity_type VARCHAR(40) NOT NULL DEFAULT 'stage_change',
  from_stage VARCHAR(40),
  to_stage VARCHAR(40),
  body TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_pipeline_activity_prospect
  ON builder_pipeline_activity (prospect_id, created_at DESC);

-- Backfill from existing builder fields
UPDATE b2b_prospects p
SET pipeline_stage = CASE
  WHEN p.builder_status = 'strategic_partner' THEN 'strategic_partner'
  WHEN p.builder_status = 'active_partner' THEN 'active_builder'
  WHEN p.builder_status = 'inactive_partner' THEN 'inactive'
  WHEN p.relationship_stage IN ('proposal_sent') THEN 'opportunity'
  WHEN p.relationship_stage IN ('working_together') THEN 'active_builder'
  WHEN p.relationship_stage IN ('meeting_booked', 'contacted') THEN 'relationship_building'
  WHEN p.relationship_stage IN ('qualified')
    AND COALESCE(NULLIF(TRIM(p.contact_name), ''), NULLIF(TRIM(p.decision_maker_name), ''), NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(p.email), '')) IS NOT NULL
    THEN 'contact_ready'
  WHEN p.research_status = 'researched'
    AND COALESCE(NULLIF(TRIM(p.contact_name), ''), NULLIF(TRIM(p.decision_maker_name), ''), NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(p.email), '')) IS NOT NULL
    THEN 'contact_ready'
  WHEN p.research_status IN ('researched', 'needs_update') THEN 'contact_discovery'
  ELSE 'target'
END
WHERE p.prospect_type = 'builder'
  AND (p.pipeline_stage IS NULL OR p.pipeline_stage = 'target');
