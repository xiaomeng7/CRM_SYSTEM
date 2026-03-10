/**
 * ServiceM8 Sync Script
 * Fetches customers and jobs from ServiceM8 API and upserts into CRM database.
 * Updates total_jobs and total_revenue per customer.
 * Run via cron on Railway (or manually). Do not put CRM business logic in ServiceM8 — this is sync only.
 */

require('../lib/load-env');
const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../lib/db');

async function sync() {
  const client = new ServiceM8Client();

  console.log('Fetching companies from ServiceM8...');
  const companiesRaw = await client.getCompanies();
  const companyList = Array.isArray(companiesRaw)
    ? companiesRaw
    : (companiesRaw && companiesRaw.data) ? companiesRaw.data : [companiesRaw].filter(Boolean);
  console.log(`Fetched ${companyList.length} companies`);

  console.log('Fetching jobs from ServiceM8...');
  const jobsRaw = await client.getJobs();
  const jobList = Array.isArray(jobsRaw)
    ? jobsRaw
    : (jobsRaw && jobsRaw.data) ? jobsRaw.data : [jobsRaw].filter(Boolean);
  console.log(`Fetched ${jobList.length} jobs`);

  const db = await pool.connect();

  try {
    const customerMap = {};

    for (const c of companyList) {
      const uuid = c.uuid || c.UUID;
      if (!uuid) continue;

      const name = c.name || c.company_name || c.companyName || '';
      const phone = c.phone || c.phone_number || c.phoneNumber || c.mobile || '';
      const email = c.email || '';
      const suburb = c.address_suburb || c.suburb || c.addressSuburb || '';
      const postcode = c.address_post_code || c.postcode || c.addressPostCode || c.post_code || '';

      const result = await db.query(
        `INSERT INTO customers (
          servicem8_uuid, name, phone, email, suburb, postcode, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (servicem8_uuid) DO UPDATE SET
          name = EXCLUDED.name,
          phone = EXCLUDED.phone,
          email = EXCLUDED.email,
          suburb = EXCLUDED.suburb,
          postcode = EXCLUDED.postcode,
          updated_at = NOW()
        RETURNING id`,
        [uuid, name, phone, email, suburb, postcode]
      );
      customerMap[uuid] = result.rows[0].id;
    }

    console.log(`Upserted ${Object.keys(customerMap).length} customers`);

    for (const j of jobList) {
      const uuid = j.uuid || j.UUID;
      if (!uuid) continue;

      const companyUuid = j.company_uuid || j.companyUUID || j.company;
      const customerId = companyUuid ? customerMap[companyUuid] : null;

      const jobDate = parseDate(j.scheduled_start_date || j.scheduled_start || j.job_date || j.created_at);
      const jobType = j.job_type || j.jobType || j.type || '';
      const jobValue = parseFloat(j.price || j.quote_price || j.quotePrice || j.total || j.value || 0) || null;
      const status = j.status || j.status_name || j.statusName || '';
      const address = j.address || j.site_address || j.siteAddress || j.address_street || '';
      const notes = j.description || j.notes || j.diary_notes || '';
      let completedAt = parseDate(j.completed_date || j.completed_at || j.finish_date);
      if (!completedAt && /complete|finished|done/i.test(String(status))) {
        completedAt = jobDate ? new Date(jobDate) : new Date();
      }

      await db.query(
        `INSERT INTO jobs (
          servicem8_uuid, customer_id, job_date, job_type, job_value, status, address, notes, completed_at, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (servicem8_uuid) DO UPDATE SET
          customer_id = EXCLUDED.customer_id,
          job_date = EXCLUDED.job_date,
          job_type = EXCLUDED.job_type,
          job_value = EXCLUDED.job_value,
          status = EXCLUDED.status,
          address = EXCLUDED.address,
          notes = EXCLUDED.notes,
          completed_at = EXCLUDED.completed_at,
          updated_at = NOW()`,
        [uuid, customerId, jobDate, jobType, jobValue, status, address, notes, completedAt]
      );
    }

    console.log(`Upserted ${jobList.length} jobs`);

    await db.query(`
      UPDATE customers c SET
        total_jobs = agg.cnt,
        total_revenue = COALESCE(agg.rev, 0),
        first_job_date = agg.min_date,
        last_job_date = agg.max_date
      FROM (
        SELECT customer_id,
          COUNT(*) AS cnt,
          SUM(COALESCE(job_value, 0)) AS rev,
          MIN(job_date) AS min_date,
          MAX(job_date) AS max_date
        FROM jobs
        WHERE customer_id IS NOT NULL
        GROUP BY customer_id
      ) agg
      WHERE c.id = agg.customer_id
    `);

    console.log('Updated customer aggregates.');
    console.log('Sync complete.');
  } finally {
    db.release();
    await pool.end();
  }
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

sync().catch((err) => {
  console.error('Sync failed:', err);
  process.exit(1);
});
