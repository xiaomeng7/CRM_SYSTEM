/**
 * CRM API Server
 * REST API for customers, jobs, and internal operations.
 * Deploy target: Railway.
 */

require('../lib/load-env');
const path = require('path');
const express = require('express');
const { sendSMS } = require('@bht/integrations');
const { pool } = require('../lib/db');
const leadsRouter = require('./routes/leads');
const opportunitiesRouter = require('./routes/opportunities');
const publicLeadsRouter = require('./routes/public-leads');
const contactsRouter = require('./routes/contacts');
const accountsRouter = require('./routes/accounts');
const webhooksRouter = require('./routes/webhooks');
const reactivationDashboardRouter = require('./routes/reactivation-dashboard');
const reactivationRepliesRouter = require('./routes/reactivation-replies');
const reactivationQueueRouter = require('./routes/reactivation-queue');
const dataMaintenanceRouter = require('./routes/data-maintenance');
const adminRouter = require('./routes/admin');
const tasksRouter = require('./routes/tasks');
const priorityRouter = require('./routes/priority');
const cashflowRouter = require('./routes/cashflow');
const ownerDashboardRouter = require('./routes/owner-dashboard');
const aiRouter = require('./routes/ai');
const weeklyDashboardRouter = require('./routes/weekly-dashboard');
const campaignRoiRouter = require('./routes/campaign-roi');
const campaignRoiInsightsRouter = require('./routes/campaign-roi-insights');
const campaignActionPlansRouter = require('./routes/campaign-action-plans');
const campaignActionPlanHistoryRouter = require('./routes/campaign-action-plan-history');
const campaignActionPlanReadyRouter = require('./routes/campaign-action-plan-ready');
const adGenerationRouter = require('./routes/ad-generation');
const adExecutionRouter = require('./routes/ad-execution');
const adVariantReviewRouter = require('./routes/ad-variant-review');
const landingVariantReviewRouter = require('./routes/landing-variant-review');
const adPublishRouter = require('./routes/ad-publish');
const b2bProspectsRouter = require('./routes/b2b-prospects');
const inspectionsRouter = require('./routes/inspections');
const customers = require('./customers');
const jobs = require('./jobs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Internal CRM UI (static; dashboard at /)
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/leads', leadsRouter);
app.use('/api/opportunities', opportunitiesRouter);
app.use('/api/public/leads', publicLeadsRouter);
app.use('/api/contacts', contactsRouter);
app.use('/api/accounts', accountsRouter);
app.use('/api/webhooks', webhooksRouter);
app.use('/api/reactivation/dashboard', reactivationDashboardRouter);
app.use('/api/reactivation/replies', reactivationRepliesRouter);
app.use('/api/reactivation/queue', reactivationQueueRouter);
app.use('/api/data-maintenance', dataMaintenanceRouter);
app.use('/api', adminRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/priority', priorityRouter);
app.use('/api/cashflow', cashflowRouter);
app.use('/api/owner-dashboard', ownerDashboardRouter);
app.use('/api/ai', aiRouter);
app.use('/api/dashboard/weekly', weeklyDashboardRouter);
app.use('/api/dashboard/campaign-roi', campaignRoiRouter);
app.use('/api/dashboard/campaign-roi-insights', campaignRoiInsightsRouter);
app.use('/api/dashboard/campaign-action-plans', campaignActionPlansRouter);
app.use('/api/dashboard/campaign-action-plan-history', campaignActionPlanHistoryRouter);
app.use('/api/dashboard/campaign-action-plan-ready', campaignActionPlanReadyRouter);
app.use('/api/ad-generation', adGenerationRouter);
app.use('/api/ad-execution', adExecutionRouter);
app.use('/api/ad-variants', adVariantReviewRouter);
app.use('/api/landing-variants', landingVariantReviewRouter);
app.use('/api/ad-publish', adPublishRouter);
app.use('/api/b2b-prospects', b2bProspectsRouter);
app.use('/api/inspections', inspectionsRouter);

app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const [leads7d, tasksToday, opps, contactsRecent] = await Promise.all([
      pool.query(`SELECT COUNT(*) AS n FROM leads WHERE created_at >= NOW() - INTERVAL '7 days'`).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
      pool.query(`SELECT COUNT(*) AS n FROM tasks WHERE COALESCE(status,'open') IN ('open','pending') AND due_at::date <= CURRENT_DATE`).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
      pool.query(`SELECT COUNT(*) AS n FROM opportunities WHERE stage NOT IN ('won','lost')`).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
      pool.query(`SELECT COUNT(*) AS n FROM contacts WHERE created_at >= NOW() - INTERVAL '7 days'`).then((r) => Number(r.rows[0]?.n ?? 0)).catch(() => 0),
    ]);
    res.json({ leads7d, tasksToday, opps, contactsRecent });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

function isCustomersTableMissing(err) {
  return err && /relation "customers" does not exist/i.test(err.message);
}

app.get('/api/customers', async (req, res) => {
  try {
    const rows = await customers.listCustomers({
      suburb: req.query.suburb,
      tags: req.query.tags ? req.query.tags.split(',') : undefined,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    if (isCustomersTableMissing(err)) {
      console.warn('GET /api/customers: customers table not found, returning []. Run database/schema.sql if you need legacy customers.');
      return res.json([]);
    }
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/customers/:id', async (req, res) => {
  try {
    const row = await customers.getCustomerById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    if (isCustomersTableMissing(err)) return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers/:id/reactivate', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
      return res.status(400).json({ ok: false, error: 'Invalid customer id' });
    }

    const customer = await customers.getCustomerById(id);
    if (!customer) return res.status(404).json({ ok: false, error: 'Not found' });
    if (!customer.phone) {
      return res.status(400).json({ ok: false, error: 'Customer has no phone number' });
    }

    const name = (customer.name || '').trim() || 'there';
    const message =
      'Hi ' + name + ',\n\n' +
      'Just checking in — we’re reviewing some previous electrical work in the area.\n\n' +
      'If you ever need help with lighting, power points, EV chargers or anything electrical, feel free to message me.\n\n' +
      '– Meng\n' +
      'Better Home Technology';

    await sendSMS(customer.phone, message);

    await pool.query(
      `INSERT INTO activities (contact_id, lead_id, opportunity_id, activity_type, summary, created_by)
       VALUES (NULL, NULL, NULL, 'sms', 'reactivation message sent for customer ' || $1, $2)`,
      [customer.id, 'reactivation']
    );

    return res.status(200).json({ ok: true });
  } catch (err) {
    if (isCustomersTableMissing(err)) return res.status(404).json({ ok: false, error: 'Not found' });
    console.error('reactivate error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.patch('/api/customers/:id/tags', async (req, res) => {
  try {
    const tags = Array.isArray(req.body.tags) ? req.body.tags : [];
    const row = await customers.updateCustomerTags(parseInt(req.params.id, 10), tags);
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    if (isCustomersTableMissing(err)) return res.status(404).json({ error: 'Not found' });
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs', async (req, res) => {
  try {
    const rows = await jobs.listJobs({
      customerId: req.query.customer_id ? parseInt(req.query.customer_id, 10) : undefined,
      status: req.query.status,
      fromDate: req.query.from_date,
      toDate: req.query.to_date,
      limit: parseInt(req.query.limit, 10) || 100,
      offset: parseInt(req.query.offset, 10) || 0,
    });
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/jobs/:id', async (req, res) => {
  try {
    const row = await jobs.getJobById(parseInt(req.params.id, 10));
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`CRM API running on http://localhost:${PORT}`);

  // Optional: auto sync ServiceM8 on interval (set AUTO_SYNC_SERVICEM8=true)
  const autoSync = process.env.AUTO_SYNC_SERVICEM8 === 'true' || process.env.AUTO_SYNC_SERVICEM8 === '1';
  if (autoSync) {
    const hours = Math.max(1, parseInt(process.env.AUTO_SYNC_INTERVAL_HOURS || '2', 10));
    const intervalMs = hours * 60 * 60 * 1000;
    const { syncAllFromServiceM8 } = require('../services/servicem8-sync');
    const runSync = () => {
      syncAllFromServiceM8({
        log: (msg) => console.log('[auto-sync]', msg),
        onError: (err, ctx) => console.error('[auto-sync] error', ctx, err?.message),
      }).catch((e) => console.error('[auto-sync]', e));
    };
    setTimeout(runSync, 60 * 1000); // first run after 1 min (let server warm up)
    setInterval(runSync, intervalMs);
    console.log(`[auto-sync] ServiceM8 sync scheduled every ${hours} hour(s)`);
  }

  // Optional: run invoice overdue automation daily; set AUTO_INVOICE_OVERDUE_DAILY=true. Admin can toggle via automation_settings.
  const autoInvoiceOverdue = process.env.AUTO_INVOICE_OVERDUE_DAILY === 'true' || process.env.AUTO_INVOICE_OVERDUE_DAILY === '1';
  if (autoInvoiceOverdue) {
    const { runOverdueScan } = require('../services/invoiceOverdueAutomation');
    const { getEnabled } = require('../services/automationSettings');
    const OVERDUE_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const runOverdue = async () => {
      const enabled = await getEnabled('invoice_overdue_enabled');
      if (!enabled) return;
      runOverdueScan({ dryRun: false, sendSms: true, log: (msg) => console.log('[invoice-overdue]', msg) })
        .then((out) => console.log('[invoice-overdue] done, processed:', out.processed))
        .catch((e) => console.error('[invoice-overdue]', e));
    };
    setTimeout(runOverdue, 2 * 60 * 1000);
    setInterval(runOverdue, OVERDUE_INTERVAL_MS);
    console.log('[invoice-overdue] scheduled daily (every 24h); toggle in Admin → 自动化控制');
  }

  // Optional: run Customer Scoring 2.0 daily; set AUTO_CUSTOMER_SCORING_DAILY=true
  const autoScoring = process.env.AUTO_CUSTOMER_SCORING_DAILY === 'true' || process.env.AUTO_CUSTOMER_SCORING_DAILY === '1';
  if (autoScoring) {
    const { updateAllCustomerScores } = require('../services/customerScoringEngine');
    const SCORING_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const runScoring = () => {
      updateAllCustomerScores({ log: (msg) => console.log('[customer-scoring]', msg) })
        .then((out) => console.log('[customer-scoring] done, processed:', out.processed))
        .catch((e) => console.error('[customer-scoring]', e));
    };
    setTimeout(runScoring, 3 * 60 * 1000);
    setInterval(runScoring, SCORING_INTERVAL_MS);
    console.log('[customer-scoring] scheduled daily (every 24h)');
  }

  // Inspection follow-up SMS D+1/7/14; set AUTO_INSPECTION_FOLLOWUP=true
  const autoFollowup = process.env.AUTO_INSPECTION_FOLLOWUP === 'true' || process.env.AUTO_INSPECTION_FOLLOWUP === '1';
  if (autoFollowup) {
    const { runFollowupSequence } = require('../services/inspectionFollowupScheduler');
    const FOLLOWUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    const runFollowup = () => {
      runFollowupSequence({ log: (msg) => console.log('[inspection-followup]', msg) })
        .then((out) => console.log('[inspection-followup] done, sent:', out.sent))
        .catch((e) => console.error('[inspection-followup]', e));
    };
    setTimeout(runFollowup, 5 * 60 * 1000);
    setInterval(runFollowup, FOLLOWUP_INTERVAL_MS);
    console.log('[inspection-followup] D+1/7/14 SMS scheduled daily');
  }
});
