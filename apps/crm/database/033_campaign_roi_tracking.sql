-- Campaign ROI tracking (minimal closed loop: lead → opportunity → invoice → revenue vs spend)
-- Prereq: 028_revenue_os_phase1_model_upgrade.sql (campaigns, leads.campaign_id, utm_*, opportunities.won_at, invoices.paid_at, opportunity_id)

-- =============================================================================
-- A) Ensure attribution & pipeline fields (idempotent)
-- =============================================================================

ALTER TABLE leads ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS campaign_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_leads_campaign_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'campaigns') THEN
      ALTER TABLE leads
        ADD CONSTRAINT fk_leads_campaign_id
        FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

-- Indexes idx_leads_campaign_id / idx_leads_utm_campaign: see 028 if missing

COMMENT ON COLUMN leads.utm_campaign IS 'UTM campaign parameter from ad / landing (ROI grouping).';
COMMENT ON COLUMN leads.campaign_id IS 'FK to campaigns.id when resolved from ads; joins to campaign_costs.';

-- opportunities (002 + 028): lead_id, status, won_at
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS lead_id UUID;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS status VARCHAR(50);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS won_at TIMESTAMPTZ;

COMMENT ON COLUMN opportunities.lead_id IS 'Originating lead for attribution to campaign / UTM.';
COMMENT ON COLUMN opportunities.status IS 'Lifecycle status (e.g. open); stage carries pipeline.';
COMMENT ON COLUMN opportunities.won_at IS 'When opportunity moved to won (revenue attribution).';

-- invoices: amount (003), opportunity_id + paid_at (028/030)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS opportunity_id UUID;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_invoices_opportunity_id') THEN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'opportunities') THEN
      ALTER TABLE invoices
        ADD CONSTRAINT fk_invoices_opportunity_id
        FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE SET NULL;
    END IF;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invoices_opportunity_id
  ON invoices(opportunity_id) WHERE opportunity_id IS NOT NULL;

COMMENT ON COLUMN invoices.opportunity_id IS 'Links paid revenue to opportunity → lead → campaign.';
COMMENT ON COLUMN invoices.amount IS 'Invoice total; revenue uses COALESCE(amount_paid, amount) when paid.';
COMMENT ON COLUMN invoices.paid_at IS 'Payment timestamp for realized revenue in ROI views.';

-- =============================================================================
-- B) campaign_costs — daily (or per-row) ad spend by campaigns.id
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  spend NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by VARCHAR(100)
);

CREATE INDEX IF NOT EXISTS idx_campaign_costs_campaign_id ON campaign_costs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_costs_date ON campaign_costs(date DESC);

COMMENT ON TABLE campaign_costs IS 'Ad/platform spend imported or entered per campaign (links leads.campaign_id).';
COMMENT ON COLUMN campaign_costs.spend IS 'Spend for that campaign on that calendar date (currency as per org).';

-- =============================================================================
-- C) v_campaign_roi_summary
-- Grain: one row per attribution bucket — either campaigns.id, or utm-only leads, or unattributed.
-- revenue: paid invoices on won opportunities for leads in that bucket.
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
  )::NUMERIC(14, 2) AS profit
FROM agg a
LEFT JOIN wins w ON w.bucket_key = a.bucket_key
LEFT JOIN revenue r ON r.bucket_key = a.bucket_key
LEFT JOIN campaigns camp ON camp.id = a.campaign_id
LEFT JOIN costs cst ON cst.campaign_id = a.campaign_id;

COMMENT ON VIEW v_campaign_roi_summary IS
  'Per-campaign or utm-only bucket: lead count, won opps, paid revenue (won opps), ad cost, profit.';

-- =============================================================================
-- D) Example queries (run manually in psql / dashboard SQL)
-- =============================================================================
-- 1) Full ROI table:
--    SELECT * FROM v_campaign_roi_summary ORDER BY revenue DESC NULLS LAST;
--
-- 2) Drill-down: leads for a campaign UUID:
--    SELECT id, status, utm_campaign, created_at FROM leads WHERE campaign_id = '...';
--
-- 3) Insert daily spend (Meta / Google export):
--    INSERT INTO campaign_costs (campaign_id, date, spend, created_by)
--    VALUES ('<campaigns.id>', CURRENT_DATE, 120.50, 'import');
--
-- 4) Paid revenue by lead (sanity check):
--    SELECT l.id, l.utm_campaign, SUM(COALESCE(i.amount_paid, i.amount, 0)) AS paid
--    FROM leads l
--    JOIN opportunities o ON o.lead_id = l.id AND o.stage = 'won'
--    JOIN invoices i ON i.opportunity_id = o.id
--    WHERE i.paid_at IS NOT NULL OR LOWER(i.status) = 'paid'
--    GROUP BY l.id, l.utm_campaign;
