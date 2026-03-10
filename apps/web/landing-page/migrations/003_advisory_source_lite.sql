-- Add source and lite_snapshot for Lite → Pro attribution
-- Run: psql "$NEON_DATABASE_URL" -f migrations/003_advisory_source_lite.sql

ALTER TABLE advisory_applications
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'pro_direct',
  ADD COLUMN IF NOT EXISTS lite_snapshot TEXT;

COMMENT ON COLUMN advisory_applications.source IS 'pro_direct | lite_upgrade';
COMMENT ON COLUMN advisory_applications.lite_snapshot IS 'JSON string of Lite result snapshot when source=lite_upgrade';
