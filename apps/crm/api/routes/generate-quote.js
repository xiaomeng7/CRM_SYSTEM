/**
 * POST /api/generate-quote — build repair quote description and create a ServiceM8 job quote.
 * Does not create jobs or alter existing job services; quote is created via ServiceM8 API only (no CRM quotes row).
 */

const router = require('express').Router();
const { ServiceM8Client } = require('@bht/integrations');
const { pool } = require('../../lib/db');
const { computePricingStrategy } = require('../../services/pricingStrategy');

function logLine(event, extra = {}) {
  console.log('[generate-quote]', JSON.stringify({ ts: new Date().toISOString(), event, ...extra }));
}

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function findPrePurchaseInspection(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;
  if (isValidUuid(id)) {
    const byPk = await pool.query(
      `SELECT id, job_number, servicem8_job_uuid, opportunity_id, verdict
       FROM pre_purchase_inspections WHERE id = $1::uuid LIMIT 1`,
      [id]
    );
    if (byPk.rows[0]) return byPk.rows[0];
  }
  const byReview = await pool.query(
    `SELECT id, job_number, servicem8_job_uuid, opportunity_id, verdict
     FROM pre_purchase_inspections WHERE review_inspection_id = $1 LIMIT 1`,
    [id]
  );
  return byReview.rows[0] || null;
}

function formatMoney(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-AU')}`;
}

