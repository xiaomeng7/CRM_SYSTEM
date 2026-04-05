-- Inspector partnership program: partners + unique source_code for lead.sub_source when lead.source = 'inspector'.

CREATE TABLE IF NOT EXISTS inspectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  company_name VARCHAR(255),
  phone VARCHAR(64),
  email VARCHAR(255),
  source_code VARCHAR(128) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inspectors_source_code_key UNIQUE (source_code)
);

CREATE INDEX IF NOT EXISTS idx_inspectors_status ON inspectors (status);

COMMENT ON TABLE inspectors IS 'Building/elec inspectors; source_code matches leads.sub_source when leads.source = inspector.';
COMMENT ON COLUMN inspectors.source_code IS 'URL sub param; lowercase [a-z0-9_], unique.';
