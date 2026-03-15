-- Quote 7-day follow-up: due/sent timestamps and state.
-- followup_state: none | scheduled | due | sent | skipped

ALTER TABLE quotes ADD COLUMN IF NOT EXISTS followup_due_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS followup_sent_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_quotes_followup_due
  ON quotes(followup_due_at) WHERE followup_due_at IS NOT NULL AND followup_state IS DISTINCT FROM 'sent' AND followup_state IS DISTINCT FROM 'skipped';

CREATE INDEX IF NOT EXISTS idx_quotes_followup_state ON quotes(followup_state) WHERE followup_state IS NOT NULL;

COMMENT ON COLUMN quotes.followup_due_at IS 'sent_at + 7 days; when to run follow-up.';
COMMENT ON COLUMN quotes.followup_sent_at IS 'When follow-up task/SMS was executed.';
