-- Ad Execution Engine v1: queue rows with publish-ready JSON payloads (no API publish here).
-- Prereq: 040_ad_generation_engine.sql (ad_variants, landing_page_variants), campaigns (028).

CREATE TABLE IF NOT EXISTS ad_execution_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID REFERENCES ad_variants(id) ON DELETE SET NULL,
  landing_variant_id UUID REFERENCES landing_page_variants(id) ON DELETE SET NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_key TEXT,

  channel VARCHAR(50) NOT NULL,
  payload JSONB NOT NULL,

  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  execution_notes TEXT,
  executed_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100) DEFAULT 'ad-execution-engine'
);

CREATE INDEX IF NOT EXISTS idx_ad_execution_queue_status ON ad_execution_queue(status);
CREATE INDEX IF NOT EXISTS idx_ad_execution_queue_campaign_id ON ad_execution_queue(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_execution_queue_created_at ON ad_execution_queue(created_at DESC);

-- At most one queue row per non-null ad variant (enqueue idempotency).
-- PostgreSQL UNIQUE treats NULLs as distinct, so multiple NULL variant_id rows remain possible for future use.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_execution_queue_variant_id ON ad_execution_queue (variant_id);

COMMENT ON TABLE ad_execution_queue IS 'Publish-ready ad payloads; pending→ready→executed (executed by OpenClaw or manual later).';
