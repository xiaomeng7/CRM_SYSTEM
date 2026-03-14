-- Customer Segmentation Views
-- crm_customer_summary and crm_reactivation_candidates

CREATE OR REPLACE VIEW crm_customer_summary AS
WITH job_stats AS (
  SELECT
    c.id AS contact_id,
    COUNT(DISTINCT j.id) AS jobs_count,
    COALESCE(SUM(i.amount), 0) AS total_revenue,
    MAX(COALESCE(j.completed_at, j.created_at)) AS last_job_date
  FROM contacts c
  LEFT JOIN jobs j ON j.contact_id = c.id
  LEFT JOIN invoices i ON i.job_id = j.id
  GROUP BY c.id
)
SELECT
  c.id AS contact_id,
  c.name AS contact_name,
  c.phone,
  c.email,
  a.id AS account_id,
  a.name AS account_name,
  a.suburb,
  a.postcode,
  js.jobs_count,
  js.total_revenue,
  js.last_job_date,
  CASE
    WHEN js.last_job_date IS NULL THEN NULL
    ELSE DATE_PART('month', AGE(NOW(), js.last_job_date))
  END AS months_since_last_job,
  CASE
    WHEN a.address_line IS NOT NULL AND a.suburb IS NOT NULL THEN 'full'
    WHEN a.suburb IS NOT NULL THEN 'suburb_only'
    ELSE 'none'
  END AS address_quality,
  CASE
    WHEN js.jobs_count > 0 THEN 'real_customer'
    WHEN js.jobs_count = 0 AND c.phone IS NOT NULL THEN 'lead_only'
    ELSE 'unknown'
  END AS customer_type,
  CASE
    WHEN js.total_revenue >= 5000 THEN 'high'
    WHEN js.total_revenue >= 1000 THEN 'medium'
    WHEN js.total_revenue > 0 THEN 'low'
    ELSE 'none'
  END AS customer_value,
  (
    0
    + CASE WHEN js.jobs_count > 0 THEN 50 ELSE 0 END
    + CASE WHEN js.jobs_count >= 2 THEN 20 ELSE 0 END
    + CASE WHEN js.total_revenue >= 2000 THEN 20 ELSE 0 END
    + CASE
        WHEN a.address_line IS NOT NULL AND a.suburb IS NOT NULL THEN 10
        ELSE 0
      END
    + CASE WHEN js.last_job_date IS NOT NULL AND DATE_PART('month', AGE(NOW(), js.last_job_date)) >= 12 THEN 30 ELSE 0 END
    + CASE WHEN js.last_job_date IS NOT NULL AND DATE_PART('month', AGE(NOW(), js.last_job_date)) >= 6 THEN 10 ELSE 0 END
    - CASE
        WHEN a.address_line IS NULL AND a.suburb IS NULL THEN 30
        ELSE 0
      END
  ) AS priority_score
FROM contacts c
LEFT JOIN accounts a ON a.id = c.account_id
LEFT JOIN job_stats js ON js.contact_id = c.id;


CREATE OR REPLACE VIEW crm_reactivation_candidates AS
SELECT
  contact_id,
  contact_name,
  phone,
  account_name,
  suburb,
  jobs_count,
  total_revenue,
  last_job_date,
  months_since_last_job,
  priority_score
FROM crm_customer_summary
WHERE customer_type = 'real_customer'
  AND phone IS NOT NULL
  AND months_since_last_job IS NOT NULL
  AND months_since_last_job >= 6
ORDER BY priority_score DESC
LIMIT 200;

