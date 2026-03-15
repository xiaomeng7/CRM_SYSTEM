-- Add quote_sent_at and won_at for Cashflow Dashboard and opportunity flow.
-- See docs/crm-servicem8-opportunity-flow.md
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS quote_sent_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS won_at TIMESTAMP WITH TIME ZONE;
