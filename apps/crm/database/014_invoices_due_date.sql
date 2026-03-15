-- Add due_date to invoices for Outstanding Invoices / days_overdue (synced from ServiceM8).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS due_date DATE;

CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date) WHERE due_date IS NOT NULL;
