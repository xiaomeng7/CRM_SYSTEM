-- Phase 1: strict status lifecycle (incl. processing), exponential retry metadata, fold permanent_failed → failed.
-- Prereq: 046, 048.

ALTER TABLE google_offline_conversion_events
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ;

COMMENT ON COLUMN google_offline_conversion_events.last_retry_at IS
  'When a retry was last scheduled (row set to failed with next_retry_at).';

-- Legacy terminal state → failed (align with v2: no more picks when retry_count >= 5)
UPDATE google_offline_conversion_events
SET status = 'failed',
    next_retry_at = NULL,
    retry_count = GREATEST(retry_count, 5),
    updated_at = NOW()
WHERE status = 'permanent_failed';

ALTER TABLE google_offline_conversion_events
  DROP CONSTRAINT IF EXISTS chk_google_offline_status;

ALTER TABLE google_offline_conversion_events
  ADD CONSTRAINT chk_google_offline_status
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped'));

-- Rows that already exhausted automated retries should not sit with a future next_retry_at
UPDATE google_offline_conversion_events
SET next_retry_at = NULL,
    updated_at = NOW()
WHERE status = 'failed'
  AND retry_count >= 5
  AND next_retry_at IS NOT NULL;

DROP INDEX IF EXISTS idx_google_offline_conversion_retry_schedule;

CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_retry_schedule
  ON google_offline_conversion_events (status, next_retry_at, created_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_processing_stale
  ON google_offline_conversion_events (last_attempt_at)
  WHERE status = 'processing';

COMMENT ON COLUMN google_offline_conversion_events.status IS
  'pending | processing (claimed by uploader) | sent | failed | skipped';
