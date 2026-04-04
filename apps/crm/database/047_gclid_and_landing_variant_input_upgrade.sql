-- Phase 1 step 3: attribution input quality upgrade.
-- Separate gclid from click_id and persist landing_variant_id in leads + attribution.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS gclid VARCHAR(512),
  ADD COLUMN IF NOT EXISTS landing_variant_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_landing_variant_id') THEN
    ALTER TABLE leads
      ADD CONSTRAINT fk_leads_landing_variant_id
      FOREIGN KEY (landing_variant_id) REFERENCES landing_page_variants(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE lead_attribution_events
  ADD COLUMN IF NOT EXISTS gclid VARCHAR(512);

CREATE INDEX IF NOT EXISTS idx_leads_gclid
  ON leads(gclid) WHERE gclid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_landing_variant_id
  ON leads(landing_variant_id) WHERE landing_variant_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_gclid
  ON lead_attribution_events(gclid) WHERE gclid IS NOT NULL;

COMMENT ON COLUMN leads.click_id IS
  'Generic click identifier (e.g. fbclid/msclkid/ttclid/gclid when unknown mapping).';
COMMENT ON COLUMN leads.gclid IS
  'Google Ads click identifier (gclid) when explicitly captured.';
COMMENT ON COLUMN leads.landing_variant_id IS
  'Landing variant FK captured at lead intake time when provided by landing URL/context.';
COMMENT ON COLUMN lead_attribution_events.gclid IS
  'Google Ads click identifier captured for attribution event; separate from generic click_id.';
