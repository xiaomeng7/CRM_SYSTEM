-- PR6C: Recurring obligation patterns (founder-dismissible, no auto-delete).
-- Additive only.

CREATE TABLE IF NOT EXISTS recurring_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_code VARCHAR(50) NOT NULL,
  counterparty_key VARCHAR(200) NOT NULL DEFAULT '',
  cadence VARCHAR(20) NOT NULL,
  typical_amount DECIMAL(12, 2) NOT NULL,
  next_expected_date DATE,
  last_seen_date DATE,
  occurrence_count INT NOT NULL DEFAULT 0,
  confidence VARCHAR(10) NOT NULL DEFAULT 'low',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  dismissed_at TIMESTAMP WITH TIME ZONE,
  dismissed_by VARCHAR(100),
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_recurring_patterns_active_key
  ON recurring_patterns (counterparty_key, category_code, cadence)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_recurring_patterns_next_date
  ON recurring_patterns (next_expected_date)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_recurring_patterns_status
  ON recurring_patterns (status);

COMMENT ON TABLE recurring_patterns IS 'Detected recurring outflows from confirmed bank transactions; founder may dismiss.';
COMMENT ON COLUMN recurring_patterns.typical_amount IS 'Negative AUD outflow (median of occurrences).';
COMMENT ON COLUMN recurring_patterns.status IS 'active | dismissed';
