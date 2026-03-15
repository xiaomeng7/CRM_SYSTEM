-- Invoice Overdue Automation: levels, reminder tracking, contact payment risk.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS overdue_level VARCHAR(20) DEFAULT 'none';
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_reminder_sent_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN invoices.overdue_level IS 'none | 3_days | 7_days | 14_days';
COMMENT ON COLUMN invoices.last_reminder_sent_at IS 'When last reminder (SMS/task) was sent for this invoice.';

CREATE INDEX IF NOT EXISTS idx_invoices_overdue_level
  ON invoices(overdue_level) WHERE LOWER(TRIM(COALESCE(status, ''))) != 'paid';

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS payment_risk VARCHAR(20);

COMMENT ON COLUMN contacts.payment_risk IS 'Payment risk from overdue invoices: null | medium | high';

CREATE INDEX IF NOT EXISTS idx_contacts_payment_risk ON contacts(payment_risk) WHERE payment_risk IS NOT NULL;
