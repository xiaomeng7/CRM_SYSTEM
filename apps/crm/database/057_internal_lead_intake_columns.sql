-- Manual / non-ad lead intake: sub_source + explicit product_line on lead & opportunity.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS sub_source VARCHAR(255);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS product_line VARCHAR(50);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS product_line VARCHAR(50);

CREATE INDEX IF NOT EXISTS idx_leads_sub_source ON leads (sub_source) WHERE sub_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_product_line ON opportunities (product_line) WHERE product_line IS NOT NULL;

COMMENT ON COLUMN leads.sub_source IS 'Intake refinement, e.g. inspector id or referrer name (manual CRM entry).';
COMMENT ON COLUMN leads.product_line IS 'pre_purchase | rental | energy — mirrors intake form product line.';
COMMENT ON COLUMN opportunities.product_line IS 'Same as lead product_line for reporting.';
