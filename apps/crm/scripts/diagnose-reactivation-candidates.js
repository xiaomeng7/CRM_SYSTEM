/**
 * 诊断 reactivation 候选客户：为何生成 0 条
 * Usage: node apps/crm/scripts/diagnose-reactivation-candidates.js
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function main() {
  console.log('=== Reactivation 候选诊断 ===\n');

  try {
    // 1. 基础表数量
    const [cCnt, aCnt, jCnt] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n FROM contacts'),
      pool.query('SELECT COUNT(*) AS n FROM accounts'),
      pool.query('SELECT COUNT(*) AS n FROM jobs'),
    ]);
    console.log('1. 基础数据');
    console.log('   contacts:', cCnt.rows[0].n);
    console.log('   accounts:', aCnt.rows[0].n);
    console.log('   jobs:', jCnt.rows[0].n);

    // 2. 有电话的联系人
    const withPhone = await pool.query(
      `SELECT COUNT(*) AS n FROM contacts WHERE phone IS NOT NULL AND TRIM(phone) <> ''`
    );
    console.log('   有电话的联系人:', withPhone.rows[0].n);

    // 3. crm_account_summary 是否存在
    let summaryCnt = null;
    try {
      const s = await pool.query('SELECT COUNT(*) AS n FROM crm_account_summary');
      summaryCnt = s.rows[0].n;
      console.log('\n2. crm_account_summary 视图');
      console.log('   存在，行数:', summaryCnt);
    } catch (e) {
      console.log('\n2. crm_account_summary 视图');
      console.log('   ❌ 不存在:', e.message);
    }

    // 4. crm_account_reactivation_contacts 是否存在及数量
    let arcCnt = 0;
    let arcSample = [];
    try {
      const arc = await pool.query('SELECT COUNT(*) AS n FROM crm_account_reactivation_contacts');
      arcCnt = Number(arc.rows[0].n);
      const sample = await pool.query(
        `SELECT account_id, contact_id, contact_name, phone, months_since_last_job, priority_score
         FROM crm_account_reactivation_contacts LIMIT 5`
      );
      arcSample = sample.rows;
      console.log('\n3. crm_account_reactivation_contacts 视图');
      console.log('   存在，候选数量:', arcCnt);
      if (arcSample.length) {
        console.log('   前 5 条示例:');
        arcSample.forEach((r, i) => console.log('     ', i + 1, r.contact_name, '|', r.phone, '| months:', r.months_since_last_job));
      }
    } catch (e) {
      console.log('\n3. crm_account_reactivation_contacts 视图');
      console.log('   ❌ 不存在或查询失败:', e.message);
    }

    // 5. 若有条目，检查排除原因
    if (arcCnt > 0) {
      const contactIds = arcSample.map((r) => r.contact_id).filter(Boolean);
      if (contactIds.length === 0) {
        const all = await pool.query('SELECT contact_id FROM crm_account_reactivation_contacts LIMIT 20');
        contactIds.push(...all.rows.map((r) => r.contact_id).filter(Boolean));
      }
      if (contactIds.length > 0) {
        const [recent, inQueue, dnc] = await Promise.all([
          pool.query(
            `SELECT contact_id FROM activities
             WHERE contact_id = ANY($1) AND activity_type = ANY($2)
               AND occurred_at >= NOW() - INTERVAL '30 days'
             GROUP BY contact_id`,
            [contactIds, ['sms', 'inbound_sms', 'inbound_sms_unmatched', 'outbound_sms', 'call']]
          ),
          pool.query(
            `SELECT contact_id FROM reactivation_sms_queue
             WHERE contact_id = ANY($1) AND status IN ('queued', 'preview', 'sent')`,
            [contactIds]
          ),
          pool.query(
            `SELECT id FROM contacts WHERE id = ANY($1) AND (do_not_contact = true OR do_not_contact IS TRUE)`,
            [contactIds]
          ),
        ]);
        console.log('\n4. 排除原因（针对部分候选）');
        console.log('   最近 30 天已联系:', recent.rows.length);
        console.log('   已在队列中:', inQueue.rows.length);
        console.log('   Do Not Contact:', dnc.rows.length);
      }
    }

    // 6. crm_account_summary 明细（若存在）
    if (summaryCnt != null && Number(summaryCnt) > 0) {
      const detail = await pool.query(
        `SELECT customer_type, COUNT(*) AS n,
                COUNT(*) FILTER (WHERE months_since_last_job >= 6) AS months_ge_6,
                COUNT(*) FILTER (WHERE contact_with_phone_count > 0) AS has_phone
         FROM crm_account_summary
         GROUP BY customer_type`
      );
      console.log('\n5. crm_account_summary 按 customer_type');
      detail.rows.forEach((r) => console.log('   ', r.customer_type, ':', r.n, '| months>=6:', r.months_ge_6, '| has_phone:', r.has_phone));
    }
  } catch (err) {
    console.error('诊断失败:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
