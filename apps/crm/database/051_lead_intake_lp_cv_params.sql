-- URL param capture: lpv (landing page version), cv (creative version) at public lead intake.
-- Nullable; no FK (labels only, distinct from landing_variant_id UUID when present).

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS landing_page_version VARCHAR(128),
  ADD COLUMN IF NOT EXISTS creative_version VARCHAR(128);

COMMENT ON COLUMN leads.landing_page_version IS 'From landing URL param lpv; human-readable LP variant label.';
COMMENT ON COLUMN leads.creative_version IS 'From landing URL param cv; ad creative version label.';
