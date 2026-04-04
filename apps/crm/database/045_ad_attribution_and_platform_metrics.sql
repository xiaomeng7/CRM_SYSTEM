-- Phase 1: attribution fact table + ad platform daily metrics (Google-first; Meta-ready).
-- Prereq: 028/030 (leads, opportunities), 039 (campaigns.google_campaign_id).

-- =============================================================================
-- 1) lead_attribution_events — append-only facts for audit + joins
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_attribution_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  event_type VARCHAR(64) NOT NULL,
  source VARCHAR(64),
  platform VARCHAR(32),

  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ad_group_id UUID,
  ad_id UUID,
  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,
  landing_variant_id UUID REFERENCES landing_page_variants(id) ON DELETE SET NULL,

  click_id VARCHAR(512),
  session_id VARCHAR(255),
  landing_page_url TEXT,
  referrer_url TEXT,

  utm_source VARCHAR(255),
  utm_medium VARCHAR(255),
  utm_campaign VARCHAR(255),
  utm_term VARCHAR(255),
  utm_content VARCHAR(255),

  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE SET NULL,

  revenue_amount NUMERIC(14, 2),
  currency_code VARCHAR(8) NOT NULL DEFAULT 'AUD',

  notes TEXT,
  raw_payload_json JSONB,
  dedupe_key VARCHAR(512),

  CONSTRAINT chk_lead_attribution_event_type CHECK (char_length(event_type) > 0)
);

CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_lead_id ON lead_attribution_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_campaign_id ON lead_attribution_events(campaign_id);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_created_at ON lead_attribution_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_event_type ON lead_attribution_events(event_type);
CREATE INDEX IF NOT EXISTS idx_lead_attribution_events_platform ON lead_attribution_events(platform);

-- One canonical row per lead for lead_created (re-ingest safe).
CREATE UNIQUE INDEX IF NOT EXISTS uq_lead_attribution_lead_created
  ON lead_attribution_events (lead_id)
  WHERE event_type = 'lead_created';

COMMENT ON TABLE lead_attribution_events IS
  'Append-only attribution facts. FKs on core entities where stable; ad_group/ad/landing_variant reserved for future platform IDs.';
COMMENT ON COLUMN lead_attribution_events.dedupe_key IS
  'Optional idempotency key for batch jobs; lead_created uses implicit unique on lead_id.';
COMMENT ON COLUMN lead_attribution_events.ad_group_id IS
  'Reserved for future local ad_group entity; nullable.';
COMMENT ON COLUMN lead_attribution_events.ad_id IS
  'Reserved for future local ad entity; nullable.';
COMMENT ON COLUMN lead_attribution_events.landing_variant_id IS
  'FK to landing_page_variants when intake passes variant id; usually null until wired.';

DROP TRIGGER IF EXISTS update_lead_attribution_events_updated_at ON lead_attribution_events;
CREATE TRIGGER update_lead_attribution_events_updated_at
  BEFORE UPDATE ON lead_attribution_events
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();

-- =============================================================================
-- 2) ad_platform_daily_metrics — daily grain per platform row (campaign v1)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ad_platform_daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_date DATE NOT NULL,
  platform VARCHAR(32) NOT NULL,

  account_external_id VARCHAR(64) NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_external_id VARCHAR(64) NOT NULL,
  ad_group_external_id VARCHAR(64) NOT NULL DEFAULT '',
  ad_external_id VARCHAR(64) NOT NULL DEFAULT '',

  creative_id UUID REFERENCES ad_creatives(id) ON DELETE SET NULL,

  currency_code VARCHAR(8) NOT NULL DEFAULT 'AUD',

  impressions BIGINT NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks BIGINT NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  cost NUMERIC(14, 4) NOT NULL DEFAULT 0 CHECK (cost >= 0),
  conversions NUMERIC(14, 4),
  conversion_value NUMERIC(14, 4),

  raw_payload_json JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) NOT NULL DEFAULT 'google-ads-sync'
);

COMMENT ON TABLE ad_platform_daily_metrics IS
  'Daily ad metrics from platforms. v1: Google campaign-level rows (ad_group/ad empty). CTR/CPC computed in queries.';
COMMENT ON COLUMN ad_platform_daily_metrics.ad_group_external_id IS
  'Empty string when not applicable (campaign-level sync).';
COMMENT ON COLUMN ad_platform_daily_metrics.ad_external_id IS
  'Empty string when not applicable; reserved for ad-level sync.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_platform_daily_metrics_grain
  ON ad_platform_daily_metrics (
    metric_date,
    platform,
    account_external_id,
    campaign_external_id,
    ad_group_external_id,
    ad_external_id
  );

CREATE INDEX IF NOT EXISTS idx_ad_platform_daily_metrics_date ON ad_platform_daily_metrics(metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_ad_platform_daily_metrics_campaign_id ON ad_platform_daily_metrics(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_platform_daily_metrics_platform ON ad_platform_daily_metrics(platform);

DROP TRIGGER IF EXISTS update_ad_platform_daily_metrics_updated_at ON ad_platform_daily_metrics;
CREATE TRIGGER update_ad_platform_daily_metrics_updated_at
  BEFORE UPDATE ON ad_platform_daily_metrics
  FOR EACH ROW
  EXECUTE PROCEDURE update_domain_updated_at();
