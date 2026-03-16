-- Invoices: support job-derived records (one invoice per job when invoice data comes from job endpoint).
-- servicem8_job_uuid = unique key for upsert from job; servicem8_invoice_uuid remains for invoice.json-sourced rows.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS servicem8_job_uuid VARCHAR(36);

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_servicem8_job_uuid
  ON invoices(servicem8_job_uuid) WHERE servicem8_job_uuid IS NOT NULL;

COMMENT ON COLUMN invoices.servicem8_job_uuid IS 'ServiceM8 job UUID when invoice row is derived from job (one per job).';
