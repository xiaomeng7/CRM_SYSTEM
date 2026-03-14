-- Reactivation SMS Queue: controlled batch sending with preview/audit
CREATE TABLE IF NOT EXISTS reactivation_sms_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  phone TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  batch_id TEXT,
  priority_score INTEGER,
  scheduled_for TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_reactivation_sms_queue_status ON reactivation_sms_queue(status);
CREATE INDEX IF NOT EXISTS idx_reactivation_sms_queue_batch_id ON reactivation_sms_queue(batch_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_sms_queue_contact_id ON reactivation_sms_queue(contact_id);
CREATE INDEX IF NOT EXISTS idx_reactivation_sms_queue_created_at ON reactivation_sms_queue(created_at);