function formatFinalPriceAud(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '$0.00';
  return `$${n.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * @param {unknown} repairItems
 * @param {unknown} customer
 * @param {{ final_price: number }} pricing
 */
function buildDescription(repairItems, customer, pricing) {
  const fp = pricing && typeof pricing.final_price === 'number' ? pricing.final_price : 0;
  const recLine = `Recommended Package: ${formatFinalPriceAud(fp)}`;
  let d = `${recLine}\n${'='.repeat(Math.min(recLine.length, 72))}\n\nElectrical Repair Quote\n\n`;
  const items = Array.isArray(repairItems) ? repairItems : [];
  for (const it of items) {
    const title = it && it.title != null ? String(it.title).trim() : 'Item';
    const low = it && it.estimated_cost_low != null ? Number(it.estimated_cost_low) : NaN;
    const high = it && it.estimated_cost_high != null ? Number(it.estimated_cost_high) : NaN;
    const lowOk = Number.isFinite(low);
    const highOk = Number.isFinite(high);
    const est =
      lowOk && highOk ? `${formatMoney(low)} - ${formatMoney(high)}` : lowOk ? formatMoney(low) : highOk ? formatMoney(high) : '—';
    d += `- ${title}\n`;
    d += `Estimated: ${est}\n\n`;
  }
  if (customer && typeof customer === 'object') {
    const name = customer.name != null ? String(customer.name).trim() : '';
    const email = customer.email != null ? String(customer.email).trim() : '';
    const phone = customer.phone != null ? String(customer.phone).trim() : '';
    const bits = [name && `Name: ${name}`, email && `Email: ${email}`, phone && `Phone: ${phone}`].filter(Boolean);
    if (bits.length) d += `${bits.join('\n')}\n`;
  }
  return d.trimEnd().slice(0, 8000);
}

function sumRepairTotal(repairItems) {
  const items = Array.isArray(repairItems) ? repairItems : [];
  let t = 0;
  for (const it of items) {
    const low = Number(it && it.estimated_cost_low);
    const high = Number(it && it.estimated_cost_high);
    if (Number.isFinite(low) && Number.isFinite(high)) t += (low + high) / 2;
    else if (Number.isFinite(high)) t += high;
    else if (Number.isFinite(low)) t += low;
  }
  return Math.round(t * 100) / 100;
}

async function resolveJobUuid(insp, body) {
  const override = String(body.job_uuid || body.servicem8_job_uuid || '').trim();
  if (override) return override;
  if (insp.servicem8_job_uuid) return String(insp.servicem8_job_uuid);
  if (insp.opportunity_id && isValidUuid(String(insp.opportunity_id))) {
    const r = await pool.query(`SELECT service_m8_job_id FROM opportunities WHERE id = $1::uuid LIMIT 1`, [
      insp.opportunity_id,
    ]);
    if (r.rows[0]?.service_m8_job_id) return String(r.rows[0].service_m8_job_id);
  }
  if (insp.job_number) {
    const r = await pool.query(`SELECT servicem8_job_uuid FROM jobs WHERE job_number = $1 LIMIT 1`, [
      String(insp.job_number).trim(),
    ]);
    if (r.rows[0]?.servicem8_job_uuid) return String(r.rows[0].servicem8_job_uuid);
  }
  return null;
}

async function resolveLeadScore(insp, body) {
  if (body.lead_score != null && String(body.lead_score).trim() !== '') {
    const n = Number(body.lead_score);
    if (Number.isFinite(n)) return n;
  }
  if (!insp.opportunity_id || !isValidUuid(String(insp.opportunity_id))) return undefined;
  try {
    const r = await pool.query(
      `SELECT (sc.j->>'score')::numeric AS score
       FROM opportunities o
       LEFT JOIN leads l ON l.id = o.lead_id
       LEFT JOIN LATERAL (
         SELECT to_jsonb(ls) AS j
         FROM lead_scores ls
         WHERE ls.lead_id = l.id
         ORDER BY COALESCE(ls.scored_at, ls.created_at) DESC NULLS LAST, ls.id DESC
         LIMIT 1
       ) sc ON TRUE
       WHERE o.id = $1::uuid`,
      [insp.opportunity_id]
    );
    const s = r.rows[0]?.score;
    return s != null && Number.isFinite(Number(s)) ? Number(s) : undefined;
  } catch {
    return undefined;
  }
}

function calculatePricing(repair_items, inspection, lead_score) {
  return computePricingStrategy({ repair_items, inspection, lead_score });
}

router.post('/', async (req, res) => {
  const body = req.body || {};
  const inspection_id = body.inspection_id != null ? String(body.inspection_id).trim() : '';
  const repair_items = Array.isArray(body.repair_items) ? body.repair_items : [];
  const customer = body.customer;

  logLine('request', {
    inspection_id,
    repair_items_count: repair_items.length,
    has_customer: !!customer,
    ip: req.ip,
  });

  if (!inspection_id) {
    logLine('validation_error', { reason: 'missing_inspection_id' });
    return res.status(400).json({ ok: false, error: 'inspection_id is required' });
  }

  try {
    const insp = await findPrePurchaseInspection(inspection_id);
    if (!insp) {
      logLine('not_found', { inspection_id });
      return res.status(404).json({ ok: false, error: 'Inspection not found' });
    }

    const jobUuid = await resolveJobUuid(insp, body);
    if (!jobUuid) {
      logLine('missing_job_uuid', { inspection_id: String(insp.id) });
      return res.status(422).json({
        ok: false,
        error:
          'No ServiceM8 job linked to this inspection. Pass job_uuid (or servicem8_job_uuid) in the body, or link job_number / opportunity job in CRM.',
      });
    }

    const lead_score = await resolveLeadScore(insp, body);
    const pricing = calculatePricing(repair_items, insp, lead_score);
    const description = buildDescription(repair_items, customer, pricing);
    const total = pricing.final_price > 0 ? pricing.final_price : sumRepairTotal(repair_items);

    const client = new ServiceM8Client();
    const created = await client.createQuote(jobUuid, {
      amount: total > 0 ? total : 0,
      description,
      note: description,
      status: 'Quote',
    });

    logLine('created', {
      inspection_id: String(insp.id),
      job_uuid: jobUuid,
      quote_uuid: created.uuid,
      accept_url: created.accept_url || null,
      final_price: pricing.final_price,
      pricing_tier: pricing.pricing_tier,
    });

    return res.status(201).json({
      ok: true,
      quote_id: created.uuid,
      servicem8_quote_uuid: created.uuid,
      accept_url: created.accept_url || null,
      job_uuid: jobUuid,
      pricing,
    });
  } catch (e) {
    const msg = e && e.message ? e.message : String(e);
    logLine('error', { message: msg });
    const isNetwork = /timeout|ECONNRESET|ETIMEDOUT|network/i.test(msg);
    return res.status(isNetwork ? 502 : 500).json({ ok: false, error: msg });
  }
});

module.exports = router;
