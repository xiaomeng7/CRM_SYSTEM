-- PR10B — Builder contact discovery candidates

CREATE TABLE IF NOT EXISTS builder_contact_discovery_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  status VARCHAR(40) NOT NULL DEFAULT 'running',
  sources_checked JSONB NOT NULL DEFAULT '[]'::jsonb,
  candidates_found INT NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_builder_contact_discovery_runs_prospect
  ON builder_contact_discovery_runs (prospect_id, started_at DESC);

CREATE TABLE IF NOT EXISTS builder_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  discovery_run_id UUID REFERENCES builder_contact_discovery_runs(id) ON DELETE SET NULL,
  name VARCHAR(255),
  role VARCHAR(120),
  email VARCHAR(255),
  phone VARCHAR(80),
  linkedin_url VARCHAR(500),
  confidence_score INT NOT NULL DEFAULT 0,
  confidence_band VARCHAR(20) NOT NULL DEFAULT 'low',
  source_type VARCHAR(40) NOT NULL DEFAULT 'website',
  source_url TEXT,
  reason TEXT,
  is_recommended BOOLEAN NOT NULL DEFAULT false,
  founder_confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_builder_contacts_prospect
  ON builder_contacts (prospect_id, is_recommended DESC, confidence_score DESC);

CREATE INDEX IF NOT EXISTS idx_builder_contacts_recommended
  ON builder_contacts (prospect_id)
  WHERE is_recommended = true AND founder_confirmed = false;
