-- Migration 069: Builder Prospect Foundation (PR8A)
-- Extends b2b_prospects for prospect_type = 'builder'. Idempotent.

-- Builder-specific columns on existing b2b_prospects table
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS builder_type VARCHAR(40) DEFAULT 'unknown';
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS project_focus VARCHAR(40) DEFAULT 'unknown';
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS target_suburbs TEXT;
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS fit_priority VARCHAR(20) DEFAULT 'unknown';
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS research_status VARCHAR(30) DEFAULT 'not_started';
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS relationship_stage VARCHAR(30) DEFAULT 'discovered';
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS decision_maker_name VARCHAR(255);
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS decision_maker_role VARCHAR(100);
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS qualification_notes TEXT;
ALTER TABLE b2b_prospects ADD COLUMN IF NOT EXISTS source_detail VARCHAR(500);

COMMENT ON COLUMN b2b_prospects.prospect_type IS
  'rental_agency | building_inspector | partner | builder';
COMMENT ON COLUMN b2b_prospects.builder_type IS
  'luxury_residential | custom_homes | architectural_homes | townhouse_developer | volume_builder | commercial_builder | unknown';
COMMENT ON COLUMN b2b_prospects.project_focus IS
  'architectural_new_build | custom_home | luxury_renovation | townhouse | small_developer | unknown';
COMMENT ON COLUMN b2b_prospects.fit_priority IS 'high | medium | low | unknown';
COMMENT ON COLUMN b2b_prospects.research_status IS
  'not_started | researching | researched | needs_update';
COMMENT ON COLUMN b2b_prospects.relationship_stage IS
  'discovered | researching | qualified | contacted | meeting_booked | proposal_sent | working_together | inactive | not_fit';
COMMENT ON COLUMN b2b_prospects.target_suburbs IS
  'Comma-separated Adelaide/SA suburbs of interest';
COMMENT ON COLUMN b2b_prospects.source_detail IS
  'Free-text detail for how this builder was found';

-- Indexes for builder pipeline queries
CREATE INDEX IF NOT EXISTS idx_b2b_prospects_relationship_stage
  ON b2b_prospects(relationship_stage)
  WHERE prospect_type = 'builder';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_fit_priority
  ON b2b_prospects(fit_priority)
  WHERE prospect_type = 'builder';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_builder_type
  ON b2b_prospects(builder_type)
  WHERE prospect_type = 'builder';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_research_status
  ON b2b_prospects(research_status)
  WHERE prospect_type = 'builder';

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_next_followup
  ON b2b_prospects(next_followup_at)
  WHERE prospect_type = 'builder' AND next_followup_at IS NOT NULL;

-- prospect_type index already exists as idx_b2b_prospects_type (043)
