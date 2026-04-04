-- Phase 3: gclid quality tier + conversion value_source (nullable, backward compatible).
-- Prereq: 046.

ALTER TABLE google_offline_conversion_events
  ADD COLUMN IF NOT EXISTS gclid_quality VARCHAR(16),
  ADD COLUMN IF NOT EXISTS value_source VARCHAR(32);

COMMENT ON COLUMN google_offline_conversion_events.gclid_quality IS
  'Enqueue-time tier: high (attribution gclid), medium (lead gclid), low (click_id fallback), NULL if no gclid.';

COMMENT ON COLUMN google_offline_conversion_events.value_source IS
  'opportunity_won: quote | estimate | fallback. invoice_paid: invoice.';

CREATE INDEX IF NOT EXISTS idx_google_offline_gclid_quality
  ON google_offline_conversion_events (event_type, gclid_quality)
  WHERE gclid_quality IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_google_offline_value_source
  ON google_offline_conversion_events (event_type, value_source)
  WHERE value_source IS NOT NULL;
