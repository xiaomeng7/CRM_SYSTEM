-- Revenue OS Stage 1 Consolidation (additive, idempotent, backward-compatible)

-- =============================================================================
-- 1) Leads tracking fields
-- =============================================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS landing_page_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS referrer_url TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS click_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_leads_click_id
  ON leads(click_id) WHERE click_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_source_campaign
  ON leads(source_id, campaign_id);
CREATE INDEX IF NOT EXISTS idx_leads_created_source
  ON leads(created_at DESC, source_id);

COMMENT ON COLUMN leads.landing_page_url IS 'Landing page URL captured at lead intake.';
COMMENT ON COLUMN leads.referrer_url IS 'Referrer URL captured at lead intake.';
COMMENT ON COLUMN leads.click_id IS 'Ad click identifier (e.g. gclid/fbclid/msclkid/tclid).';

-- =============================================================================
-- 2) Invoices -> opportunities link
-- =============================================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS opportunity_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_opportunity_id') THEN
    ALTER TABLE invoices
      ADD CONSTRAINT fk_invoices_opportunity_id
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_opportunity_id
  ON invoices(opportunity_id) WHERE opportunity_id IS NOT NULL;

-- =============================================================================
-- 3) Value field compatibility policy
-- =============================================================================
COMMENT ON COLUMN opportunities.value_estimate IS
  'Legacy estimate field. Kept for compatibility only.';
COMMENT ON COLUMN opportunities.estimated_value IS
  'Preferred estimate field for new code. Read fallback should use COALESCE(estimated_value, value_estimate).';

-- =============================================================================
-- 4) Consolidation views
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

CREATE OR REPLACE VIEW v_opportunity_pipeline_summary AS
SELECT
  o.pipeline,
  o.stage,
  COUNT(*) AS opportunities_count,
  COALESCE(SUM(COALESCE(o.estimated_value, o.value_estimate, 0)), 0) AS total_estimated_value,
  COALESCE(SUM(
    CASE
      WHEN o.stage = 'won' THEN COALESCE(o.estimated_value, o.value_estimate, 0)
      WHEN o.stage = 'lost' THEN 0
      ELSE COALESCE(o.estimated_value, o.value_estimate, 0) * (COALESCE(o.probability, 0) / 100.0)
    END
  ), 0) AS weighted_pipeline_value,
  MIN(o.expected_close_date) AS nearest_expected_close_date,
  MAX(o.expected_close_date) AS latest_expected_close_date
FROM opportunities o
GROUP BY o.pipeline, o.stage;

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
