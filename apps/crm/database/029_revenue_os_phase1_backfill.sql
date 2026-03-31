-- Revenue OS Phase 1 backfill (compatibility + legacy data)
-- Safe to run repeatedly.

-- =============================================================================
-- 1) Seed a fallback lead source used for legacy data
-- =============================================================================
INSERT INTO lead_sources (code, name, channel, active)
SELECT 'legacy_unknown', 'Legacy / Unknown', 'unknown', TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM lead_sources WHERE code = 'legacy_unknown'
);

-- =============================================================================
-- 2) Leads: keep legacy source string usable while adopting source_id
-- =============================================================================
UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND l.source IS NOT NULL
  AND TRIM(l.source) <> ''
  AND ls.code = LOWER(REGEXP_REPLACE(TRIM(l.source), '[^a-zA-Z0-9]+', '_', 'g'));

-- For source strings that do not yet exist in lead_sources, create dictionary rows.
WITH missing AS (
  SELECT DISTINCT
    LOWER(REGEXP_REPLACE(TRIM(l.source), '[^a-zA-Z0-9]+', '_', 'g')) AS code,
    TRIM(l.source) AS source_name
  FROM leads l
  WHERE l.source_id IS NULL
    AND l.source IS NOT NULL
    AND TRIM(l.source) <> ''
),
ins AS (
  INSERT INTO lead_sources (code, name, channel, active)
  SELECT m.code, m.source_name, 'unknown', TRUE
  FROM missing m
  WHERE m.code <> ''
    AND NOT EXISTS (SELECT 1 FROM lead_sources ls WHERE ls.code = m.code)
  RETURNING id, code
)
SELECT COUNT(*) FROM ins;

UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND l.source IS NOT NULL
  AND TRIM(l.source) <> ''
  AND ls.code = LOWER(REGEXP_REPLACE(TRIM(l.source), '[^a-zA-Z0-9]+', '_', 'g'));

-- Any remaining lead without source_id -> fallback
UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND ls.code = 'legacy_unknown';

-- =============================================================================
-- 3) Opportunities compatibility backfill
-- =============================================================================
-- pipeline default for old records
UPDATE opportunities
SET pipeline = 'default'
WHERE pipeline IS NULL;

-- estimated_value from legacy value_estimate
UPDATE opportunities
SET estimated_value = value_estimate
WHERE estimated_value IS NULL
  AND value_estimate IS NOT NULL;

-- probability fallback by stage (only when missing)
UPDATE opportunities
SET probability = CASE
  WHEN stage = 'won' THEN 100
  WHEN stage = 'lost' THEN 0
  WHEN stage IN ('decision_pending') THEN 75
  WHEN stage IN ('quote_sent') THEN 60
  WHEN stage IN ('inspection_done') THEN 40
  WHEN stage IN ('site_visit_booked') THEN 25
  ELSE 15
END
WHERE probability IS NULL;

-- won_at/lost_at default from existing closed_at
UPDATE opportunities
SET won_at = COALESCE(won_at, closed_at)
WHERE stage = 'won'
  AND closed_at IS NOT NULL;

UPDATE opportunities
SET lost_at = COALESCE(lost_at, closed_at)
WHERE stage = 'lost'
  AND closed_at IS NOT NULL;

-- expected_close_date for open opportunities if missing
UPDATE opportunities
SET expected_close_date = (created_at::date + INTERVAL '30 days')::date
WHERE expected_close_date IS NULL
  AND stage NOT IN ('won', 'lost');

-- =============================================================================
-- 4) Invoices compatibility backfill
-- =============================================================================
UPDATE invoices
SET amount_paid = CASE
  WHEN LOWER(TRIM(COALESCE(status, ''))) = 'paid' THEN COALESCE(amount, 0)
  ELSE 0
END
WHERE amount_paid IS NULL;

UPDATE invoices
SET amount_due = GREATEST(COALESCE(amount, 0) - COALESCE(amount_paid, 0), 0)
WHERE amount_due IS NULL;

UPDATE invoices
SET paid_at = COALESCE(paid_at, updated_at)
WHERE paid_at IS NULL
  AND LOWER(TRIM(COALESCE(status, ''))) = 'paid';

UPDATE invoices
SET last_reminder_at = COALESCE(last_reminder_at, last_reminder_sent_at)
WHERE last_reminder_at IS NULL
  AND last_reminder_sent_at IS NOT NULL;

-- =============================================================================
-- 5) Contacts compatibility backfill
-- =============================================================================
UPDATE contacts
SET preferred_channel = CASE
  WHEN phone IS NOT NULL AND TRIM(phone) <> '' THEN 'sms'
  WHEN email IS NOT NULL AND TRIM(email) <> '' THEN 'email'
  ELSE NULL
END
WHERE preferred_channel IS NULL;

-- last_replied_at from latest inbound activity (if exists)
WITH latest_reply AS (
  SELECT
    a.contact_id,
    MAX(a.occurred_at) AS replied_at
  FROM activities a
  WHERE a.contact_id IS NOT NULL
    AND a.activity_type IN ('inbound_sms', 'inbound_sms_unmatched', 'reply')
  GROUP BY a.contact_id
)
UPDATE contacts c
SET last_replied_at = lr.replied_at
FROM latest_reply lr
WHERE c.id = lr.contact_id
  AND (c.last_replied_at IS NULL OR c.last_replied_at < lr.replied_at);

-- =============================================================================
-- 6) Tasks compatibility backfill
-- =============================================================================
UPDATE tasks
SET completed_at = COALESCE(completed_at, updated_at)
WHERE completed_at IS NULL
  AND COALESCE(status, '') IN ('done', 'completed', 'closed');
