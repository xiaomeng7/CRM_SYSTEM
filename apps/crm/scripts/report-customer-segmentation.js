#!/usr/bin/env node

require('../lib/load-env');
const { pool } = require('../lib/db');

async function main() {
  try {
    console.log('Customer Segmentation Report\n============================\n');

    // 确认视图存在（如果迁移还没跑会报错）
    await pool.query('SELECT 1 FROM crm_customer_summary LIMIT 1');

    const { rows: totalRows } = await pool.query(
      `SELECT
         COUNT(*) AS total_contacts,
         COUNT(*) FILTER (WHERE customer_type = 'real_customer') AS real_customers,
         COUNT(*) FILTER (WHERE customer_type = 'lead_only') AS lead_only,
         COUNT(*) FILTER (WHERE customer_type = 'unknown') AS unknown
       FROM crm_customer_summary`
    );

    const totals = totalRows[0] || {};
    console.log('Contacts by customer_type');
    console.table([
      {
        metric: 'Total contacts',
        value: Number(totals.total_contacts || 0),
      },
      {
        metric: 'Real customers',
        value: Number(totals.real_customers || 0),
      },
      {
        metric: 'Lead only',
        value: Number(totals.lead_only || 0),
      },
      {
        metric: 'Unknown',
        value: Number(totals.unknown || 0),
      },
    ]);
    console.log();

    const { rows: valueRows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE customer_value = 'high') AS high_value,
         COUNT(*) FILTER (WHERE customer_value = 'medium') AS medium_value,
         COUNT(*) FILTER (WHERE customer_value = 'low') AS low_value,
         COUNT(*) FILTER (WHERE customer_value = 'none') AS none_value
       FROM crm_customer_summary`
    );

    const values = valueRows[0] || {};
    console.log('Customers by customer_value');
    console.table([
      {
        metric: 'High value',
        value: Number(values.high_value || 0),
      },
      {
        metric: 'Medium value',
        value: Number(values.medium_value || 0),
      },
      {
        metric: 'Low value',
        value: Number(values.low_value || 0),
      },
      {
        metric: 'None',
        value: Number(values.none_value || 0),
      },
    ]);
    console.log();

    const { rows: topCandidates } = await pool.query(
      `SELECT
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
       FROM crm_reactivation_candidates
       ORDER BY priority_score DESC
       LIMIT 20`
    );

    console.log('Top 20 reactivation candidates');
    console.table(
      topCandidates.map((row) => ({
        contact_name: row.contact_name,
        phone: row.phone,
        account_name: row.account_name,
        suburb: row.suburb,
        jobs_count: Number(row.jobs_count || 0),
        total_revenue: Number(row.total_revenue || 0),
        last_job_date: row.last_job_date,
        months_since_last_job: row.months_since_last_job,
        priority_score: Number(row.priority_score || 0),
      }))
    );

    await pool.end();
  } catch (err) {
    console.error('Error running customer segmentation report:', err.message);
    process.exitCode = 1;
  }
}

main();

