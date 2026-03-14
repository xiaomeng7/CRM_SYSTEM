-- crm_account_reactivation_contacts: one best contact per account for reactivation
-- Picks contact with phone; ORDER BY phone IS NOT NULL DESC, created_at DESC

CREATE OR REPLACE VIEW crm_account_reactivation_contacts AS
WITH base AS (
  SELECT
    ras.account_id,
    ras.account_name,
    ras.suburb,
    ras.jobs_count,
    ras.last_job_date,
    ras.months_since_last_job,
    ras.priority_score
  FROM crm_account_summary ras
  WHERE ras.customer_type = 'real_customer'
    AND ras.contact_with_phone_count > 0
    AND ras.months_since_last_job IS NOT NULL
    AND ras.months_since_last_job >= 6
),
ranked AS (
  SELECT
    c.id AS contact_id,
    c.name AS contact_name,
    c.phone,
    c.account_id,
    c.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY c.account_id
      ORDER BY
        (CASE WHEN c.phone IS NOT NULL AND TRIM(COALESCE(c.phone, '')) <> '' THEN 1 ELSE 0 END) DESC,
        c.created_at DESC
    ) AS rn
  FROM contacts c
  WHERE c.account_id IN (SELECT account_id FROM base)
    AND c.phone IS NOT NULL
    AND TRIM(COALESCE(c.phone, '')) <> ''
    AND COALESCE(c.do_not_contact, false) = false
)
SELECT
  b.account_id,
  b.account_name,
  b.suburb,
  r.contact_id,
  r.contact_name,
  r.phone,
  b.jobs_count,
  b.last_job_date,
  b.months_since_last_job,
  b.priority_score
FROM base b
JOIN ranked r ON r.account_id = b.account_id AND r.rn = 1
ORDER BY b.priority_score DESC
LIMIT 200;
