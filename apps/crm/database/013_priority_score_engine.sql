-- Priority Score Engine
-- crm_priority_contacts: contacts scored for daily outreach prioritization
-- Requires: jobs, invoices, contacts, accounts, activities, opportunities, inspections, reactivation_sms_queue (010)

-- Optional: preferred work area suburbs (populate as needed)
CREATE TABLE IF NOT EXISTS crm_preferred_work_areas (
  suburb TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- crm_priority_contacts
-- =============================================================================
CREATE OR REPLACE VIEW crm_priority_contacts AS
WITH contact_base AS (
  SELECT
    c.id AS contact_id,
    c.account_id,
    c.name,
    c.phone,
    a.suburb,
    COALESCE(c.do_not_contact, false) AS do_not_contact
  FROM contacts c
  LEFT JOIN accounts a ON a.id = c.account_id
  WHERE c.phone IS NOT NULL AND TRIM(COALESCE(c.phone, '')) <> ''
),
-- Recent interaction: inbound SMS within 7 days
recent_inbound AS (
  SELECT contact_id
  FROM activities
  WHERE activity_type IN ('inbound_sms', 'inbound_sms_unmatched')
    AND occurred_at >= NOW() - INTERVAL '7 days'
  GROUP BY contact_id
),
-- Recent contact: outbound within 30 days (exclude these)
recent_contact AS (
  SELECT contact_id
  FROM activities
  WHERE activity_type IN ('sms', 'outbound_sms')
    AND occurred_at >= NOW() - INTERVAL '30 days'
  GROUP BY contact_id
),
-- Also from reactivation_sms_queue sent
recent_queue AS (
  SELECT contact_id
  FROM reactivation_sms_queue
  WHERE status = 'sent' AND sent_at >= NOW() - INTERVAL '30 days'
),
-- Active job
active_job AS (
  SELECT contact_id
  FROM jobs
  WHERE contact_id IS NOT NULL
    AND LOWER(COALESCE(status, '')) NOT IN ('completed', 'cancelled', 'done')
  GROUP BY contact_id
),
-- Open opportunity
open_opp AS (
  SELECT contact_id
  FROM opportunities
  WHERE contact_id IS NOT NULL
    AND COALESCE(status, 'open') = 'open'
  GROUP BY contact_id
),
-- Account job stats
account_jobs AS (
  SELECT
    j.account_id,
    COUNT(DISTINCT j.id) AS jobs_count,
    COALESCE(SUM(i.amount), 0) AS total_revenue,
    MAX(COALESCE(j.job_date, j.completed_at, j.created_at)) AS last_job_date
  FROM jobs j
  LEFT JOIN invoices i ON i.job_id = j.id
  WHERE j.account_id IS NOT NULL
  GROUP BY j.account_id
),
-- Engagement: inspection or report_viewed activity
engagement AS (
  SELECT contact_id FROM inspections WHERE contact_id IS NOT NULL
  UNION
  SELECT contact_id FROM activities
  WHERE activity_type = 'report_viewed' AND contact_id IS NOT NULL
),
-- Months since last job
months_since AS (
  SELECT
    account_id,
    last_job_date,
    (DATE_PART('year', AGE(NOW(), last_job_date)) * 12 + DATE_PART('month', AGE(NOW(), last_job_date)))::int AS months
  FROM account_jobs
  WHERE last_job_date IS NOT NULL
)
SELECT
  cb.contact_id,
  cb.account_id,
  cb.name,
  cb.phone,
  cb.suburb,
  aj.last_job_date,
  (
    CASE WHEN ri.contact_id IS NOT NULL THEN 50 ELSE 0 END
    + CASE WHEN COALESCE(aj.jobs_count, 0) > 0 THEN 30 ELSE 0 END
    + CASE
        WHEN ms.months IS NOT NULL AND ms.months >= 6 AND ms.months <= 24 THEN 20
        ELSE 0
      END
    + CASE WHEN COALESCE(aj.total_revenue, 0) > 2000 THEN 20 ELSE 0 END
    + CASE WHEN eng.contact_id IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN pwa.suburb IS NOT NULL THEN 10 ELSE 0 END
  )::int AS priority_score
FROM contact_base cb
LEFT JOIN account_jobs aj ON aj.account_id = cb.account_id
LEFT JOIN months_since ms ON ms.account_id = cb.account_id
LEFT JOIN recent_inbound ri ON ri.contact_id = cb.contact_id
LEFT JOIN engagement eng ON eng.contact_id = cb.contact_id
LEFT JOIN crm_preferred_work_areas pwa ON LOWER(TRIM(COALESCE(cb.suburb, ''))) = LOWER(TRIM(pwa.suburb))
WHERE COALESCE(cb.do_not_contact, false) = false
  AND cb.contact_id NOT IN (SELECT contact_id FROM recent_contact)
  AND cb.contact_id NOT IN (SELECT contact_id FROM recent_queue)
  AND cb.contact_id NOT IN (SELECT contact_id FROM active_job)
  AND cb.contact_id NOT IN (SELECT contact_id FROM open_opp)
ORDER BY priority_score DESC;
