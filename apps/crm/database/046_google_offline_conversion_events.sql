-- Phase 1 step 2: Google Offline Conversion queue / audit log (minimal, retryable).
-- Prereq: 028/033/045 domain tables.

CREATE TABLE IF NOT EXISTS google_offline_conversion_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  status VARCHAR(32) NOT NULL DEFAULT 'pending', -- pending | sent | failed | skipped
  event_type VARCHAR(64) NOT NULL,               -- invoice_paid (v1)

  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,

  click_id VARCHAR(512),
  gclid VARCHAR(512),

  conversion_action_name VARCHAR(255),
  conversion_action_resource_name VARCHAR(255),
  conversion_time TIMESTAMPTZ,
  conversion_value NUMERIC(14, 4),
  currency_code VARCHAR(8) NOT NULL DEFAULT 'AUD',
  platform VARCHAR(32) NOT NULL DEFAULT 'google',

  source_payload_json JSONB,
  response_payload_json JSONB,
  error_message TEXT,

  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  dedupe_key VARCHAR(512),

  created_by VARCHAR(100) NOT NULL DEFAULT 'google-offline-conversions',
  CONSTRAINT chk_google_offline_status CHECK (status IN ('pending', 'sent', 'failed', 'skipped')),
  CONSTRAINT chk_google_offline_platform CHECK (platform IN ('google'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_google_offline_conversion_dedupe_key
  ON google_offline_conversion_events(dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_status
  ON google_offline_conversion_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_event_type
  ON google_offline_conversion_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_invoice_id
  ON google_offline_conversion_events(invoice_id);
CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_lead_id
  ON google_offline_conversion_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_campaign_id
  ON google_offline_conversion_events(campaign_id);

COMMENT ON TABLE google_offline_conversion_events IS
  'Queue + audit log for Google offline conversion uploads. Supports retries and full payload trace.';
COMMENT ON COLUMN google_offline_conversion_events.dedupe_key IS
  'Idempotency key per business event, e.g. invoice_paid:<invoice_id>.';

DROP TRIGGER IF EXISTS update_google_offline_conversion_events_updated_at ON google_offline_conversion_events;
CREATE TRIGGER update_google_offline_conversion_events_updated_at
  BEFORE UPDATE ON google_offline_conversion_events
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
