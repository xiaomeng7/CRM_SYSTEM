-- Customer Segmentation: account-level views and reactivation_candidates_v2
-- 1. crm_account_summary
-- 2. crm_account_reactivation_candidates
-- 3. crm_reactivation_candidates_v2 (with exclusions)

-- =============================================================================
-- 1. crm_account_summary (account-level segmentation)
-- =============================================================================
CREATE OR REPLACE VIEW crm_account_summary AS
WITH account_contacts AS (
  SELECT
    a.id AS account_id,
    COUNT(DISTINCT c.id) AS contacts_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.phone IS NOT NULL AND TRIM(COALESCE(c.phone, '')) <> '') AS contact_with_phone_count,
    COUNT(DISTINCT c.id) FILTER (WHERE c.email IS NOT NULL AND TRIM(COALESCE(c.email, '')) <> '') AS contact_with_email_count
  FROM accounts a
  LEFT JOIN contacts c ON c.account_id = a.id
  GROUP BY a.id
),
account_jobs AS (
  SELECT
    j.account_id,
    COUNT(DISTINCT j.id) AS jobs_count,
    COALESCE(SUM(i.amount), 0) AS total_revenue,
    MAX(COALESCE(j.completed_at, j.created_at)) AS last_job_date
  FROM jobs j
  LEFT JOIN invoices i ON i.job_id = j.id
  WHERE j.account_id IS NOT NULL
  GROUP BY j.account_id
)
SELECT
  a.id AS account_id,
  a.name AS account_name,
  a.suburb,
  a.postcode,
  a.address_line,
  COALESCE(ac.contacts_count, 0)::int AS contacts_count,
  COALESCE(ac.contact_with_phone_count, 0)::int AS contact_with_phone_count,
  COALESCE(ac.contact_with_email_count, 0)::int AS contact_with_email_count,
  COALESCE(aj.jobs_count, 0)::bigint AS jobs_count,
  COALESCE(aj.total_revenue, 0) AS total_revenue,
  aj.last_job_date,
  CASE
    WHEN aj.last_job_date IS NULL THEN NULL
    ELSE DATE_PART('month', AGE(NOW(), aj.last_job_date))
  END AS months_since_last_job,
  CASE
    WHEN a.address_line IS NOT NULL AND a.suburb IS NOT NULL THEN 'full'
    WHEN a.suburb IS NOT NULL THEN 'suburb_only'
    ELSE 'none'
  END AS address_quality,
  CASE
    WHEN COALESCE(aj.jobs_count, 0) > 0 THEN 'real_customer'
    WHEN COALESCE(aj.jobs_count, 0) = 0 AND COALESCE(ac.contact_with_phone_count, 0) > 0 THEN 'lead_only'
    ELSE 'unknown'
  END AS customer_type,
  CASE
    WHEN COALESCE(aj.total_revenue, 0) >= 5000 THEN 'high'
    WHEN COALESCE(aj.total_revenue, 0) >= 1000 THEN 'medium'
    WHEN COALESCE(aj.total_revenue, 0) > 0 THEN 'low'
    ELSE 'none'
  END AS customer_value,
  (
    0
    + CASE WHEN COALESCE(aj.jobs_count, 0) > 0 THEN 50 ELSE 0 END
    + CASE WHEN COALESCE(aj.jobs_count, 0) >= 2 THEN 20 ELSE 0 END
    + CASE WHEN COALESCE(aj.total_revenue, 0) >= 2000 THEN 20 ELSE 0 END
    + CASE
        WHEN a.address_line IS NOT NULL AND a.suburb IS NOT NULL THEN 10
        ELSE 0
      END
    + CASE WHEN aj.last_job_date IS NOT NULL AND DATE_PART('month', AGE(NOW(), aj.last_job_date)) >= 12 THEN 30 ELSE 0 END
    + CASE WHEN aj.last_job_date IS NOT NULL AND DATE_PART('month', AGE(NOW(), aj.last_job_date)) >= 6 THEN 10 ELSE 0 END
    - CASE
        WHEN a.address_line IS NULL AND a.suburb IS NULL THEN 30
        ELSE 0
      END
  ) AS priority_score
FROM accounts a
LEFT JOIN account_contacts ac ON ac.account_id = a.id
LEFT JOIN account_jobs aj ON aj.account_id = a.id;

-- =============================================================================
-- 2. crm_account_reactivation_candidates
-- =============================================================================
CREATE OR REPLACE VIEW crm_account_reactivation_candidates AS
SELECT
  account_id,
  account_name,
  suburb,
  contacts_count,
  contact_with_phone_count,
  jobs_count,
  total_revenue,
  last_job_date,
  months_since_last_job,
  priority_score
FROM crm_account_summary
WHERE customer_type = 'real_customer'
  AND contact_with_phone_count > 0
  AND months_since_last_job IS NOT NULL
  AND months_since_last_job >= 6
ORDER BY priority_score DESC
LIMIT 200;

-- =============================================================================
-- 3. crm_reactivation_candidates_v2 (exclusions: recent contact, no phone, do_not_contact)
-- activity_type 当前已知值: sms, inbound_sms, inbound_sms_unmatched
-- 近似判断“已联系”: 上述类型 + call, outbound_sms（未来可能）
-- =============================================================================
CREATE OR REPLACE VIEW crm_reactivation_candidates_v2 AS
WITH last_contact AS (
  SELECT
    contact_id,
    MAX(occurred_at) AS last_contacted_at
  FROM activities
  WHERE contact_id IS NOT NULL
    AND activity_type IN (
      'sms',
      'inbound_sms',
      'inbound_sms_unmatched',
      'outbound_sms',
      'call'
    )
  GROUP BY contact_id
)
SELECT
  cs.contact_id,
  cs.contact_name,
  cs.phone,
  cs.account_name,
  cs.suburb,
  cs.jobs_count,
  cs.total_revenue,
  cs.last_job_date,
  cs.months_since_last_job,
  cs.priority_score,
  lc.last_contacted_at,
  CASE
    WHEN lc.last_contacted_at IS NOT NULL AND lc.last_contacted_at >= NOW() - INTERVAL '30 days'
    THEN true
    ELSE false
  END AS contacted_recently_flag
FROM crm_customer_summary cs
JOIN contacts c ON c.id = cs.contact_id
LEFT JOIN last_contact lc ON lc.contact_id = cs.contact_id
WHERE cs.customer_type = 'real_customer'
  AND cs.phone IS NOT NULL
  AND TRIM(COALESCE(cs.phone, '')) <> ''
  AND cs.months_since_last_job IS NOT NULL
  AND cs.months_since_last_job >= 6
  AND COALESCE(c.status, 'active') <> 'do_not_contact'
  AND (lc.last_contacted_at IS NULL OR lc.last_contacted_at < NOW() - INTERVAL '30 days')
ORDER BY cs.priority_score DESC
LIMIT 200;
