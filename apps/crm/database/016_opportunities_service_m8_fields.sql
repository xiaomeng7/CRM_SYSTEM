-- Add service_m8_job_id and inspection_date for ServiceM8 job → opportunity sync.
-- quote_sent_at, won_at already in 015. Safe to run repeatedly.

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS service_m8_job_id TEXT;

ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS inspection_date DATE;

CREATE INDEX IF NOT EXISTS idx_opportunities_service_m8_job_id
  ON opportunities(service_m8_job_id) WHERE service_m8_job_id IS NOT NULL;

-- Migrate legacy stages to unified stages (idempotent)
UPDATE opportunities SET stage = 'new_inquiry' WHERE stage = 'discovery';
UPDATE opportunities SET stage = 'site_visit_booked' WHERE stage = 'inspection_booked';
UPDATE opportunities SET stage = 'inspection_done' WHERE stage = 'inspection_completed';
UPDATE opportunities SET stage = 'quote_sent' WHERE stage = 'report_sent';

-- Update default for new rows
ALTER TABLE opportunities ALTER COLUMN stage SET DEFAULT 'new_inquiry';
