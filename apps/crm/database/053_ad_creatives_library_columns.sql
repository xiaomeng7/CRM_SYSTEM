-- Ad Creative Library: extend existing ad_creatives (028) with managed copy fields.
-- Keeps legacy columns (campaign_id, name, metadata, etc.) for FKs from leads / metrics.

ALTER TABLE ad_creatives
  ADD COLUMN IF NOT EXISTS platform VARCHAR(32) NOT NULL DEFAULT 'google',
  ADD COLUMN IF NOT EXISTS product_line VARCHAR(50),
  ADD COLUMN IF NOT EXISTS angle VARCHAR(64),
  ADD COLUMN IF NOT EXISTS headline TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS cta TEXT,
  ADD COLUMN IF NOT EXISTS version VARCHAR(64);

COMMENT ON COLUMN ad_creatives.platform IS 'Ad platform, e.g. google, meta.';
COMMENT ON COLUMN ad_creatives.product_line IS 'pre_purchase | rental | energy';
COMMENT ON COLUMN ad_creatives.angle IS 'Messaging angle: risk, safety, cost, negotiation, etc.';
COMMENT ON COLUMN ad_creatives.headline IS 'Primary ad headline (asset).';
COMMENT ON COLUMN ad_creatives.description IS 'Ad description / body.';
COMMENT ON COLUMN ad_creatives.cta IS 'Call to action text.';
COMMENT ON COLUMN ad_creatives.version IS 'Human-readable creative version label (e.g. v1, 2026-04-a).';

CREATE INDEX IF NOT EXISTS idx_ad_creatives_product_line ON ad_creatives (product_line)
  WHERE product_line IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ad_creatives_library_status ON ad_creatives (status, platform);

DROP TRIGGER IF EXISTS update_ad_creatives_updated_at ON ad_creatives;
CREATE TRIGGER update_ad_creatives_updated_at
  BEFORE UPDATE ON ad_creatives
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
