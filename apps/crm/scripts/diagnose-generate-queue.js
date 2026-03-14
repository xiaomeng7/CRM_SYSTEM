#!/usr/bin/env node
/**
 * Diagnose why Generate Queue returns 0 items.
 * Run: node apps/crm/scripts/diagnose-generate-queue.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { pool } = require('../lib/db');

const CONTACT_ACTIVITY_TYPES = ['sms', 'inbound_sms', 'inbound_sms_unmatched', 'outbound_sms', 'call'];
const LIMIT = 20;
const MIN_PRIORITY = 40;

async function main() {
  console.log('=== Generate Queue 诊断 ===\n');

  // 1️⃣ crm_account_reactivation_contacts: total, score>=40, score>=20
  const q1 = await pool.query(`
    SELECT
      COUNT(*) total,
      COUNT(*) FILTER (WHERE COALESCE(priority_score, 0) >= 40) AS score_40,
      COUNT(*) FILTER (WHERE COALESCE(priority_score, 0) >= 20) AS score_20
    FROM crm_account_reactivation_contacts
  `);
  const r1 = q1.rows[0];
  console.log('1️⃣ crm_account_reactivation_contacts:');
  console.log('   total:', r1.total);
  console.log('   score>=40:', r1.score_40);
  console.log('   score>=20:', r1.score_20);

  // 2️⃣ Already in queue
  const q2 = await pool.query(`
    SELECT COUNT(DISTINCT contact_id) AS in_queue
    FROM reactivation_sms_queue
  `);
  const inQueue = Number(q2.rows[0]?.in_queue ?? 0);
  console.log('\n2️⃣ 已在 reactivation_sms_queue 的联系人数:', inQueue);

  // 2b. By status
  const q2b = await pool.query(`
    SELECT status, COUNT(*) AS cnt
    FROM reactivation_sms_queue
    GROUP BY status
  `);
  console.log('   按 status:', q2b.rows.map((r) => `${r.status}=${r.cnt}`).join(', '));

  // 6️⃣ 先取 candidates（与 engine 一致）
  const q6 = await pool.query(`
    SELECT account_id, contact_id, contact_name, phone, priority_score
    FROM crm_account_reactivation_contacts
    WHERE phone IS NOT NULL AND TRIM(COALESCE(phone, '')) <> ''
      AND COALESCE(priority_score, 0) >= $1
    ORDER BY priority_score DESC
    LIMIT $2
  `, [MIN_PRIORITY, LIMIT * 2]);
  const candidates = q6.rows;
  const contactIds = [...new Set(candidates.map((r) => r.contact_id).filter(Boolean))];
  console.log('\n6️⃣ generate 第一步 candidates (limit*2=' + LIMIT * 2 + '):', candidates.length);

  // 3️⃣ 最近30天联系过滤
  const idsForAny = contactIds.length ? contactIds : [-1];
  const q3 = await pool.query(`
    SELECT contact_id FROM activities
    WHERE contact_id = ANY($1) AND activity_type = ANY($2)
      AND occurred_at >= NOW() - INTERVAL '30 days'
    GROUP BY contact_id
  `, [idsForAny, CONTACT_ACTIVITY_TYPES]);
  const recentIds = new Set(q3.rows.map((r) => r.contact_id));
  const recentInCand = contactIds.filter((id) => recentIds.has(id)).length;
  console.log('\n3️⃣ 最近30天联系过: 全局', recentIds.size, '| 在 candidates 中', recentInCand, '(会排除)');

  // 4️⃣ do_not_contact
  const q4 = await pool.query(`
    SELECT id FROM contacts
    WHERE id = ANY($1) AND (do_not_contact = true OR do_not_contact IS TRUE)
  `, [idsForAny]);
  const dncIds = new Set((q4.rows || []).map((r) => r.id));
  const dncInCand = contactIds.filter((id) => dncIds.has(id)).length;
  console.log('4️⃣ do_not_contact: 全局', dncIds.size, '| 在 candidates 中', dncInCand, '(会排除)');

  // 5️⃣ 已在 queue 中的 contact_id（queued/preview/sent）
  const q5 = await pool.query(`
    SELECT contact_id FROM reactivation_sms_queue
    WHERE contact_id = ANY($1) AND status IN ('queued', 'preview', 'sent')
  `, [idsForAny]);
  const inQueueIds = new Set(q5.rows.map((r) => r.contact_id));
  const inQueueInCand = contactIds.filter((id) => inQueueIds.has(id)).length;
  console.log('5️⃣ 已在 queue (queued/preview/sent): 匹配 candidates 的', inQueueInCand, '(会排除)');

  const allowed = new Set(
    contactIds.filter((id) => !recentIds.has(id) && !inQueueIds.has(id) && !dncIds.has(id))
  );
  const toInsert = candidates
    .filter((c) => c.contact_id && allowed.has(c.contact_id))
    .slice(0, LIMIT);
  console.log('7️⃣ 排除后最终可插入数:', toInsert.length);

  if (candidates.length > 0 && toInsert.length === 0) {
    const sample = candidates.slice(0, 5);
    console.log('\n--- 样本 contact_id 排除原因 ---');
    for (const s of sample) {
      const reasons = [];
      if (recentIds.has(s.contact_id)) reasons.push('recent_30d');
      if (inQueueIds.has(s.contact_id)) reasons.push('in_queue');
      if (dncIds.has(s.contact_id)) reasons.push('do_not_contact');
      console.log('  contact_id=' + s.contact_id + ':', reasons.length ? reasons.join(', ') : 'allowed');
    }
  }

  // 8️⃣ priority_score 分布
  const q8 = await pool.query(`
    SELECT priority_score, COUNT(*) AS cnt
    FROM crm_account_reactivation_contacts
    GROUP BY priority_score
    ORDER BY priority_score DESC
    LIMIT 15
  `);
  console.log('\n8️⃣ priority_score 分布 (top):');
  q8.rows.forEach((r) => console.log('   score=' + r.priority_score + ':', r.cnt));

  await pool.end();
  console.log('\n=== 诊断结束 ===');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
