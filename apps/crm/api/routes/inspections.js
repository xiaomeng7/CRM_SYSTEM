/**
 * Inspections API — Pre-Purchase
 * GET  /api/inspections/job-lookup?job_number=XXX  — technician job lookup
 * POST /api/inspections/pre-purchase               — submit technician form
 * GET  /api/inspections                            — list inspections (admin)
 * GET  /api/inspections/:id                        — get single inspection
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const { runDecisionEngine } = require('../../services/pre-purchase-decision-engine');
const { sendSMS } = require('@bht/integrations');

// GET /api/inspections/job-lookup?job_number=XXX
router.get('/job-lookup', async (req, res) => {
  const jobNumber = String(req.query.job_number || '').trim();
  if (!jobNumber) return res.status(400).json({ ok: false, error: 'job_number required' });

  try {
    // Look up job in CRM jobs table first
    const jobRow = await pool.query(
      `SELECT j.id, j.job_number, j.servicem8_job_uuid, j.description, j.address_line, j.suburb,
              j.status, j.source_opportunity_id,
              a.name AS account_name, a.postcode,
              c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email,
              o.product_type
       FROM jobs j
       LEFT JOIN accounts a ON a.id = j.account_id
       LEFT JOIN contacts c ON c.id = j.contact_id
       LEFT JOIN opportunities o ON o.id = j.source_opportunity_id
       WHERE j.job_number = $1
       LIMIT 1`,
      [jobNumber]
    );

    if (jobRow.rows[0]) {
      const r = jobRow.rows[0];
      return res.json({
        ok: true,
        found: true,
        job: {
          job_number: r.job_number,
          job_uuid: r.servicem8_job_uuid,
          address: [r.address_line, r.suburb].filter(Boolean).join(', '),
          account_name: r.account_name,
          contact_name: r.contact_name,
          contact_phone: r.contact_phone,
          contact_email: r.contact_email,
          product_type: r.product_type || 'pre_purchase',
          description: r.description,
          opportunity_id: r.source_opportunity_id,
        },
      });
    }

    // Fallback: check opportunities by service_m8_job_id or just return not found
    return res.json({ ok: true, found: false, message: 'Job not found in CRM. Please verify job number.' });
  } catch (e) {
    console.error('[job-lookup]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// POST /api/inspections/pre-purchase
router.post('/pre-purchase', async (req, res) => {
  const body = req.body || {};
  try {
    const {
      job_number, job_uuid, opportunity_id, contact_phone,
      // Module data
      property_info, switchboard, safety_devices, wiring,
      circuits, solar_battery, assessment,
    } = body;

    // Run decision engine
    const findings = buildFindingsFromModules({ switchboard, safety_devices, wiring, circuits, solar_battery, assessment });
    const decision = runDecisionEngine(findings);

    // Override verdict with technician's manual verdict if provided
    const finalVerdict = assessment?.recommended_verdict || decision.verdict;
    const costLow = assessment?.cost_estimate_low ? Number(assessment.cost_estimate_low) : decision.cost_low;
    const costHigh = assessment?.cost_estimate_high ? Number(assessment.cost_estimate_high) : decision.cost_high;

    // Save to inspections table
    const r = await pool.query(
      `INSERT INTO pre_purchase_inspections
        (job_number, servicem8_job_uuid, opportunity_id, contact_phone,
         property_info, switchboard_data, safety_data, wiring_data,
         circuits_data, solar_battery_data, assessment_notes,
         verdict, risk_level, cost_low, cost_high,
         decision_engine_output, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,'submitted', NOW())
       RETURNING id`,
      [
        job_number || null,
        job_uuid || null,
        opportunity_id || null,
        contact_phone || null,
        JSON.stringify(property_info || {}),
        JSON.stringify(switchboard || {}),
        JSON.stringify(safety_devices || {}),
        JSON.stringify(wiring || {}),
        JSON.stringify(circuits || {}),
        JSON.stringify(solar_battery || {}),
        assessment?.technician_notes || null,
        finalVerdict,
        decision.risk_level,
        costLow,
        costHigh,
        JSON.stringify(decision),
      ]
    );
    const inspectionId = r.rows[0].id;

    // Update opportunity stage if linked
    if (opportunity_id) {
      await pool.query(
        `UPDATE opportunities SET stage = 'quote_sent', updated_at = NOW() WHERE id = $1 AND stage = 'site_visit_booked'`,
        [opportunity_id]
      );
    }

    // Trigger D+0 SMS to client
    if (contact_phone) {
      try {
        await sendSMS(contact_phone,
          `Hi, this is Better Home Technology. Your pre-purchase electrical inspection is complete. ` +
          `Your report will be ready within 24 hours. We'll send it to you as soon as it's ready. ` +
          `Questions? Call us on 0410 323 034.`
        );
        await pool.query(
          `INSERT INTO activities (contact_id, activity_type, summary, created_by, occurred_at)
           SELECT c.id, 'outbound_sms', 'D+0: Inspection complete notification sent', 'inspection-api', NOW()
           FROM contacts c WHERE c.phone ILIKE $1 LIMIT 1`,
          ['%' + contact_phone.replace(/\D/g, '').slice(-8) + '%']
        );
      } catch (smsErr) {
        console.warn('[pre-purchase] D+0 SMS failed:', smsErr.message);
      }
    }

    res.status(201).json({
      ok: true,
      inspection_id: inspectionId,
      verdict: finalVerdict,
      cost_low: costLow,
      cost_high: costHigh,
    });
  } catch (e) {
    console.error('[pre-purchase submit]', e);
    // Check if table doesn't exist yet
    if (/relation.*pre_purchase_inspections.*does not exist/i.test(e.message)) {
      return res.status(503).json({ ok: false, error: 'Database not ready. Run migration 044.' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/stats — status + verdict counts
router.get('/stats', async (req, res) => {
  try {
    const [statusR, verdictR] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS cnt FROM pre_purchase_inspections GROUP BY status`),
      pool.query(`SELECT verdict, COUNT(*) AS cnt FROM pre_purchase_inspections GROUP BY verdict`),
    ]);
    const byStatus  = {};
    statusR.rows.forEach(r => { byStatus[r.status] = Number(r.cnt); });
    const byVerdict = {};
    verdictR.rows.forEach(r => { byVerdict[r.verdict] = Number(r.cnt); });
    res.json({ ok: true, byStatus, byVerdict });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections — list (admin)
router.get('/', async (req, res) => {
  try {
    const { verdict, status, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    if (verdict) { params.push(verdict); conditions.push(`verdict = $${params.length}`); }
    if (status)  { params.push(status);  conditions.push(`status = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(Number(limit), Number(offset));
    const r = await pool.query(
      `SELECT id, job_number, verdict, risk_level, cost_low, cost_high, status, submitted_at, contact_phone
       FROM pre_purchase_inspections ${where}
       ORDER BY submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ ok: true, inspections: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/public/:id — client-facing sanitised report (CORS-open)
router.get('/public/:id', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  try {
    const r = await pool.query(
      `SELECT id, job_number, verdict, risk_level, cost_low, cost_high,
              property_info, switchboard_data, safety_data, wiring_data,
              circuits_data, solar_battery_data, assessment_notes,
              decision_engine_output, status, sent_at, submitted_at
       FROM pre_purchase_inspections WHERE id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Report not found' });
    const insp = r.rows[0];
    if (insp.status !== 'sent') {
      return res.status(403).json({ ok: false, error: 'Report not yet available. Please check back soon.' });
    }
    res.json({ ok: true, report: insp });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/:id
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM pre_purchase_inspections WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, inspection: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/inspections/:id/status — engineer approves, triggers report send
router.patch('/:id/status', async (req, res) => {
  const { status, engineer_notes } = req.body || {};
  const allowed = ['submitted', 'review', 'approved', 'sent'];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });

  try {
    const r = await pool.query(
      `UPDATE pre_purchase_inspections SET status = $1, engineer_notes = COALESCE($2, engineer_notes), updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [status, engineer_notes || null, req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });

    const insp = r.rows[0];

    // When approved → send D+0 report-ready SMS + update opportunity
    if (status === 'sent' && insp.contact_phone) {
      try {
        await sendSMS(insp.contact_phone,
          `Your electrical inspection report is ready! View it here: ${(process.env.REPORT_BASE_URL || 'https://pre-purchase.bhtechnology.com.au').replace(/\/$/, '')}/inspection-report.html?id=${insp.id} ` +
          `Verdict: Option ${insp.verdict}. Questions? Call 0410 323 034.`
        );
      } catch (smsErr) {
        console.warn('[status patch] report SMS failed:', smsErr.message);
      }
    }

    res.json({ ok: true, inspection: insp });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Map technician form data → findings array for decision engine
 */
