#!/usr/bin/env node
/**
 * Validate DELETE /api/leads/:id behavior against DB logic.
 *
 * Usage:
 *   node scripts/test-lead-delete.js --lead-id <uuid>         # runs in transaction + rollback (default)
 *   node scripts/test-lead-delete.js --lead-id <uuid> --commit
 *   node scripts/test-lead-delete.js --sample                 # list sample leads for picking a lead id
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function sampleLeads() {
  const r = await pool.query(
    `SELECT l.id, l.contact_id, c.name AS contact_name, l.created_at
     FROM leads l
     LEFT JOIN contacts c ON c.id = l.contact_id
     ORDER BY l.created_at DESC
     LIMIT 10`
  );
  console.log('Recent leads (sample 10):');
  r.rows.forEach((row) => {
    console.log(`- ${row.id} | contact_id=${row.contact_id || 'null'} | contact_name=${row.contact_name || 'null'}`);
  });
}

async function simulateDelete(db, leadId) {
  const check = await db.query(
    `SELECT l.id, COALESCE(c.name, l.id::text) AS name
     FROM leads l LEFT JOIN contacts c ON l.contact_id = c.id
     WHERE l.id = $1`,
    [leadId]
  );
  if (!check.rows[0]) {
    return { ok: false, status: 404, error: 'Lead not found' };
  }

  await db.query(`DELETE FROM activities WHERE lead_id = $1`, [leadId]);
  await db.query(`DELETE FROM tasks WHERE lead_id = $1`, [leadId]);
  await db.query(`UPDATE opportunities SET lead_id = NULL WHERE lead_id = $1`, [leadId]);
  const del = await db.query(`DELETE FROM leads WHERE id = $1`, [leadId]);

  return {
    ok: true,
    status: 200,
    deleted: check.rows[0].name,
    deleted_count: del.rowCount,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const sample = args.includes('--sample');
  const commit = args.includes('--commit');
  const leadIdIdx = args.indexOf('--lead-id');
  const leadId = leadIdIdx >= 0 && args[leadIdIdx + 1] ? args[leadIdIdx + 1] : null;

  if (sample) {
    await sampleLeads();
    await pool.end();
    return;
  }

  if (!leadId) {
    console.log('Usage: node scripts/test-lead-delete.js --lead-id <uuid> [--commit]');
    console.log('       node scripts/test-lead-delete.js --sample');
    process.exit(1);
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const result = await simulateDelete(db, leadId);
    console.log('Delete simulation result:', result);

    if (!commit) {
      await db.query('ROLLBACK');
      console.log('Rolled back (default). No database changes were persisted.');
    } else {
      await db.query('COMMIT');
      console.log('Committed. Database changes were persisted.');
    }
  } finally {
    db.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
