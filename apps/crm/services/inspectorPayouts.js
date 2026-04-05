/**
 * Inspector referral payouts V1: fixed fee per paid invoice by product_line.
 * Paid semantics match inspectorPerformance + PAID_INVOICE_SQL.
 */

const { pool } = require('../lib/db');
const { PAID_INVOICE_SQL } = require('./inspectorPerformance');

const FEE_AUD_BY_LINE = {
  pre_purchase: 50,
  rental: 30,
  energy: 80,
};

const VALID_STATUS = new Set(['draft', 'approved', 'paid']);

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

/** YYYY-MM-DD inclusive in Adelaide calendar; payment_ts must fall in [start 00:00, end+1 00:00) Adelaide. */
function parseInclusivePeriod(periodStart, periodEnd) {
  const a = String(periodStart || '').trim();
  const b = String(periodEnd || '').trim();
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(a) || !re.test(b)) throw new Error('period_start and period_end must be YYYY-MM-DD');
  if (a > b) throw new Error('period_start must be on or before period_end');
  return { period_start: a, period_end: b };
}

function pgDateOnlyYmd(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v.slice(0, 10);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}

async function getAdelaideMonthBounds(db = pool) {
  const r = await db.query(`
    SELECT
      (DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')))::date AS period_start,
      ((DATE_TRUNC('month', (CURRENT_TIMESTAMP AT TIME ZONE 'Australia/Adelaide')) + INTERVAL '1 month - 1 day'))::date AS period_end
  `);
  const row = r.rows[0];
  return {
    period_start: pgDateOnlyYmd(row.period_start),
    period_end: pgDateOnlyYmd(row.period_end),
  };
}

const PRODUCT_LINE_CASE = `
  CASE
    WHEN LOWER(TRIM(COALESCE(o.product_type, l.product_type, l.service_type, ''))) IN ('pre_purchase') THEN 'pre_purchase'
    WHEN LOWER(TRIM(COALESCE(o.product_type, l.product_type, l.service_type, ''))) IN ('rental_lite', 'rental') THEN 'rental'
    ELSE 'energy'
  END
`;

/**
 * Eligible paid invoices for inspector channel in [period_start, period_end] Adelaide inclusive, excluding already allocated.
 */
async function fetchEligibleInvoiceRows(client, sourceCode, periodStart, periodEnd) {
  const code = String(sourceCode || '').trim().toLowerCase();
  const q = `
    SELECT i.id AS invoice_id, ${PRODUCT_LINE_CASE} AS product_line
    FROM invoices i
    INNER JOIN opportunities o ON o.id = i.opportunity_id
    INNER JOIN leads l ON l.id = o.lead_id
    WHERE l.source = 'inspector'
      AND LOWER(TRIM(COALESCE(l.sub_source, ''))) = $1
      AND ${PAID_INVOICE_SQL}
      AND COALESCE(i.paid_at, i.updated_at) >= ($2::date AT TIME ZONE 'Australia/Adelaide')
      AND COALESCE(i.paid_at, i.updated_at) < (($3::date + INTERVAL '1 day') AT TIME ZONE 'Australia/Adelaide')
      AND NOT EXISTS (
        SELECT 1 FROM inspector_payout_invoice_lines pil WHERE pil.invoice_id = i.id
      )
  `;
  const r = await client.query(q, [code, periodStart, periodEnd]);
  return r.rows;
}

function aggregateByLine(rows) {
  const by = { pre_purchase: [], rental: [], energy: [] };
  for (const row of rows) {
    const line = row.product_line;
    if (!by[line]) continue;
    by[line].push(row.invoice_id);
  }
  return by;
}

function previewFromRows(rows) {
  const by = aggregateByLine(rows);
  let totalFee = 0;
  let totalCount = 0;
  const by_line = {};
  for (const line of Object.keys(FEE_AUD_BY_LINE)) {
    const ids = by[line] || [];
    const n = ids.length;
    const fee = FEE_AUD_BY_LINE[line];
    const subtotal = n * fee;
    totalCount += n;
    totalFee += subtotal;
    by_line[line] = { count: n, fee_per_order_aud: fee, subtotal_aud: subtotal };
  }
  return { by_line, total_eligible_invoices: totalCount, total_referral_fee_aud: totalFee };
}

/**
 * Preview for period (default: current Adelaide calendar month if dates omitted).
 */
