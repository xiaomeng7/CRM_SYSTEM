-- Migration 043: product_type on leads/opportunities, account_type on accounts, b2b_prospects table
-- Idempotent — safe to re-run

-- 1. leads: add product_type
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_type VARCHAR(50);

COMMENT ON COLUMN leads.product_type IS
  'Product line: rental_lite | pre_purchase | essential | energy_audit';

CREATE INDEX IF NOT EXISTS idx_leads_product_type ON leads(product_type);

-- 2. opportunities: add product_type (parallel field for pipeline)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS product_type VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_opps_product_type ON opportunities(product_type);

-- 3. accounts: add account_type to distinguish B2B from B2C
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type VARCHAR(30) DEFAULT 'residential';

-- residential | rental_agency | corporate | partner
COMMENT ON COLUMN accounts.account_type IS
  'residential | rental_agency | corporate | partner';

CREATE INDEX IF NOT EXISTS idx_accounts_account_type ON accounts(account_type);

-- 4. b2b_prospects: outreach list for rental agencies and partners
CREATE TABLE IF NOT EXISTS b2b_prospects (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name  VARCHAR(255) NOT NULL,
  contact_name  VARCHAR(255),
  phone         VARCHAR(50),
  email         VARCHAR(255),
  address       VARCHAR(500),
  suburb        VARCHAR(100),
  website       VARCHAR(500),
  portfolio_size VARCHAR(20),            -- '1-5' | '6-20' | '21-50' | '50+'
  prospect_type VARCHAR(30) DEFAULT 'rental_agency',  -- rental_agency | building_inspector | partner
  outreach_status VARCHAR(30) DEFAULT 'not_contacted',
  -- not_contacted | email_sent | called | meeting_booked | converted | not_interested
  last_contacted_at TIMESTAMPTZ,
  next_followup_at  TIMESTAMPTZ,
  notes         TEXT,
  source        VARCHAR(100),            -- how we found them: google_maps | referral | manual | csv_import
  linked_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  -- once they become a client, link to accounts table
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_prospects_status   ON b2b_prospects(outreach_status);
CREATE INDEX IF NOT EXISTS idx_b2b_prospects_type     ON b2b_prospects(prospect_type);
CREATE INDEX IF NOT EXISTS idx_b2b_prospects_suburb   ON b2b_prospects(suburb);
CREATE INDEX IF NOT EXISTS idx_b2b_prospects_email    ON b2b_prospects(email);

-- auto-update updated_at
CREATE OR REPLACE FUNCTION update_b2b_prospects_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_b2b_prospects_updated_at ON b2b_prospects;
CREATE TRIGGER trg_b2b_prospects_updated_at
  BEFORE UPDATE ON b2b_prospects
  FOR EACH ROW EXECUTE FUNCTION update_b2b_prospects_updated_at();

-- 5. b2b outreach activities log (SMS / email sends to prospects)
CREATE TABLE IF NOT EXISTS b2b_outreach_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prospect_id     UUID NOT NULL REFERENCES b2b_prospects(id) ON DELETE CASCADE,
  channel         VARCHAR(20) NOT NULL,  -- sms | email
  message_body    TEXT,
  status          VARCHAR(20) DEFAULT 'sent',  -- sent | delivered | failed | replied
  sent_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_b2b_outreach_prospect ON b2b_outreach_log(prospect_id);
