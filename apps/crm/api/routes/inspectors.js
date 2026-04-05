/**
 * Inspectors API — partner registry + performance (this month, Australia/Adelaide).
 *
 * GET    /api/inspectors
 * POST   /api/inspectors
 * GET    /api/inspectors/:id
 * PATCH  /api/inspectors/:id
 * GET    /api/inspectors/:id/performance
 * GET    /api/inspectors/:id/payout-preview?period_start=&period_end=
 * GET    /api/inspectors/:id/payouts
 * POST   /api/inspectors/:id/generate-payout  { period_start?, period_end? }
 * PATCH  /api/inspectors/payouts/:payoutId   { status?, notes? }
 * GET    /api/inspectors/payouts/:payoutId/statement
 * GET    /api/inspectors/payouts/:payoutId/export.csv
 * GET    /api/inspectors/meta/link-config  — paths + optional env base hint
 */

const router = require('express').Router();
const {
  listInspectors,
  getInspectorById,
  createInspector,
  updateInspector,
  getInspectorPerformance,
  inspectorLinks,
  LINK_PATHS,
} = require('../../services/inspectors');
const {
  getPayoutPreview,
  listPayoutsForInspector,
  generatePayout,
  updatePayout,
  getAdelaideMonthBounds,
  getPayoutStatement,
  getPayoutExportCsv,
} = require('../../services/inspectorPayouts');

function requireSyncSecret(req, res, next) {
  const secret = process.env.SYNC_SECRET || process.env.ADMIN_SECRET;
  if (!secret) return next();
  const provided = req.headers['x-sync-secret'] || req.query.sync_secret || req.body?.sync_secret;
  if (provided !== secret) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  return next();
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

router.use(requireSyncSecret);

router.patch('/payouts/:payoutId', async (req, res) => {
  try {
    const { payoutId } = req.params;
    if (!isUuid(payoutId)) return res.status(400).json({ ok: false, error: 'Invalid payout id' });
    const row = await updatePayout(payoutId, req.body || {});
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, payout: row });
  } catch (e) {
    console.error('[inspectors PATCH payout]', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/payouts/:payoutId/statement', async (req, res) => {
  try {
    const { payoutId } = req.params;
    if (!isUuid(payoutId)) return res.status(400).json({ ok: false, error: 'Invalid payout id' });
    const stmt = await getPayoutStatement(payoutId);
    if (!stmt) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, ...stmt });
  } catch (e) {
    console.error('[inspectors payout statement]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/payouts/:payoutId/export.csv', async (req, res) => {
  try {
    const { payoutId } = req.params;
    if (!isUuid(payoutId)) return res.status(400).json({ ok: false, error: 'Invalid payout id' });
    const csv = await getPayoutExportCsv(payoutId);
    if (!csv) return res.status(404).json({ ok: false, error: 'Not found' });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="inspector-payout-${payoutId}.csv"`);
    res.send(csv);
  } catch (e) {
    console.error('[inspectors payout export.csv]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/meta/link-config', (req, res) => {
  const base = (process.env.PUBLIC_MARKETING_SITE_BASE || '').trim().replace(/\/$/, '');
  res.json({
    ok: true,
    paths: LINK_PATHS,
    suggested_base_url: base || null,
  });
});

router.get('/', async (req, res) => {
  try {
    const rows = await listInspectors();
    res.json({ ok: true, inspectors: rows });
  } catch (e) {
    console.error('[inspectors GET list]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const row = await createInspector(req.body || {});
    res.status(201).json({ ok: true, inspector: row, links: inspectorLinks(row.source_code) });
  } catch (e) {
    console.error('[inspectors POST]', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/:id/performance', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await getInspectorById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    const perf = await getInspectorPerformance(row.source_code);
    res.json({ ok: true, ...perf, source_code: row.source_code });
  } catch (e) {
    console.error('[inspectors performance]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.get('/:id/payout-preview', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await getInspectorById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    const ps = req.query.period_start ? String(req.query.period_start) : null;
    const pe = req.query.period_end ? String(req.query.period_end) : null;
    const preview = await getPayoutPreview(id, ps, pe);
    if (!preview) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, ...preview });
  } catch (e) {
    console.error('[inspectors payout-preview]', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/:id/payouts', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await getInspectorById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    const payouts = await listPayoutsForInspector(id);
    res.json({ ok: true, payouts });
  } catch (e) {
    console.error('[inspectors payouts list]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post('/:id/generate-payout', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await getInspectorById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    const body = req.body || {};
    let ps = body.period_start;
    let pe = body.period_end;
    if (!ps || !pe) {
      const b = await getAdelaideMonthBounds();
      ps = b.period_start;
      pe = b.period_end;
    }
    const out = await generatePayout(id, ps, pe);
    if (!out.ok) return res.status(404).json(out);
    const empty = !out.payouts || out.payouts.length === 0;
    res.status(201).json({
      ok: true,
      payouts: out.payouts,
      invoice_ids: out.invoice_ids,
      message: empty ? '本期没有新的可结算订单（或已全部纳入历史结算）' : undefined,
    });
  } catch (e) {
    console.error('[inspectors generate-payout]', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await getInspectorById(id);
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, inspector: row, links: inspectorLinks(row.source_code) });
  } catch (e) {
    console.error('[inspectors GET one]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isUuid(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
    const row = await updateInspector(id, req.body || {});
    if (!row) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, inspector: row, links: inspectorLinks(row.source_code) });
  } catch (e) {
    console.error('[inspectors PATCH]', e);
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
