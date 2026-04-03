/**
 * Inspections API — Pre-Purchase + Rental
 * GET  /api/inspections/job-lookup?job_number=XXX&product=rental  — technician job lookup
 * POST /api/inspections/pre-purchase               — submit pre-purchase technician form
 * POST /api/inspections/rental                     — submit rental technician form
 * POST /api/inspections/:id/invoice                — generate Stripe invoice
 * GET  /api/inspections/rental-list                — list rental inspections (admin)
 * GET  /api/inspections                            — list pre-purchase inspections (admin)
 * GET  /api/inspections/public/:id                 — client report (CORS-open, pre-purchase)
 * GET  /api/inspections/rental-public/:id          — client report (CORS-open, rental)
 * PATCH /api/inspections/:id/status                — update pre-purchase status
 * PATCH /api/inspections/rental/:id/status         — update rental status
 */

const router = require('express').Router();
const { pool } = require('../../lib/db');
const { runDecisionEngine } = require('../../services/pre-purchase-decision-engine');
const { sendSMS } = require('@bht/integrations');

// ─── HELPERS ────────────────────────────────────────────────────────────────

function generateInvoiceNumber(prefix) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `${prefix}-${y}${m}-${rand}`;
}

async function createStripeCheckoutSession({ amountCents, description, customerEmail, customerName, successUrl, cancelUrl, metadata }) {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error('STRIPE_SECRET_KEY not configured');

  const body = new URLSearchParams();
  body.set('mode', 'payment');
  body.set('success_url', successUrl);
  body.set('cancel_url', cancelUrl);
  body.set('line_items[0][price_data][currency]', 'aud');
  body.set('line_items[0][price_data][unit_amount]', String(amountCents));
  body.set('line_items[0][price_data][product_data][name]', description);
  body.set('line_items[0][quantity]', '1');
  if (customerEmail) body.set('customer_email', customerEmail);
  if (metadata) {
    Object.entries(metadata).forEach(([k, v]) => body.set(`metadata[${k}]`, String(v)));
  }

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${stripeKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(data.error?.message || 'Stripe error');
  return data; // { id, url, ... }
}

// ─── RENTAL DECISION ENGINE ──────────────────────────────────────────────────

function runRentalDecisionEngine({ safety_switches, smoke_alarms, switchboard, outlets_lighting, hot_water, general_findings }) {
  const riskItems = [];
  const advisoryItems = [];

  // Safety switches (RCDs) — mandatory in QLD/SA/WA/VIC
  if (safety_switches?.test_result === 'fail') {
    riskItems.push({ label: 'RCD safety switch failed test — must rectify immediately', priority: 'FAIL' });
  } else if (safety_switches?.installed === 'none') {
    riskItems.push({ label: 'No RCD safety switches installed — non-compliant', priority: 'FAIL' });
  } else if (safety_switches?.installed === 'partial') {
    advisoryItems.push({ label: 'Partial RCD coverage — recommend additional protection', priority: 'ADVISORY' });
  }

  // Smoke alarms
  if (smoke_alarms?.compliant === 'no') {
    riskItems.push({ label: 'Smoke alarms non-compliant with current legislation', priority: 'FAIL' });
  } else if (smoke_alarms?.compliant === 'partial') {
    advisoryItems.push({ label: 'Smoke alarm coverage incomplete — recommend upgrading', priority: 'ADVISORY' });
  }

  // Switchboard
  if (switchboard?.condition === 'dangerous') {
    riskItems.push({ label: 'Switchboard in dangerous condition — immediate repair required', priority: 'FAIL' });
  } else if (switchboard?.type === 'fuseboard') {
    advisoryItems.push({ label: 'Old fuseboard — recommend upgrade to circuit breakers with RCD', priority: 'ADVISORY' });
  } else if (switchboard?.condition === 'poor') {
    advisoryItems.push({ label: 'Switchboard condition poor — recommend inspection and servicing', priority: 'ADVISORY' });
  }

  // Outlets and lighting
  if (outlets_lighting?.damaged_outlets === 'yes') {
    advisoryItems.push({ label: 'Damaged power points found — recommend replacement', priority: 'ADVISORY' });
  }
  if (outlets_lighting?.flickering_lights === 'yes') {
    advisoryItems.push({ label: 'Flickering lights reported — possible wiring fault', priority: 'ADVISORY' });
  }

  // Hot water
  if (hot_water?.condition === 'fault') {
    advisoryItems.push({ label: 'Hot water system fault detected — recommend service or replacement', priority: 'ADVISORY' });
  }

  // Determine verdict
  let verdict;
  if (riskItems.length > 0) {
    verdict = 'FAIL';
  } else if (advisoryItems.length > 0) {
    verdict = 'ADVISORY';
  } else {
    verdict = 'PASS';
  }

  return { verdict, riskItems, advisoryItems };
}

// GET /api/inspections/job-lookup?job_number=XXX
router.get('/job-lookup', async (req, res) => {
  const jobNumber = String(req.query.job_number || '').trim();
  if (!jobNumber) return res.status(400).json({ ok: false, error: 'job_number required' });

  try {
    // Look up job in CRM jobs table first
    const jobRow = await pool.query(
      `SELECT j.id, j.job_number, j.servicem8_job_uuid, j.description, j.address_line, j.suburb,
              j.status,
              a.name AS account_name, a.postcode,
              c.name AS contact_name, c.phone AS contact_phone, c.email AS contact_email
       FROM jobs j
       LEFT JOIN accounts a ON a.id = j.account_id
       LEFT JOIN contacts c ON c.id = j.contact_id
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
          job_number:    r.job_number,
          job_uuid:      r.servicem8_job_uuid,
          address:       [r.address_line, r.suburb].filter(Boolean).join(', '),
          account_name:  r.account_name,
          contact_name:  r.contact_name,
          contact_phone: r.contact_phone,
          contact_email: r.contact_email,
          product_type:  'pre_purchase',
          description:   r.description,
        },
      });
    }

    // Also try ServiceM8 UUID match
    const uuidRow = await pool.query(
      `SELECT j.job_number, j.servicem8_job_uuid, j.address_line, j.suburb,
              a.name AS account_name, c.name AS contact_name, c.phone AS contact_phone
       FROM jobs j
       LEFT JOIN accounts a ON a.id = j.account_id
       LEFT JOIN contacts c ON c.id = j.contact_id
       WHERE j.servicem8_job_uuid = $1 LIMIT 1`,
      [jobNumber]
    );
    if (uuidRow.rows[0]) {
      const r = uuidRow.rows[0];
      return res.json({
        ok: true, found: true,
        job: {
          job_number:    r.job_number || jobNumber,
          address:       [r.address_line, r.suburb].filter(Boolean).join(', '),
          account_name:  r.account_name,
          contact_name:  r.contact_name,
          contact_phone: r.contact_phone,
          product_type:  'pre_purchase',
        },
      });
    }

    return res.json({ ok: true, found: false, message: 'Job not found in CRM. You can still proceed and enter details manually.' });
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

// ─── POST /api/inspections/:id/invoice ──────────────────────────────────────
// Works for both pre_purchase and rental (query param: ?product=rental)
router.post('/:id/invoice', async (req, res) => {
  const { id } = req.params;
  const productType = req.query.product === 'rental' ? 'rental' : 'pre_purchase';
  const { amount_cents, contact_email, contact_name, description } = req.body || {};

  if (!amount_cents || amount_cents < 100) {
    return res.status(400).json({ ok: false, error: 'amount_cents required (min 100)' });
  }

  const table = productType === 'rental' ? 'rental_inspections' : 'pre_purchase_inspections';
  const invoicePrefix = productType === 'rental' ? 'RI' : 'PP';
  const productLabel = productType === 'rental' ? 'Rental Electrical Safety Inspection' : 'Pre-Purchase Electrical Inspection';

  try {
    // Fetch inspection record
    const inspR = await pool.query(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    if (!inspR.rows[0]) return res.status(404).json({ ok: false, error: 'Inspection not found' });
    const insp = inspR.rows[0];

    // Generate invoice number
    const invoiceNumber = generateInvoiceNumber(invoicePrefix);
    const invoiceDesc = description || `${productLabel} — ${insp.job_number || id.slice(0, 8)}`;

    const baseUrl = process.env.REPORT_BASE_URL || 'https://pre-purchase.bhtechnology.com.au';
    const successUrl = `${baseUrl}/payment-success.html?inv=${invoiceNumber}`;
    const cancelUrl  = `${baseUrl}/payment-cancel.html`;

    // Create Stripe checkout session
    const session = await createStripeCheckoutSession({
      amountCents: Number(amount_cents),
      description: invoiceDesc,
      customerEmail: contact_email || insp.contact_email || undefined,
      customerName: contact_name || insp.contact_name || undefined,
      successUrl,
      cancelUrl,
      metadata: { invoice_number: invoiceNumber, inspection_id: id, product_type: productType },
    });

    // Save invoice to DB
    await pool.query(
      `INSERT INTO inspection_invoices
        (invoice_number, product_type, inspection_id, contact_phone, contact_email, contact_name,
         amount_cents, description, status, payment_session_id, payment_link_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,$10)`,
      [
        invoiceNumber, productType, id,
        insp.contact_phone || null,
        contact_email || insp.contact_email || null,
        contact_name || insp.contact_name || null,
        Number(amount_cents),
        invoiceDesc,
        session.id,
        session.url,
      ]
    );

    // Update inspection record with invoice info
    await pool.query(
      `UPDATE ${table} SET invoice_number=$1, invoice_amount_cents=$2, invoice_status='pending',
       payment_session_id=$3, payment_link_url=$4, updated_at=NOW() WHERE id=$5`,
      [invoiceNumber, Number(amount_cents), session.id, session.url, id]
    );

    // SMS payment link to client phone if available
    const phone = insp.contact_phone;
    if (phone) {
      try {
        const dollars = (Number(amount_cents) / 100).toFixed(2);
        await sendSMS(phone,
          `Hi from Better Home Technology! Your inspection invoice is ready. Amount: $${dollars} AUD. ` +
          `Pay securely online: ${session.url} Invoice #${invoiceNumber}. Questions? Call 0410 323 034.`
        );
      } catch (smsErr) {
        console.warn('[invoice] SMS failed:', smsErr.message);
      }
    }

    res.json({ ok: true, invoice_number: invoiceNumber, payment_url: session.url, session_id: session.id });
  } catch (e) {
    console.error('[invoice]', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── POST /api/inspections/rental ───────────────────────────────────────────
router.post('/rental', async (req, res) => {
  const body = req.body || {};
  const {
    job_number, job_uuid, opportunity_id,
    contact_phone, contact_email, contact_name, agency_name,
    property_info, safety_switches, smoke_alarms,
    switchboard, outlets_lighting, hot_water, general_findings,
  } = body;

  try {
    const decision = runRentalDecisionEngine({ safety_switches, smoke_alarms, switchboard, outlets_lighting, hot_water, general_findings });
    const finalVerdict = general_findings?.technician_verdict || decision.verdict;

    const r = await pool.query(
      `INSERT INTO rental_inspections
        (job_number, servicem8_job_uuid, opportunity_id,
         contact_phone, contact_email, contact_name, agency_name,
         property_info, safety_switches, smoke_alarms, switchboard,
         outlets_lighting, hot_water, general_findings,
         verdict, risk_items, advisory_items, status, submitted_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'submitted',NOW())
       RETURNING id`,
      [
        job_number || null, job_uuid || null, opportunity_id || null,
        contact_phone || null, contact_email || null, contact_name || null, agency_name || null,
        JSON.stringify(property_info || {}),
        JSON.stringify(safety_switches || {}),
        JSON.stringify(smoke_alarms || {}),
        JSON.stringify(switchboard || {}),
        JSON.stringify(outlets_lighting || {}),
        JSON.stringify(hot_water || {}),
        JSON.stringify(general_findings || {}),
        finalVerdict,
        JSON.stringify(decision.riskItems),
        JSON.stringify(decision.advisoryItems),
      ]
    );
    const inspectionId = r.rows[0].id;

    // D+0 SMS
    if (contact_phone) {
      try {
        await sendSMS(contact_phone,
          `Hi${contact_name ? ' ' + contact_name.split(' ')[0] : ''}, this is Better Home Technology. ` +
          `Your rental electrical safety inspection is complete. ` +
          `Your report will be ready shortly. Questions? Call 0410 323 034.`
        );
      } catch (smsErr) {
        console.warn('[rental] D+0 SMS failed:', smsErr.message);
      }
    }

    res.status(201).json({ ok: true, inspection_id: inspectionId, verdict: finalVerdict });
  } catch (e) {
    console.error('[rental submit]', e);
    if (/relation.*rental_inspections.*does not exist/i.test(e.message)) {
      return res.status(503).json({ ok: false, error: 'Database not ready. Run migration 046.' });
    }
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/rental-list
router.get('/rental-list', async (req, res) => {
  try {
    const { verdict, status, limit = 50, offset = 0 } = req.query;
    const conditions = [];
    const params = [];
    if (verdict) { params.push(verdict); conditions.push(`verdict = $${params.length}`); }
    if (status)  { params.push(status);  conditions.push(`status = $${params.length}`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    params.push(Number(limit), Number(offset));
    const r = await pool.query(
      `SELECT id, job_number, contact_name, agency_name, verdict, status, invoice_status,
              submitted_at, contact_phone
       FROM rental_inspections ${where}
       ORDER BY submitted_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    res.json({ ok: true, inspections: r.rows });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/rental-public/:id — client-facing (CORS-open)
router.get('/rental-public/:id', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET');
  try {
    const r = await pool.query(
      `SELECT id, job_number, contact_name, agency_name, verdict, risk_items, advisory_items,
              property_info, general_findings, status, sent_at, submitted_at
       FROM rental_inspections WHERE id = $1`,
      [req.params.id]
    );
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Report not found' });
    if (r.rows[0].status !== 'sent') {
      return res.status(403).json({ ok: false, error: 'Report not yet available. Please check back soon.' });
    }
    res.json({ ok: true, report: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/rental/:id
router.get('/rental/:id', async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM rental_inspections WHERE id = $1', [req.params.id]);
    if (!r.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    res.json({ ok: true, inspection: r.rows[0] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /api/inspections/rental/:id/status
router.patch('/rental/:id/status', async (req, res) => {
  const { status, engineer_notes } = req.body || {};
  const allowed = ['submitted', 'review', 'approved', 'sent'];
  if (!allowed.includes(status)) return res.status(400).json({ ok: false, error: 'Invalid status' });
  try {
    const upd = await pool.query(
      `UPDATE rental_inspections SET status=$1, engineer_notes=COALESCE($2, engineer_notes),
       sent_at=CASE WHEN $1='sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
       updated_at=NOW() WHERE id=$3 RETURNING *`,
      [status, engineer_notes || null, req.params.id]
    );
    if (!upd.rows[0]) return res.status(404).json({ ok: false, error: 'Not found' });
    const insp = upd.rows[0];

    if (status === 'sent' && insp.contact_phone) {
      try {
        const baseUrl = process.env.REPORT_BASE_URL || 'https://pre-purchase.bhtechnology.com.au';
        await sendSMS(insp.contact_phone,
          `Hi${insp.contact_name ? ' ' + insp.contact_name.split(' ')[0] : ''}, your rental inspection report is ready! ` +
          `Result: ${insp.verdict}. View it here: ${baseUrl}/rental-report.html?id=${insp.id} ` +
          `Questions? Call 0410 323 034.`
        );
      } catch (smsErr) {
        console.warn('[rental status] SMS failed:', smsErr.message);
      }
    }
    res.json({ ok: true, inspection: insp });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// GET /api/inspections/stats — combined stats for both product types
router.get('/stats', async (req, res) => {
  try {
    const [ppStatus, ppVerdict, rentalVerdict, rentalStatus] = await Promise.all([
      pool.query(`SELECT status, COUNT(*) AS cnt FROM pre_purchase_inspections GROUP BY status`),
      pool.query(`SELECT verdict, COUNT(*) AS cnt FROM pre_purchase_inspections GROUP BY verdict`),
      pool.query(`SELECT verdict, COUNT(*) AS cnt FROM rental_inspections GROUP BY verdict`),
      pool.query(`SELECT status, COUNT(*) AS cnt FROM rental_inspections GROUP BY status`),
    ]);
    const ppByStatus = {}; ppStatus.rows.forEach(r => { ppByStatus[r.status] = Number(r.cnt); });
    const ppByVerdict = {}; ppVerdict.rows.forEach(r => { ppByVerdict[r.verdict] = Number(r.cnt); });
    const rentalByVerdict = {}; rentalVerdict.rows.forEach(r => { rentalByVerdict[r.verdict] = Number(r.cnt); });
    const rentalByStatus = {}; rentalStatus.rows.forEach(r => { rentalByStatus[r.status] = Number(r.cnt); });
    res.json({ ok: true,
      pre_purchase: { byStatus: ppByStatus, byVerdict: ppByVerdict },
      rental: { byStatus: rentalByStatus, byVerdict: rentalByVerdict },
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ─── PRE-PURCHASE routes (existing) — unchanged below ────────────────────────

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
