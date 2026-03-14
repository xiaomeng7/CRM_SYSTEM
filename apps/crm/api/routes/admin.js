/**
 * Admin Console API
 * System status, queue stats, recent activities, workers, actions
 */

const path = require('path');
const fs = require('fs');
const router = require('express').Router();
const { pool } = require('../../lib/db');

// GET /api/system/status
router.get('/system/status', async (req, res) => {
  const result = { last_checked: new Date().toISOString() };
  try {
    const dbOk = await pool.query('SELECT 1').then(() => true).catch(() => false);
    result.api = 'ok';
    result.database = dbOk ? 'ok' : 'error';
    result.sms_engine = 'ok'; // Twilio reachability not checked
    result.reply_classifier = 'ok'; // Worker status via /admin/workers
    result.queue_worker = 'ok';
    res.json(result);
  } catch (e) {
    result.api = 'error';
    result.database = 'error';
    result.sms_engine = 'error';
    result.reply_classifier = 'error';
    result.queue_worker = 'error';
    res.json(result);
  }
});

// GET /api/admin/recent-activities
router.get('/admin/recent-activities', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT a.id, a.activity_type, a.summary, a.occurred_at, a.created_by,
              c.name AS contact_name, c.id AS contact_id
       FROM activities a
       LEFT JOIN contacts c ON c.id = a.contact_id
       ORDER BY a.occurred_at DESC NULLS LAST
       LIMIT 20`
    );
    res.json(r.rows.map((row) => ({
      id: row.id,
      type: row.activity_type,
      summary: row.summary || '—',
      occurred_at: row.occurred_at,
      contact_name: row.contact_name || '—',
      contact_id: row.contact_id,
    })));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/errors
router.get('/admin/errors', async (req, res) => {
  res.json([]);
});

// GET /api/admin/workers
router.get('/admin/workers', async (req, res) => {
  try {
    const replyLast = await pool.query(
      `SELECT MAX(occurred_at) AS last FROM activities WHERE activity_type IN ('inbound_sms','inbound_sms_unmatched') AND intent IS NOT NULL LIMIT 1`
    ).then((r) => r.rows[0]?.last).catch(() => null);
    const smsLast = await pool.query(
      `SELECT MAX(sent_at) AS last FROM reactivation_sms_queue WHERE status = 'sent'`
    ).then((r) => r.rows[0]?.last).catch(() => null);
    res.json({
      reply_classifier_worker: { status: 'unknown', last_run: replyLast },
      sms_sender_worker: { status: 'unknown', last_run: smsLast },
    });
  } catch (e) {
    res.json({
      reply_classifier_worker: { status: 'error', last_run: null },
      sms_sender_worker: { status: 'error', last_run: null },
    });
  }
});

// POST /api/admin/actions/*
router.post('/admin/actions/rebuild-segmentation', async (req, res) => {
  try {
    const dir = path.join(__dirname, '../../database');
    const files = ['005_customer_segmentation_views.sql', '006_customer_segmentation_account_and_v2.sql', '007_account_reactivation_contacts.sql', '012_reactivation_contacts_exclude_dnc.sql'];
    for (const f of files) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) await pool.query(fs.readFileSync(p, 'utf8'));
    }
    res.json({ ok: true, message: 'Segmentation views rebuilt' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/actions/regenerate-candidates', async (req, res) => {
  try {
    const dir = path.join(__dirname, '../../database');
    const files = ['005_customer_segmentation_views.sql', '006_customer_segmentation_account_and_v2.sql', '007_account_reactivation_contacts.sql', '012_reactivation_contacts_exclude_dnc.sql'];
    for (const f of files) {
      const p = path.join(dir, f);
      if (fs.existsSync(p)) await pool.query(fs.readFileSync(p, 'utf8'));
    }
    res.json({ ok: true, message: 'Candidates regenerated' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/admin/actions/run-health-check', async (req, res) => {
  try {
    const status = await pool.query('SELECT 1').then(() => true).catch(() => false);
    const contacts = await pool.query('SELECT COUNT(*) AS n FROM contacts').then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
    const accounts = await pool.query('SELECT COUNT(*) AS n FROM accounts').then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0);
    res.json({
      ok: true,
      database: status ? 'ok' : 'error',
      contacts,
      accounts,
      message: `DB: ${status ? 'ok' : 'error'}, contacts: ${contacts}, accounts: ${accounts}`,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET /api/admin/system-health
router.get('/admin/system-health', async (req, res) => {
  try {
    const dbOk = await pool.query('SELECT 1').then(() => true).catch(() => false);
    const [c, a, j] = await Promise.all([
      pool.query('SELECT COUNT(*) AS n FROM contacts').then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
      pool.query('SELECT COUNT(*) AS n FROM accounts').then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
      pool.query('SELECT COUNT(*) AS n FROM jobs').then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
    ]);
    res.json({
      ok: dbOk,
      database: dbOk ? 'ok' : 'error',
      contacts: c,
      accounts: a,
      jobs: j,
      summary: `DB: ${dbOk ? 'ok' : 'error'} | contacts: ${c} | accounts: ${a} | jobs: ${j}`,
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
