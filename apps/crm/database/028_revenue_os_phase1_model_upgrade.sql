-- Revenue OS Phase 1 data model upgrade (additive, backward-compatible)
-- Safe to run repeatedly.

-- =============================================================================
-- New reference tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS lead_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  channel VARCHAR(50),
  active BOOLEAN DEFAULT TRUE,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
  code VARCHAR(100) UNIQUE,
  name VARCHAR(255) NOT NULL,
  objective VARCHAR(100),
  status VARCHAR(30) DEFAULT 'draft',
  starts_at DATE,
  ends_at DATE,
  budget_amount NUMERIC(12, 2),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ad_creatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE,
  source_id UUID REFERENCES lead_sources(id) ON DELETE SET NULL,
  creative_code VARCHAR(100),
  name VARCHAR(255) NOT NULL,
  creative_type VARCHAR(50),
  landing_url TEXT,
  status VARCHAR(30) DEFAULT 'active',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (campaign_id, creative_code)
);

CREATE TABLE IF NOT EXISTS lead_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  score NUMERIC(6, 2) NOT NULL,
  score_grade VARCHAR(20),
  model_version VARCHAR(50),
  reasons JSONB DEFAULT '[]'::jsonb,
  features JSONB DEFAULT '{}'::jsonb,
  scored_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (score >= 0)
);

CREATE TABLE IF NOT EXISTS weekly_business_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start_date DATE NOT NULL,
  week_end_date DATE NOT NULL,
  leads_created INTEGER DEFAULT 0,
  opportunities_created INTEGER DEFAULT 0,
  opportunities_won INTEGER DEFAULT 0,
  opportunities_lost INTEGER DEFAULT 0,
  invoices_issued INTEGER DEFAULT 0,
  revenue_invoiced NUMERIC(14, 2) DEFAULT 0,
  revenue_paid NUMERIC(14, 2) DEFAULT 0,
  outstanding_amount NUMERIC(14, 2) DEFAULT 0,
  snapshot_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (week_start_date)
);

CREATE TABLE IF NOT EXISTS integration_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider VARCHAR(50) NOT NULL,
  external_entity_type VARCHAR(50) NOT NULL,
  external_id VARCHAR(255) NOT NULL,
  internal_entity_type VARCHAR(50) NOT NULL,
  internal_entity_id UUID NOT NULL,
  sync_status VARCHAR(30) DEFAULT 'active',
  linked_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (provider, external_entity_type, external_id),
  UNIQUE (provider, internal_entity_type, internal_entity_id, external_entity_type)
);

-- =============================================================================
-- Existing table additions (all nullable/additive to avoid breakage)
-- =============================================================================

