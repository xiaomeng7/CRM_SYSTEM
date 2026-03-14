#!/usr/bin/env node
/**
 * Segmentation comparison report.
 * Verifies potential issues and outputs contact vs account-level differences.
 * Prerequisites: migrations 005 and 006 (views) must be run.
 * Usage: node scripts/report-segmentation-comparison.js
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function q(sql, params = []) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function main() {
  try {
    console.log('Segmentation Comparison Report\n=================================\n');

    // Ensure views exist
    await pool.query('SELECT 1 FROM crm_customer_summary LIMIT 1');
    await pool.query('SELECT 1 FROM crm_account_summary LIMIT 1');
    await pool.query('SELECT 1 FROM crm_reactivation_candidates_v2 LIMIT 1');
    await pool.query('SELECT 1 FROM crm_account_reactivation_contacts LIMIT 1').catch(() => {});

    // -------------------------------------------------------------------------
    // 1. Contact-level segmentation overview
    // -------------------------------------------------------------------------
    const [ctType] = await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE customer_type = 'real_customer') AS real_customer,
        COUNT(*) FILTER (WHERE customer_type = 'lead_only') AS lead_only,
        COUNT(*) FILTER (WHERE customer_type = 'unknown') AS unknown,
        COUNT(*) FILTER (WHERE customer_value = 'high') AS high,
        COUNT(*) FILTER (WHERE customer_value = 'medium') AS medium,
        COUNT(*) FILTER (WHERE customer_value = 'low') AS low,
        COUNT(*) FILTER (WHERE customer_value = 'none') AS none
      FROM crm_customer_summary
    `);
    console.log('1. Contact-level segmentation overview');
    console.table([
      { metric: 'Total contacts', value: Number(ctType.total || 0) },
      { metric: 'Real customer', value: Number(ctType.real_customer || 0) },
      { metric: 'Lead only', value: Number(ctType.lead_only || 0) },
      { metric: 'Unknown', value: Number(ctType.unknown || 0) },
      { metric: 'High value', value: Number(ctType.high || 0) },
      { metric: 'Medium value', value: Number(ctType.medium || 0) },
      { metric: 'Low value', value: Number(ctType.low || 0) },
      { metric: 'None (revenue)', value: Number(ctType.none || 0) },
    ]);
    console.log();

    // -------------------------------------------------------------------------
    // 2. Account-level segmentation overview
    // -------------------------------------------------------------------------
    const [acType] = await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE customer_type = 'real_customer') AS real_customer,
        COUNT(*) FILTER (WHERE customer_type = 'lead_only') AS lead_only,
        COUNT(*) FILTER (WHERE customer_type = 'unknown') AS unknown,
        COUNT(*) FILTER (WHERE customer_value = 'high') AS high,
        COUNT(*) FILTER (WHERE customer_value = 'medium') AS medium,
        COUNT(*) FILTER (WHERE customer_value = 'low') AS low,
        COUNT(*) FILTER (WHERE customer_value = 'none') AS none
      FROM crm_account_summary
    `);
    console.log('2. Account-level segmentation overview');
    console.table([
      { metric: 'Total accounts', value: Number(acType.total || 0) },
      { metric: 'Real customer', value: Number(acType.real_customer || 0) },
      { metric: 'Lead only', value: Number(acType.lead_only || 0) },
      { metric: 'Unknown', value: Number(acType.unknown || 0) },
      { metric: 'High value', value: Number(acType.high || 0) },
      { metric: 'Medium value', value: Number(acType.medium || 0) },
      { metric: 'Low value', value: Number(acType.low || 0) },
      { metric: 'None (revenue)', value: Number(acType.none || 0) },
    ]);
    console.log();

    // -------------------------------------------------------------------------
    // 3. Contact vs account – jobs.contact_id / jobs.account_id
    // -------------------------------------------------------------------------
    const jobsStats = await q(`
      SELECT
        COUNT(*) AS total_jobs,
        COUNT(*) FILTER (WHERE contact_id IS NULL) AS contact_id_null,
        COUNT(*) FILTER (WHERE account_id IS NOT NULL) AS account_id_not_null,
        COUNT(*) FILTER (WHERE contact_id IS NULL AND account_id IS NOT NULL) AS contact_null_account_not_null
      FROM jobs
    `);
    const js = jobsStats[0] || {};
    const totalJobs = Number(js.total_jobs || 0);
    const contactNull = Number(js.contact_id_null || 0);
    const contactNullAccountNotNull = Number(js.contact_null_account_not_null || 0);
    const pct = totalJobs > 0 ? ((contactNullAccountNotNull / totalJobs) * 100).toFixed(1) : '0';

    console.log('3. Contact vs account – jobs data');
    console.table([
      { metric: 'Total jobs', value: totalJobs },
      { metric: 'Jobs with contact_id NULL', value: contactNull },
      { metric: 'Jobs with account_id NOT NULL', value: Number(js.account_id_not_null || 0) },
      { metric: 'contact_id NULL AND account_id NOT NULL', value: contactNullAccountNotNull },
      { metric: 'Pct of jobs potentially undercounted at contact-level', value: pct + '%' },
    ]);

    // Contacts classified lead_only/unknown but their account has jobs (contact-level undercount)
    const [underCount] = await q(`
      SELECT COUNT(*) AS cnt
      FROM crm_customer_summary cs
      JOIN contacts c ON c.id = cs.contact_id
      WHERE cs.customer_type IN ('lead_only', 'unknown')
        AND c.account_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM jobs j WHERE j.account_id = c.account_id)
    `);
    console.log('\n   Possibly undercounted: contacts classified lead_only/unknown but their account has jobs:');
    console.log('   ' + Number(underCount?.cnt || 0) + '\n');

    // -------------------------------------------------------------------------
    // 4. Invoices / total_revenue validation
    // -------------------------------------------------------------------------
    const invStats = await q(`
      SELECT
        (SELECT COUNT(*) FROM invoices) AS invoices_total,
        (SELECT COUNT(*) FROM crm_customer_summary WHERE total_revenue > 0) AS contacts_with_revenue,
        (SELECT COUNT(*) FROM crm_account_summary WHERE total_revenue > 0) AS accounts_with_revenue
    `);
    const inv = invStats[0] || {};
    console.log('4. Invoices / total_revenue');
    console.table([
      { metric: 'Invoices total', value: Number(inv.invoices_total || 0) },
      { metric: 'Contacts with total_revenue > 0', value: Number(inv.contacts_with_revenue || 0) },
      { metric: 'Accounts with total_revenue > 0', value: Number(inv.accounts_with_revenue || 0) },
    ]);
    console.log();

    // -------------------------------------------------------------------------
    // 5. Reactivation candidates comparison
    // -------------------------------------------------------------------------
    const [v1Count] = await q(`SELECT COUNT(*) AS cnt FROM crm_reactivation_candidates`);
    const [v2Count] = await q(`SELECT COUNT(*) AS cnt FROM crm_reactivation_candidates_v2`);

    const excludedRecent = await q(`
      SELECT COUNT(DISTINCT rc.contact_id) AS cnt
      FROM crm_reactivation_candidates rc
      WHERE EXISTS (
        SELECT 1 FROM activities a
        WHERE a.contact_id = rc.contact_id
          AND a.occurred_at >= NOW() - INTERVAL '30 days'
          AND a.activity_type IN ('sms','inbound_sms','inbound_sms_unmatched','outbound_sms','call')
      )
    `);
    const excludedPhone = await q(`
      SELECT COUNT(*) AS cnt
      FROM crm_reactivation_candidates rc
      WHERE TRIM(COALESCE(rc.phone, '')) = ''
    `);
    const excludedDoNotContact = await q(`
      SELECT COUNT(*) AS cnt
      FROM crm_reactivation_candidates rc
      JOIN contacts c ON c.id = rc.contact_id
      WHERE COALESCE(c.status, 'active') = 'do_not_contact'
    `);

    console.log('5. Reactivation candidates comparison');
    console.table([
      { metric: 'crm_reactivation_candidates (v1) count', value: Number(v1Count?.cnt ?? 0) },
      { metric: 'crm_reactivation_candidates_v2 count', value: Number(v2Count?.cnt ?? 0) },
      { metric: 'Excluded: contacted in last 30 days', value: Number(excludedRecent[0]?.cnt ?? 0) },
      { metric: 'Excluded: empty phone (trim)', value: Number(excludedPhone[0]?.cnt ?? 0) },
      { metric: 'Excluded: do_not_contact status', value: Number(excludedDoNotContact[0]?.cnt ?? 0) },
    ]);
    console.log('   (Note: "recent job" exclusion is redundant – v1 already requires months_since_last_job >= 6)\n');

    // -------------------------------------------------------------------------
    // 6. Phone data quality
    // -------------------------------------------------------------------------
    const [phoneQuality] = await q(`
      SELECT
        (SELECT COUNT(*) FROM contacts) AS contacts_total,
        (SELECT COUNT(*) FROM contacts WHERE phone IS NOT NULL AND TRIM(COALESCE(phone,'')) <> '') AS contacts_with_phone,
        (SELECT COUNT(*) FROM contacts WHERE phone IS NULL OR TRIM(COALESCE(phone,'')) = '') AS contacts_without_phone,
        (SELECT COUNT(DISTINCT a.id) FROM accounts a WHERE EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.id AND c.phone IS NOT NULL AND TRIM(COALESCE(c.phone,'')) <> '')) AS accounts_with_phone_contact,
        (SELECT COUNT(DISTINCT a.id) FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM contacts c WHERE c.account_id = a.id AND c.phone IS NOT NULL AND TRIM(COALESCE(c.phone,'')) <> '')) AS accounts_without_phone_contact
    `);
    const pq = phoneQuality || {};
    console.log('6. Phone data quality');
    console.table([
      { metric: 'Contacts total', value: Number(pq.contacts_total ?? 0) },
      { metric: 'Contacts with phone', value: Number(pq.contacts_with_phone ?? 0) },
      { metric: 'Contacts without phone', value: Number(pq.contacts_without_phone ?? 0) },
      { metric: 'Accounts with phone contact', value: Number(pq.accounts_with_phone_contact ?? 0) },
      { metric: 'Accounts without phone contact', value: Number(pq.accounts_without_phone_contact ?? 0) },
    ]);
    console.log();

    // -------------------------------------------------------------------------
    // 7. Reactivation candidates (account-level with contact)
    // -------------------------------------------------------------------------
    let arcCount = 0;
    let topArc = [];
    try {
      const [arcCnt] = await q(`SELECT COUNT(*) AS cnt FROM crm_account_reactivation_contacts`);
      arcCount = Number(arcCnt?.cnt ?? 0);
      topArc = await q(`
        SELECT account_name, contact_name, phone, suburb, jobs_count, last_job_date, months_since_last_job, priority_score
        FROM crm_account_reactivation_contacts ORDER BY priority_score DESC LIMIT 20
      `);
    } catch (_) {}
    console.log('7. Account reactivation candidates (crm_account_reactivation_contacts)');
    console.table([{ metric: 'Reactivation candidates total', value: arcCount }]);
    console.log('\n   Top 20 account-level reactivation candidates (with contact + phone):');
    console.table((topArc || []).map((r) => ({
      account_name: r.account_name,
      contact_name: r.contact_name,
      phone: r.phone,
      suburb: r.suburb,
      jobs_count: Number(r.jobs_count || 0),
      last_job_date: r.last_job_date,
      months_since: r.months_since_last_job,
      priority: Number(r.priority_score || 0),
    })));
    console.log();

    // -------------------------------------------------------------------------
    // 8. Phone availability in v1 (contact-level)
    // -------------------------------------------------------------------------
    const [phoneStat] = await q(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE phone IS NOT NULL AND TRIM(COALESCE(phone,'')) <> '') AS has_phone
      FROM crm_reactivation_candidates
    `);
    const totalV1 = Number(phoneStat?.total ?? 0);
    const hasPhone = Number(phoneStat?.has_phone ?? 0);
    const pctPhone = totalV1 > 0 ? ((hasPhone / totalV1) * 100).toFixed(1) : '0';
    console.log('8. Phone availability in crm_reactivation_candidates (v1)');
    console.table([
      { metric: 'Total', value: totalV1 },
      { metric: 'With non-empty phone', value: hasPhone },
      { metric: 'Percent usable', value: pctPhone + '%' },
    ]);
    console.log();

    // -------------------------------------------------------------------------
    // 9. Top 10 contact-level and account-level (legacy)
    // -------------------------------------------------------------------------
    const topContact = await q(`
      SELECT contact_name, phone, account_name, suburb, jobs_count, total_revenue, last_job_date, months_since_last_job, priority_score
      FROM crm_reactivation_candidates ORDER BY priority_score DESC LIMIT 10
    `);
    const topAccount = await q(`
      SELECT account_name, suburb, contacts_count, contact_with_phone_count, jobs_count, total_revenue, last_job_date, months_since_last_job, priority_score
      FROM crm_account_reactivation_candidates ORDER BY priority_score DESC LIMIT 10
    `);

    console.log('9. Top 10 contact-level reactivation candidates');
    console.table(topContact.map((r) => ({
      contact_name: r.contact_name,
      phone: r.phone,
      account_name: r.account_name,
      suburb: r.suburb,
      jobs_count: Number(r.jobs_count || 0),
      total_revenue: Number(r.total_revenue || 0),
      months_since: r.months_since_last_job,
      priority: Number(r.priority_score || 0),
    })));
    console.log();

    console.log('10. Top 10 account-level reactivation candidates (summary only)');
    console.table(topAccount.map((r) => ({
      account_name: r.account_name,
      suburb: r.suburb,
      contacts: Number(r.contacts_count || 0),
      contacts_phone: Number(r.contact_with_phone_count || 0),
      jobs_count: Number(r.jobs_count || 0),
      total_revenue: Number(r.total_revenue || 0),
      months_since: r.months_since_last_job,
      priority: Number(r.priority_score || 0),
    })));

    await pool.end();
  } catch (err) {
    console.error('Error:', err.message);
    if (/does not exist|crm_account_summary|crm_reactivation_candidates_v2/.test(err.message)) {
      console.error('Run migrations 005 and 006 first: node scripts/run-segmentation-migration.js');
    }
    process.exitCode = 1;
  }
}

main();
