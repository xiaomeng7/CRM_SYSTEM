-- Phase 1 step 4: offline conversion retry backoff + scheduler-friendly index.
-- Prereq: 046_google_offline_conversion_events.sql

ALTER TABLE google_offline_conversion_events
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ;

ALTER TABLE google_offline_conversion_events
  DROP CONSTRAINT IF EXISTS chk_google_offline_status;

ALTER TABLE google_offline_conversion_events
  ADD CONSTRAINT chk_google_offline_status
  CHECK (status IN ('pending', 'sent', 'failed', 'skipped', 'permanent_failed'));

COMMENT ON COLUMN google_offline_conversion_events.next_retry_at IS
  'When status=failed, earliest time the uploader may retry (exponential-ish backoff). NULL = eligible immediately (legacy).';

CREATE INDEX IF NOT EXISTS idx_google_offline_conversion_retry_schedule
  ON google_offline_conversion_events (status, next_retry_at)
  WHERE status IN ('pending', 'failed');

-- Legacy rows: stop infinite retries for already-high retry_count
UPDATE google_offline_conversion_events
SET status = 'permanent_failed',
    next_retry_at = NULL,
    updated_at = NOW()
WHERE status = 'failed'
  AND retry_count >= 4;
