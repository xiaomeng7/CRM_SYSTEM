-- Snapshot of lead ad/LP intake fields on opportunity (inheritance for offline conversion + API).
-- Prereq: leads with gclid/utm_* (028/047/051 optional for lp/cv columns).

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS intake_attribution JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN opportunities.intake_attribution IS
  'JSON: gclid, utm_campaign, utm_content, landing_page_version, creative_version copied from lead at link/create.';