function buildFindingsFromModules({ switchboard, safety_devices, wiring, circuits, solar_battery, assessment }) {
  const findings = [];

  // Switchboard
  if (switchboard?.type === 'fuseboard') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'switchboard', cost_low: 2800, cost_high: 4200, label: 'Original fuseboard — no RCD protection' });
  } else if (switchboard?.type === 'pre-1990s') {
    findings.push({ priority: 'PLAN', module: 'switchboard', cost_low: 1800, cost_high: 3000, label: 'Pre-1990s switchboard — limited capacity' });
  }
  if (switchboard?.overheating === 'yes') {
    findings.push({ priority: 'IMMEDIATE', module: 'switchboard', cost_low: 500, cost_high: 1500, label: 'Signs of overheating in switchboard' });
  }

  // Safety devices
  if (safety_devices?.rcd_test_result === 'fail') {
    findings.push({ priority: 'IMMEDIATE', module: 'safety', cost_low: 300, cost_high: 800, label: 'RCD test failed' });
  } else if (safety_devices?.rcd_test_result === 'none') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'safety', cost_low: 400, cost_high: 900, label: 'No RCD devices installed' });
  }
  if (safety_devices?.smoke_alarm_compliant === 'no') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'safety', cost_low: 200, cost_high: 500, label: 'Smoke alarms non-compliant' });
  }

  // Wiring
  if (wiring?.diy_modifications === 'significant') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'wiring', cost_low: 1500, cost_high: 4000, label: 'Significant DIY electrical modifications' });
  } else if (wiring?.diy_modifications === 'minor') {
    findings.push({ priority: 'PLAN', module: 'wiring', cost_low: 500, cost_high: 1500, label: 'Minor DIY modifications present' });
  }
  if (wiring?.damage_visible === 'significant') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'wiring', cost_low: 1000, cost_high: 3000, label: 'Significant wiring damage visible' });
  } else if (wiring?.damage_visible === 'minor') {
    findings.push({ priority: 'PLAN', module: 'wiring', cost_low: 400, cost_high: 1000, label: 'Minor wiring damage visible' });
  }
  if (wiring?.wiring_age === 'older') {
    findings.push({ priority: 'PLAN', module: 'wiring', cost_low: 800, cost_high: 1800, label: 'Older wiring — age-related wear' });
  }

  // Circuits
  if (circuits?.overloaded === 'confirmed') {
    findings.push({ priority: 'PRIORITY_ACTION', module: 'circuits', cost_low: 600, cost_high: 1500, label: 'Overloaded circuits confirmed' });
  } else if (circuits?.overloaded === 'suspected') {
    findings.push({ priority: 'PLAN', module: 'circuits', cost_low: 300, cost_high: 800, label: 'Suspected circuit overloading' });
  }

  // Add any manual findings from assessment
  if (assessment?.manual_findings && Array.isArray(assessment.manual_findings)) {
    findings.push(...assessment.manual_findings);
  }

  return findings;
}

module.exports = router;
