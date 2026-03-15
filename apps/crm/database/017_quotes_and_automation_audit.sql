-- Quotes table + automation_audit_log for quote status sync.
-- ServiceM8 quote → CRM opportunities / tasks / forecast.

-- Opportunities: add lost_at, lost_reason, next_action_at if missing
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_reason TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_action_at TIMESTAMP WITH TIME ZONE;

-- =============================================================================
-- QUOTES (from ServiceM8 job quote / quote attachment)
-- =============================================================================
CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  servicem8_quote_uuid VARCHAR(100) UNIQUE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  job_id UUID REFERENCES jobs(id) ON DELETE SET NULL,
  amount DECIMAL(12, 2),
  status VARCHAR(50),
  sent_at TIMESTAMP WITH TIME ZONE,
  accepted_at TIMESTAMP WITH TIME ZONE,
  declined_at TIMESTAMP WITH TIME ZONE,
  expires_at DATE,
  followup_state VARCHAR(50),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_by VARCHAR(100),
  raw_payload_json JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_servicem8_uuid
  ON quotes(servicem8_quote_uuid) WHERE servicem8_quote_uuid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_sent_at ON quotes(sent_at) WHERE sent_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_opportunity_id ON quotes(opportunity_id) WHERE opportunity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_job_id ON quotes(job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_account_id ON quotes(account_id) WHERE account_id IS NOT NULL;

-- =============================================================================
-- AUTOMATION_AUDIT_LOG (quote_accepted, quote_declined, etc.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS automation_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id UUID,
  source VARCHAR(100),
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_audit_event_type ON automation_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_automation_audit_entity ON automation_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_automation_audit_created_at ON automation_audit_log(created_at);

-- updated_at trigger for quotes
DROP TRIGGER IF EXISTS update_quotes_updated_at ON quotes;
CREATE TRIGGER update_quotes_updated_at
  BEFORE UPDATE ON quotes
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
