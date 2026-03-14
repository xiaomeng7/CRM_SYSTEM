/**
 * 验证 months_since_last_job 修复效果
 * Usage: node apps/crm/scripts/verify-months-fix.js
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function main() {
  console.log('=== months_since_last_job 修复验证 ===\n');

  const r1 = await pool.query(
    `SELECT customer_type, COUNT(*) AS n,
            COUNT(*) FILTER (WHERE months_since_last_job >= 6) AS months_ge_6,
            COUNT(*) FILTER (WHERE months_since_last_job >= 12) AS months_ge_12
     FROM crm_account_summary
     GROUP BY customer_type`
  );
  console.log('1. crm_account_summary 按 customer_type:');
  r1.rows.forEach((row) => {
    console.log(`   ${row.customer_type}: 总数=${row.n}, months>=6: ${row.months_ge_6}, months>=12: ${row.months_ge_12}`);
  });

  const realTotal = r1.rows.find((r) => r.customer_type === 'real_customer')?.n || 0;
  const monthsGe6 = r1.rows.find((r) => r.customer_type === 'real_customer')?.months_ge_6 || 0;
  const monthsGe12 = r1.rows.find((r) => r.customer_type === 'real_customer')?.months_ge_12 || 0;

  console.log('\n2. crm_account_reactivation_contacts 候选数:');
  const arc = await pool.query('SELECT COUNT(*) AS n FROM crm_account_reactivation_contacts');
  console.log('   ', arc.rows[0].n);

  console.log('\n3. Top 20 最老客户样本 (account_name, last_job_date, months_since_last_job):');
  const sample = await pool.query(
    `SELECT account_name, last_job_date, months_since_last_job, jobs_count
     FROM crm_account_summary
     WHERE customer_type = 'real_customer' AND last_job_date IS NOT NULL
     ORDER BY months_since_last_job DESC NULLS LAST
     LIMIT 20`
  );
  sample.rows.forEach((row, i) => {
    console.log(`   ${i + 1}. ${(row.account_name || '').slice(0, 40)} | ${row.last_job_date} | months: ${row.months_since_last_job} | jobs: ${row.jobs_count}`);
  });

  console.log('\n=== 总结 ===');
  console.log('- real_customer 总数:', realTotal);
  console.log('- months_since_last_job >= 6 的数量:', monthsGe6);
  console.log('- months_since_last_job >= 12 的数量:', monthsGe12);
  console.log('- crm_account_reactivation_contacts 候选数:', arc.rows[0].n);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