async function getPayoutPreview(inspectorId, periodStart, periodEnd, db = pool) {
  if (!isUuid(inspectorId)) throw new Error('Invalid inspector id');
  const insp = await db.query(`SELECT id, source_code FROM inspectors WHERE id = $1::uuid LIMIT 1`, [inspectorId]);
  const row = insp.rows[0];
  if (!row) return null;

  let ps = periodStart;
  let pe = periodEnd;
  if (!ps || !pe) {
    const b = await getAdelaideMonthBounds(db);
    ps = b.period_start;
    pe = b.period_end;
  } else {
    ({ period_start: ps, period_end: pe } = parseInclusivePeriod(ps, pe));
  }

  const invRows = await fetchEligibleInvoiceRows(db, row.source_code, ps, pe);
  const preview = previewFromRows(invRows);
  return {
    inspector_id: inspectorId,
    source_code: row.source_code,
    period_start: ps,
    period_end: pe,
    ...preview,
  };
}

async function listPayoutsForInspector(inspectorId, db = pool) {
  if (!isUuid(inspectorId)) throw new Error('Invalid inspector id');
  const r = await db.query(
    `SELECT id, inspector_id, period_start, period_end, product_line, paid_orders_count, payout_amount_aud,
            status, notes, source_snapshot, created_at, updated_at
     FROM inspector_payouts
     WHERE inspector_id = $1::uuid
     ORDER BY period_start DESC, product_line ASC, created_at DESC`,
    [inspectorId]
  );
  return r.rows;
}