-- leads
ALTER TABLE leads ADD COLUMN IF NOT EXISTS source_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS creative_id UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_interest VARCHAR(100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS budget_signal VARCHAR(50);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS urgency_level VARCHAR(20);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_source_id') THEN
    ALTER TABLE leads
      ADD CONSTRAINT fk_leads_source_id
      FOREIGN KEY (source_id) REFERENCES lead_sources(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_campaign_id') THEN
    ALTER TABLE leads
      ADD CONSTRAINT fk_leads_campaign_id
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_creative_id') THEN
    ALTER TABLE leads
      ADD CONSTRAINT fk_leads_creative_id
      FOREIGN KEY (creative_id) REFERENCES ad_creatives(id) ON DELETE SET NULL;
  END IF;
END $$;

-- opportunities
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS pipeline VARCHAR(50);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(12, 2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS probability NUMERIC(5, 2);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS expected_close_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lost_at TIMESTAMPTZ;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_opportunities_probability_range') THEN
    ALTER TABLE opportunities
      ADD CONSTRAINT chk_opportunities_probability_range
      CHECK (probability IS NULL OR (probability >= 0 AND probability <= 100));
  END IF;
END $$;

-- invoices
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_paid NUMERIC(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount_due NUMERIC(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;

-- contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role VARCHAR(100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(20);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_replied_at TIMESTAMPTZ;

-- tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS opportunity_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS invoice_id UUID;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS assigned_to VARCHAR(100);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_tasks_invoice_id') THEN
    ALTER TABLE tasks
      ADD CONSTRAINT fk_tasks_invoice_id
      FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_campaigns_source_id ON campaigns(source_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_campaign_id ON ad_creatives(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ad_creatives_source_id ON ad_creatives(source_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_lead_id ON lead_scores(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_scores_scored_at ON lead_scores(scored_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_business_snapshots_week_start ON weekly_business_snapshots(week_start_date DESC);
CREATE INDEX IF NOT EXISTS idx_integration_links_internal ON integration_links(internal_entity_type, internal_entity_id);
CREATE INDEX IF NOT EXISTS idx_integration_links_last_synced_at ON integration_links(last_synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_source_id ON leads(source_id);
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_creative_id ON leads(creative_id);
CREATE INDEX IF NOT EXISTS idx_leads_utm_campaign ON leads(utm_campaign);
CREATE INDEX IF NOT EXISTS idx_leads_product_interest ON leads(product_interest);
CREATE INDEX IF NOT EXISTS idx_leads_budget_signal ON leads(budget_signal);
CREATE INDEX IF NOT EXISTS idx_leads_urgency_level ON leads(urgency_level);

CREATE INDEX IF NOT EXISTS idx_opportunities_pipeline ON opportunities(pipeline);
CREATE INDEX IF NOT EXISTS idx_opportunities_expected_close_date ON opportunities(expected_close_date);
CREATE INDEX IF NOT EXISTS idx_opportunities_won_at ON opportunities(won_at);
CREATE INDEX IF NOT EXISTS idx_opportunities_lost_at ON opportunities(lost_at);

CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at);
CREATE INDEX IF NOT EXISTS idx_invoices_last_reminder_at ON invoices(last_reminder_at);

CREATE INDEX IF NOT EXISTS idx_contacts_preferred_channel ON contacts(preferred_channel) WHERE preferred_channel IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_last_replied_at ON contacts(last_replied_at) WHERE last_replied_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_invoice_id ON tasks(invoice_id);
CREATE INDEX IF NOT EXISTS idx_tasks_completed_at ON tasks(completed_at) WHERE completed_at IS NOT NULL;

-- =============================================================================
-- Views
-- =============================================================================

CREATE OR REPLACE VIEW v_latest_lead_scores AS
SELECT DISTINCT ON (ls.lead_id)
  ls.id,
  ls.lead_id,
  ls.score,
  ls.score_grade,
  ls.model_version,
  ls.reasons,
  ls.features,
  ls.scored_at,
  ls.created_at
FROM lead_scores ls
ORDER BY ls.lead_id, ls.scored_at DESC, ls.created_at DESC, ls.id DESC;

CREATE OR REPLACE VIEW v_campaign_revenue_summary AS
WITH leads_by_campaign AS (
  SELECT
    l.campaign_id,
    COUNT(*) AS leads_count,
    COUNT(*) FILTER (WHERE l.status = 'converted' OR l.converted_opportunity_id IS NOT NULL) AS converted_leads_count
  FROM leads l
  WHERE l.campaign_id IS NOT NULL
  GROUP BY l.campaign_id
),
opps_by_campaign AS (
  SELECT
    l.campaign_id,
    COUNT(o.id) AS opportunities_count,
    COUNT(o.id) FILTER (WHERE o.stage = 'won') AS won_opportunities_count,
    COUNT(o.id) FILTER (WHERE o.stage = 'lost') AS lost_opportunities_count,
    COALESCE(SUM(COALESCE(o.estimated_value, o.value_estimate, 0)) FILTER (WHERE o.stage = 'won'), 0) AS won_revenue_estimated,
    COALESCE(SUM(COALESCE(o.estimated_value, o.value_estimate, 0) * (COALESCE(o.probability, 0) / 100.0))
      FILTER (WHERE o.stage NOT IN ('won', 'lost')), 0) AS pipeline_weighted_revenue
  FROM leads l
  LEFT JOIN opportunities o ON o.lead_id = l.id
  WHERE l.campaign_id IS NOT NULL
  GROUP BY l.campaign_id
)
SELECT
  c.id AS campaign_id,
  c.code AS campaign_code,
  c.name AS campaign_name,
  c.status AS campaign_status,
  c.starts_at,
  c.ends_at,
  c.budget_amount,
  COALESCE(lb.leads_count, 0) AS leads_count,
  COALESCE(lb.converted_leads_count, 0) AS converted_leads_count,
  COALESCE(ob.opportunities_count, 0) AS opportunities_count,
  COALESCE(ob.won_opportunities_count, 0) AS won_opportunities_count,
  COALESCE(ob.lost_opportunities_count, 0) AS lost_opportunities_count,
  COALESCE(ob.won_revenue_estimated, 0) AS won_revenue_estimated,
  COALESCE(ob.pipeline_weighted_revenue, 0) AS pipeline_weighted_revenue,
  CASE
    WHEN COALESCE(lb.leads_count, 0) = 0 THEN 0::numeric
    ELSE ROUND(COALESCE(lb.converted_leads_count, 0)::numeric / lb.leads_count::numeric, 4)
  END AS lead_conversion_rate
FROM campaigns c
LEFT JOIN leads_by_campaign lb ON lb.campaign_id = c.id
LEFT JOIN opps_by_campaign ob ON ob.campaign_id = c.id;

-- =============================================================================
-- updated_at triggers for newly introduced tables
-- =============================================================================

CREATE OR REPLACE FUNCTION update_domain_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
  tbls TEXT[] := ARRAY[
    'lead_sources',
    'campaigns',
    'ad_creatives',
    'weekly_business_snapshots',
    'integration_links'
  ];
BEGIN
  FOREACH t IN ARRAY tbls
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%s_updated_at ON %I', t, t);
    EXECUTE format('CREATE TRIGGER update_%s_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE PROCEDURE update_domain_updated_at()', t, t);
  END LOOP;
END $$;
