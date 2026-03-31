-- Campaign ROI: funnel metrics on view + reference seeds for stable campaign_id binding.
-- Run after 033_campaign_roi_tracking.sql.
--
-- Ops order (recommended):
-- 1) Manual campaign_costs for a while — validate model vs sample reconciliations before any ad API import.
-- 2) Bind every paid lead to campaigns.id (form hidden field campaign_id, or utm_campaign === campaigns.code).
--    u:{utm} buckets in the view never receive cost; reliable ROI = campaign_id path.

-- =============================================================================
-- Reference seeds: lead_sources + campaigns (ON CONFLICT safe)
-- Replace / extend in admin as needed; landing forms can pass campaign_id = these UUIDs after first SELECT.
-- =============================================================================

INSERT INTO lead_sources (code, name, channel, active)
VALUES
  ('google_ads', 'Google Ads', 'paid_search', TRUE),
  ('facebook_ads', 'Facebook / Meta Ads', 'paid_social', TRUE),
  ('linkedin_ads', 'LinkedIn Ads', 'paid_social', TRUE)
ON CONFLICT (code) DO NOTHING;

-- Three canonical campaigns: stable `code` matches public utm_campaign OR pass campaign_id UUID from form.
INSERT INTO campaigns (code, name, status, objective, source_id, metadata)
SELECT
  v.code,
  v.name,
  'active',
  'lead_gen',
  ls.id,
  jsonb_build_object('seed', true, 'roi_bucket', v.code)
FROM (VALUES
  ('seed_google_search_nonbrand', 'Seed: Google Search — Non-brand', 'google_ads'),
  ('seed_meta_lead_forms', 'Seed: Meta — Lead forms', 'facebook_ads'),
  ('seed_gdn_remarketing', 'Seed: Google Display — Remarketing', 'google_ads')
) AS v(code, name, source_code)
INNER JOIN lead_sources ls ON ls.code = v.source_code
ON CONFLICT (code) DO NOTHING;

COMMENT ON TABLE campaigns IS
  'Marketing campaigns. For ad ROI, set leads.campaign_id to this id; utm-only rows do not join campaign_costs.';

-- =============================================================================
-- v_campaign_roi_summary — add campaign_id + funnel metrics
-- =============================================================================

CREATE OR REPLACE VIEW v_campaign_roi_summary AS
WITH lead_bucket AS (
  SELECT
    l.id AS lead_id,
    l.campaign_id,
    NULLIF(TRIM(l.utm_campaign), '') AS utm_raw,
    CASE
      WHEN l.campaign_id IS NOT NULL THEN 'c:' || l.campaign_id::text
      WHEN NULLIF(TRIM(l.utm_campaign), '') IS NOT NULL THEN 'u:' || NULLIF(TRIM(l.utm_campaign), '')
      ELSE 'x:unattributed'
    END AS bucket_key
  FROM leads l
),
agg AS (
  SELECT
    lb.bucket_key,
    MAX(lb.campaign_id) AS campaign_id,
    MAX(lb.utm_raw) AS utm_from_leads,
    COUNT(DISTINCT lb.lead_id)::BIGINT AS leads
  FROM lead_bucket lb
  GROUP BY lb.bucket_key
),
wins AS (
  SELECT lb.bucket_key, COUNT(DISTINCT o.id)::BIGINT AS wins
  FROM lead_bucket lb
  INNER JOIN opportunities o ON o.lead_id = lb.lead_id
  WHERE o.stage = 'won'
  GROUP BY lb.bucket_key
),
revenue AS (
  SELECT lb.bucket_key,
    SUM(COALESCE(i.amount_paid, i.amount, 0))::NUMERIC(14, 2) AS revenue
  FROM lead_bucket lb
  INNER JOIN opportunities o ON o.lead_id = lb.lead_id AND o.stage = 'won'
  INNER JOIN invoices i ON i.opportunity_id = o.id
  WHERE i.paid_at IS NOT NULL
     OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
  GROUP BY lb.bucket_key
),
costs AS (
  SELECT cc.campaign_id, SUM(cc.spend)::NUMERIC(14, 2) AS cost
  FROM campaign_costs cc
  GROUP BY cc.campaign_id
)
SELECT
  a.campaign_id,
  COALESCE(
    NULLIF(a.utm_from_leads, ''),
    camp.name,
    camp.code,
    CASE
      WHEN a.bucket_key = 'x:unattributed' THEN '(unattributed)'
      ELSE REPLACE(a.bucket_key, 'u:', '')
    END
  )::TEXT AS utm_campaign,
  a.leads,
  COALESCE(w.wins, 0::BIGINT) AS wins,
  COALESCE(r.revenue, 0::NUMERIC) AS revenue,
  COALESCE(
    CASE WHEN a.campaign_id IS NOT NULL THEN cst.cost END,
    0::NUMERIC
  ) AS cost,
  (
    COALESCE(r.revenue, 0::NUMERIC)
    - COALESCE(CASE WHEN a.campaign_id IS NOT NULL THEN cst.cost END, 0::NUMERIC)
  )::NUMERIC(14, 2) AS profit,
  CASE
    WHEN a.leads > 0
    THEN ROUND((COALESCE(w.wins, 0))::NUMERIC / a.leads::NUMERIC, 6)
  END AS conversion_rate,
  CASE
    WHEN COALESCE(w.wins, 0) > 0
    THEN ROUND(COALESCE(r.revenue, 0::NUMERIC) / COALESCE(w.wins, 0)::NUMERIC, 2)
  END AS avg_revenue_per_win,
  CASE
    WHEN a.leads > 0
    THEN ROUND(COALESCE(r.revenue, 0::NUMERIC) / a.leads::NUMERIC, 2)
  END AS revenue_per_lead
FROM agg a
LEFT JOIN wins w ON w.bucket_key = a.bucket_key
LEFT JOIN revenue r ON r.bucket_key = a.bucket_key
LEFT JOIN campaigns camp ON camp.id = a.campaign_id
LEFT JOIN costs cst ON cst.campaign_id = a.campaign_id;

COMMENT ON VIEW v_campaign_roi_summary IS
  'ROI by bucket: campaign_id (cost-eligible) or utm-only / unattributed. conversion_rate=wins/leads; avg_revenue_per_win; revenue_per_lead.';

COMMENT ON TABLE campaign_costs IS
  'Daily spend per campaigns.id. Prefer manual entry until raw-vs-view reconciliations pass; defer ad platform sync until the model is trusted.';