async function generatePayout(inspectorId, periodStart, periodEnd, db = pool) {
  if (!isUuid(inspectorId)) throw new Error('Invalid inspector id');
  const { period_start, period_end } = parseInclusivePeriod(periodStart, periodEnd);

  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const insp = await client.query(`SELECT id, source_code FROM inspectors WHERE id = $1::uuid LIMIT 1`, [inspectorId]);
    if (!insp.rows[0]) {
      await client.query('ROLLBACK');
      return { ok: false, error: 'Inspector not found' };
    }
    const { source_code } = insp.rows[0];

    const invRows = await fetchEligibleInvoiceRows(client, source_code, period_start, period_end);
    const by = aggregateByLine(invRows);
    const created = [];
    const allInvoiceIds = [];

    for (const line of ['pre_purchase', 'rental', 'energy']) {
      const ids = by[line];
      if (!ids.length) continue;

      const count = ids.length;
      const amount = count * FEE_AUD_BY_LINE[line];
      const snapshot = {
        fee_version: 'v1_fixed',
        fee_aud_by_line: FEE_AUD_BY_LINE,
        invoice_ids: ids,
        source_code,
      };

      const ins = await client.query(
        `INSERT INTO inspector_payouts
          (inspector_id, period_start, period_end, product_line, paid_orders_count, payout_amount_aud, status, source_snapshot)
         VALUES ($1::uuid, $2::date, $3::date, $4, $5, $6, 'draft', $7::jsonb)
         RETURNING id, inspector_id, period_start, period_end, product_line, paid_orders_count, payout_amount_aud, status, notes, created_at`,
        [inspectorId, period_start, period_end, line, count, amount, JSON.stringify(snapshot)]
      );
      const payout = ins.rows[0];

      for (const invoiceId of ids) {
        await client.query(
          `INSERT INTO inspector_payout_invoice_lines (payout_id, invoice_id, product_line) VALUES ($1::uuid, $2::uuid, $3)`,
          [payout.id, invoiceId, line]
        );
      }

      allInvoiceIds.push(...ids);
      created.push(payout);
    }

    await client.query('COMMIT');
    return { ok: true, payouts: created, invoice_ids: allInvoiceIds };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updatePayout(payoutId, body = {}, db = pool) {
  if (!isUuid(payoutId)) throw new Error('Invalid payout id');
  const patches = [];
  const vals = [];
  let i = 1;

  if (body.status != null) {
    const st = String(body.status).trim().toLowerCase();
    if (!VALID_STATUS.has(st)) throw new Error('Invalid status');
    patches.push(`status = $${i++}`);
    vals.push(st);
  }
  if (body.notes !== undefined) {
    patches.push(`notes = $${i++}`);
    vals.push(String(body.notes || '').trim() || null);
  }
  if (!patches.length) {
    const r = await db.query(`SELECT * FROM inspector_payouts WHERE id = $1::uuid LIMIT 1`, [payoutId]);
    return r.rows[0] || null;
  }

  patches.push('updated_at = NOW()');
  vals.push(payoutId);
  const r = await db.query(
    `UPDATE inspector_payouts SET ${patches.join(', ')} WHERE id = $${i}::uuid
     RETURNING id, inspector_id, period_start, period_end, product_line, paid_orders_count, payout_amount_aud, status, notes, source_snapshot, created_at, updated_at`,
    vals
  );
  return r.rows[0] || null;
}

/**
 * Settlement statement: payout header + one row per allocated invoice.
 * customer_name: contact on lead first, else account name (opportunity/account/lead).
 */
async function getPayoutStatement(payoutId, db = pool) {
  if (!isUuid(payoutId)) throw new Error('Invalid payout id');

  const head = await db.query(
    `SELECT p.id AS payout_id, p.inspector_id, p.period_start, p.period_end, p.product_line,
            p.paid_orders_count, p.payout_amount_aud, p.status, p.notes, p.created_at, p.updated_at,
            i.name AS inspector_name, i.company_name AS inspector_company, i.source_code AS inspector_source_code,
            i.email AS inspector_email, i.phone AS inspector_phone
     FROM inspector_payouts p
     INNER JOIN inspectors i ON i.id = p.inspector_id
     WHERE p.id = $1::uuid
     LIMIT 1`,
    [payoutId]
  );
  const h = head.rows[0];
  if (!h) return null;

  const lines = await db.query(
    `SELECT
       i.id AS invoice_id,
       TRIM(COALESCE(NULLIF(TRIM(c.name), ''), NULLIF(TRIM(acc.name), ''), 'Unknown')) AS customer_name,
       COALESCE(i.amount_paid, i.amount, 0)::numeric AS amount_paid,
       COALESCE(i.paid_at, i.updated_at) AS paid_at,
       pil.product_line
     FROM inspector_payout_invoice_lines pil
     INNER JOIN invoices i ON i.id = pil.invoice_id
     INNER JOIN opportunities o ON o.id = i.opportunity_id
     LEFT JOIN leads l ON l.id = o.lead_id
     LEFT JOIN contacts c ON c.id = l.contact_id
     LEFT JOIN accounts acc ON acc.id = COALESCE(l.account_id, o.account_id)
     WHERE pil.payout_id = $1::uuid
     ORDER BY COALESCE(i.paid_at, i.updated_at) ASC NULLS LAST, i.id ASC`,
    [payoutId]
  );

  const invoice_lines = lines.rows.map((row) => ({
    invoice_id: row.invoice_id,
    customer_name: row.customer_name || 'Unknown',
    amount_paid: Number(row.amount_paid ?? 0),
    paid_at: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    product_line: row.product_line,
  }));

  return {
    payout_id: h.payout_id,
    inspector: {
      id: h.inspector_id,
      name: h.inspector_name,
      company_name: h.inspector_company,
      source_code: h.inspector_source_code,
      email: h.inspector_email,
      phone: h.inspector_phone,
    },
    period_start: pgDateOnlyYmd(h.period_start),
    period_end: pgDateOnlyYmd(h.period_end),
    product_line: h.product_line,
    paid_orders_count: Number(h.paid_orders_count ?? 0),
    payout_amount_aud: Number(h.payout_amount_aud ?? 0),
    status: h.status,
    notes: h.notes,
    invoice_lines,
  };
}

function csvEscape(val) {
  if (val == null) return '';
  const s = String(val);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** CSV for payout invoice lines (+ header row). UTF-8 with BOM for Excel. */
async function getPayoutExportCsv(payoutId, db = pool) {
  const stmt = await getPayoutStatement(payoutId, db);
  if (!stmt) return null;

  const rows = [];
  const hdr = [
    'invoice_id',
    'customer_name',
    'paid_at',
    'amount_paid',
    'product_line',
    'referral_fee_aud',
    'payout_id',
    'inspector_source_code',
    'period_start',
    'period_end',
  ];
  rows.push(hdr.map(csvEscape).join(','));

  const feeEach = Number(FEE_AUD_BY_LINE[stmt.product_line] ?? 0);
  for (const line of stmt.invoice_lines) {
    rows.push(
      [
        line.invoice_id,
        line.customer_name,
        line.paid_at || '',
        line.amount_paid,
        line.product_line,
        feeEach,
        stmt.payout_id,
        stmt.inspector.source_code || '',
        stmt.period_start,
        stmt.period_end,
      ]
        .map(csvEscape)
        .join(',')
    );
  }

  const body = rows.join('\r\n');
  return '\uFEFF' + body;
}

module.exports = {
  FEE_AUD_BY_LINE,
  getPayoutPreview,
  listPayoutsForInspector,
  generatePayout,
  updatePayout,
  getAdelaideMonthBounds,
  parseInclusivePeriod,
  getPayoutStatement,
  getPayoutExportCsv,
};
