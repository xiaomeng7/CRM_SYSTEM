-- Revenue OS Stage 1 backfill (safe to run repeatedly)

-- =============================================================================
-- 1) invoices.opportunity_id backfill from jobs.source_opportunity_id
-- =============================================================================
UPDATE invoices i
SET opportunity_id = j.source_opportunity_id
FROM jobs j
WHERE i.job_id = j.id
  AND i.opportunity_id IS NULL
  AND j.source_opportunity_id IS NOT NULL;

-- Secondary backfill by ServiceM8 job UUID link (for partially linked invoice/job rows)
UPDATE invoices i
SET opportunity_id = j.source_opportunity_id
FROM jobs j
WHERE i.opportunity_id IS NULL
  AND i.servicem8_job_uuid IS NOT NULL
  AND j.servicem8_job_uuid = i.servicem8_job_uuid
  AND j.source_opportunity_id IS NOT NULL;

-- =============================================================================
-- 2) opportunities.estimated_value backfill from legacy value_estimate
-- =============================================================================
UPDATE opportunities
SET estimated_value = value_estimate
WHERE estimated_value IS NULL
  AND value_estimate IS NOT NULL;

-- =============================================================================
-- 3) invoices.amount_due backfill
-- =============================================================================
UPDATE invoices
SET amount_due = GREATEST(COALESCE(amount, 0) - COALESCE(amount_paid, 0), 0)
WHERE amount_due IS NULL;

-- =============================================================================
-- 4) leads compatibility prep for source/source_id/campaign_id querying
-- =============================================================================
-- Ensure fallback source dictionary row exists.
INSERT INTO lead_sources (code, name, channel, active)
SELECT 'legacy_unknown', 'Legacy / Unknown', 'unknown', TRUE
WHERE NOT EXISTS (SELECT 1 FROM lead_sources WHERE code = 'legacy_unknown');

-- Try resolve source_id from existing source string by normalized code.
UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND l.source IS NOT NULL
  AND TRIM(l.source) <> ''
  AND ls.code = LOWER(REGEXP_REPLACE(TRIM(l.source), '[^a-zA-Z0-9]+', '_', 'g'));

-- Auto-create missing lead_sources from legacy string source values.
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
  RETURNING id
)
SELECT COUNT(*) FROM ins;

UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND l.source IS NOT NULL
  AND TRIM(l.source) <> ''
  AND ls.code = LOWER(REGEXP_REPLACE(TRIM(l.source), '[^a-zA-Z0-9]+', '_', 'g'));

-- Remaining unresolved leads use fallback.
UPDATE leads l
SET source_id = ls.id
FROM lead_sources ls
WHERE l.source_id IS NULL
  AND ls.code = 'legacy_unknown';

-- Performance helper: campaign null-safe query shape is common in migration period.
CREATE INDEX IF NOT EXISTS idx_leads_campaign_id_nullsafe
  ON leads((campaign_id IS NULL), campaign_id, created_at DESC);
