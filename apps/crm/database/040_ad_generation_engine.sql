-- Ad Generation Engine v1: ad copy + landing page variant storage (read-only API; no publish).
-- Prereq: campaigns (028), update_domain_updated_at() (028).

-- =============================================================================
-- ad_variants
-- =============================================================================
CREATE TABLE IF NOT EXISTS ad_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel VARCHAR(50) NOT NULL,
  product_focus VARCHAR(100),
  audience_segment VARCHAR(100),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_key TEXT,
  source_context JSONB,
  headline TEXT NOT NULL,
  body_text TEXT NOT NULL,
  call_to_action TEXT,
  variant_label VARCHAR(50),
  generation_method VARCHAR(50) NOT NULL DEFAULT 'ai',
  model_provider VARCHAR(50),
  model_version VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'ad-generation-engine'
);

CREATE INDEX IF NOT EXISTS idx_ad_variants_status ON ad_variants(status);
CREATE INDEX IF NOT EXISTS idx_ad_variants_channel ON ad_variants(channel);
CREATE INDEX IF NOT EXISTS idx_ad_variants_campaign_id ON ad_variants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_variants_created_at ON ad_variants(created_at DESC);

COMMENT ON TABLE ad_variants IS 'Generated ad copy variants (draft until approved); not auto-published.';

-- =============================================================================
-- landing_page_variants
-- =============================================================================
CREATE TABLE IF NOT EXISTS landing_page_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_key VARCHAR(100) NOT NULL,
  product_focus VARCHAR(100),
  audience_segment VARCHAR(100),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_key TEXT,
  headline TEXT NOT NULL,
  subheadline TEXT,
  cta_text TEXT,
  supporting_angle TEXT,
  generation_method VARCHAR(50) NOT NULL DEFAULT 'ai',
  model_provider VARCHAR(50),
  model_version VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  source_context JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'ad-generation-engine'
);

CREATE INDEX IF NOT EXISTS idx_landing_page_variants_status ON landing_page_variants(status);
CREATE INDEX IF NOT EXISTS idx_landing_page_variants_page_key ON landing_page_variants(page_key);
CREATE INDEX IF NOT EXISTS idx_landing_page_variants_campaign_id ON landing_page_variants(campaign_id);
CREATE INDEX IF NOT EXISTS idx_landing_page_variants_created_at ON landing_page_variants(created_at DESC);

COMMENT ON TABLE landing_page_variants IS 'Generated landing page headline/CTA variants; LP code not modified here.';

-- =============================================================================
-- updated_at triggers (function from 028)
-- =============================================================================
DROP TRIGGER IF EXISTS update_ad_variants_updated_at ON ad_variants;
CREATE TRIGGER update_ad_variants_updated_at
  BEFORE UPDATE ON ad_variants
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();

DROP TRIGGER IF EXISTS update_landing_page_variants_updated_at ON landing_page_variants;
CREATE TRIGGER update_landing_page_variants_updated_at
  BEFORE UPDATE ON landing_page_variants
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
