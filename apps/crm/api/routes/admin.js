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

// POST /api/admin/actions/sync-servicem8 — trigger ServiceM8 → CRM full sync (for cron or manual)
router.post('/admin/actions/sync-servicem8', async (req, res) => {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (secret) {
    const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
    if (provided !== secret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }
  try {
    const { syncAllFromServiceM8 } = require('../../services/servicem8-sync');
    const mode = (req.body?.mode || req.query?.mode || 'full').toLowerCase();
    const stats = await syncAllFromServiceM8({
      mode: mode === 'incremental' ? 'incremental' : 'full',
      log: (msg) => console.log('[sync-servicem8]', msg),
      onError: (err, ctx) => console.error('[sync-servicem8] error', ctx, err?.message),
    });
    const msg = stats.locked
      ? 'Sync skipped (another sync is running)'
      : `Synced: ${stats.accounts_created || 0} accounts, ${stats.contacts_created || 0} contacts, ${stats.jobs_created || 0} jobs, ${stats.invoices_created || 0} invoices, ${stats.quotes_upserted ?? stats.quotes_fetched ?? 0} quotes`;
    res.json({
      ok: true,
      message: msg,
      mode: stats.locked ? 'skipped' : mode,
      locked: !!stats.locked,
      ...stats,
    });
  } catch (e) {
    console.error('[sync-servicem8]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/admin/actions/sync-quotes — quote sync only
router.post('/admin/actions/sync-quotes', async (req, res) => {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (secret) {
    const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
    if (provided !== secret) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
  }
  try {
    const { syncQuotesFromServiceM8 } = require('../../services/quote-sync');
    const stats = await syncQuotesFromServiceM8({
      log: (msg) => console.log('[sync-quotes]', msg),
      onError: (err, ctx) => console.error('[sync-quotes] error', ctx, err?.message),
    });
    res.json({ ok: true, ...stats });
  } catch (e) {
    console.error('[sync-quotes]', e);
    res.status(500).json({ ok: false, error: e.message });
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

// ---------- 自动化控制（开关 + 催款预览/发送）----------
const automationSettings = require('../../services/automationSettings');
const {
  scanOverdueInvoices,
  getLevelToTrigger,
  runLevelForInvoice,
} = require('../../services/invoiceOverdueAutomation');
const { renderSms } = require('../../lib/invoice-overdue-config');

router.get('/admin/automation-settings', async (req, res) => {
  try {
    const all = await automationSettings.getAll();
    res.json({
      invoice_overdue_enabled: all.invoice_overdue_enabled !== 'false',
      invoice_overdue_enabled_updated_at: all.invoice_overdue_enabled_updated_at || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.patch('/admin/automation-settings', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.invoice_overdue_enabled !== undefined) {
      await automationSettings.set('invoice_overdue_enabled', body.invoice_overdue_enabled);
    }
    const all = await automationSettings.getAll();
    res.json({
      invoice_overdue_enabled: all.invoice_overdue_enabled !== 'false',
      invoice_overdue_enabled_updated_at: all.invoice_overdue_enabled_updated_at || null,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** GET 催款预览：本次会催的名单、天数、金额、拟发短信内容 */
router.get('/admin/overdue-preview', async (req, res) => {
  try {
    const rows = await scanOverdueInvoices({ db: pool });
    const minDays = req.query.min_days_overdue != null ? Number(req.query.min_days_overdue) : null;
    const maxDays = req.query.max_days_overdue != null ? Number(req.query.max_days_overdue) : null;
    const minAmount = req.query.min_amount != null ? Number(req.query.min_amount) : null;
    const maxAmount = req.query.max_amount != null ? Number(req.query.max_amount) : null;
    const levelFilter = typeof req.query.level === 'string' && req.query.level.trim()
      ? String(req.query.level).trim().toLowerCase()
      : null;

    const list = [];
    for (const row of rows) {
      const level = getLevelToTrigger(row);
      if (!level) continue;
      const days = row.days_overdue != null ? Number(row.days_overdue) : null;
      const amount = row.amount != null ? Number(row.amount) : null;
      if (minDays != null && (days == null || days < minDays)) continue;
      if (maxDays != null && (days == null || days > maxDays)) continue;
      if (minAmount != null && (amount == null || amount < minAmount)) continue;
      if (maxAmount != null && (amount == null || amount > maxAmount)) continue;
      if (levelFilter && String(level).toLowerCase() !== levelFilter) continue;
      const message = renderSms(level, row.contact_name, row.invoice_number);
      list.push({
        invoice_id: row.invoice_id,
        account_id: row.account_id,
        contact_id: row.contact_id,
        contact_name: row.contact_name || '—',
        contact_phone: row.contact_phone || null,
        invoice_number: row.invoice_number,
        amount: row.amount,
        due_date: row.due_date,
        days_overdue: row.days_overdue,
        overdue_level: row.overdue_level,
        level_trigger: level,
        message,
      });
    }
    res.json({ items: list });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/** POST 催款发送：对选中的项发送短信（可带自定义 message），并执行 task/level 更新 */
router.post('/admin/overdue-send', async (req, res) => {
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];
    const results = [];
    for (const it of items) {
      const invoiceId = it.invoice_id;
      const customMessage = (it.message && String(it.message).trim()) || null;
      if (!invoiceId) {
        results.push({ invoice_id: null, error: 'missing invoice_id' });
        continue;
      }
      const rows = await scanOverdueInvoices({ db: pool });
      const row = rows.find((r) => r.invoice_id === invoiceId);
      if (!row) {
        results.push({ invoice_id: invoiceId, error: 'not in overdue list or already paid' });
        continue;
      }
      const level = getLevelToTrigger(row);
      if (!level) {
        results.push({ invoice_id: invoiceId, error: 'no level to trigger' });
        continue;
      }
      try {
        const r = await runLevelForInvoice(row, level, {
          db: pool,
          dryRun: false,
          sendSms: true,
          customMessage,
        });
        results.push({ invoice_id: invoiceId, level, task_created: r.task_created, sms_sent: r.sms_sent, error: r.sms_error || null });
      } catch (e) {
        results.push({ invoice_id: invoiceId, error: e.message || String(e) });
      }
    }
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
