#!/usr/bin/env node
/**
 * Sample reconciliation: compare v_campaign_roi_summary vs raw SQL for 3 campaigns (by campaigns.id).
 * Use before trusting the dashboard; catches join / filter drift.
 *
 * Usage (from apps/crm):
 *   node scripts/validate-campaign-roi-reconcile.js <uuid1> <uuid2> <uuid3>
 * Or:
 *   CAMPAIGN_ROI_VALIDATE_IDS=id1,id2,id3 node scripts/validate-campaign-roi-reconcile.js
 *
 * Lists seed campaign ids:
 *   node scripts/validate-campaign-roi-reconcile.js --list-seeds
 */

require('../lib/load-env');
const { pool } = require('../lib/db');

async function rawMetrics(campaignId) {
  const paidClause = `(
      i.paid_at IS NOT NULL
      OR LOWER(TRIM(COALESCE(i.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
    )`;
  const [leads, wins, revenue, cost] = await Promise.all([
    pool.query(`SELECT COUNT(*)::bigint AS n FROM leads WHERE campaign_id = $1`, [campaignId]),
    pool.query(
      `SELECT COUNT(DISTINCT o.id)::bigint AS n
       FROM leads l
       INNER JOIN opportunities o ON o.lead_id = l.id AND o.stage = 'won'
       WHERE l.campaign_id = $1`,
      [campaignId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(COALESCE(i.amount_paid, i.amount, 0)), 0)::numeric AS n
       FROM leads l
       INNER JOIN opportunities o ON o.lead_id = l.id AND o.stage = 'won'
       INNER JOIN invoices i ON i.opportunity_id = o.id
       WHERE l.campaign_id = $1 AND ${paidClause}`,
      [campaignId]
    ),
    pool.query(
      `SELECT COALESCE(SUM(spend), 0)::numeric AS n FROM campaign_costs WHERE campaign_id = $1`,
      [campaignId]
    ),
  ]);

  const L = Number(leads.rows[0].n);
  const W = Number(wins.rows[0].n);
  const R = Number(revenue.rows[0].n);
  const C = Number(cost.rows[0].n);
  const P = R - C;
  const cr = L > 0 ? W / L : null;
  const arw = W > 0 ? R / W : null;
  const rpl = L > 0 ? R / L : null;

  return {
    leads: L,
    wins: W,
    revenue: R,
    cost: C,
    profit: P,
    conversion_rate: cr,
    avg_revenue_per_win: arw,
    revenue_per_lead: rpl,
  };
}

async function viewRow(campaignId) {
  const r = await pool.query(
    `SELECT campaign_id, utm_campaign, leads, wins, revenue, cost, profit,
            conversion_rate, avg_revenue_per_win, revenue_per_lead
     FROM v_campaign_roi_summary
     WHERE campaign_id = $1`,
    [campaignId]
  );
  return r.rows[0] || null;
}

function closeEnough(a, b, eps = 0.015) {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isNaN(na) || Number.isNaN(nb)) return false;
  if (Math.abs(na - nb) < 1e-9) return true;
  if (Math.abs(na - nb) <= eps) return true;
  return false;
}

function compare(label, raw, viewVal, mode = 'count') {
  const v = viewVal == null ? null : Number(viewVal);
  const r = raw == null ? null : Number(raw);
  let ok;
  if (mode === 'money') ok = closeEnough(r, v, 0.02);
  else if (mode === 'rate') ok = r == null && v == null ? true : closeEnough(r, v, 0.000001);
  else ok = r === v || (r != null && v != null && Math.abs(r - v) < 1e-9);
  const flag = ok ? 'OK' : 'MISMATCH';
  return { flag, line: `  ${label}: raw=${raw} view=${viewVal}  [${flag}]` };
}

async function listSeeds() {
  const r = await pool.query(
    `SELECT id, code, name
     FROM campaigns
     WHERE (metadata->>'seed') = 'true'
        OR code LIKE 'seed_%'
     ORDER BY code`
  );
  console.log('Campaign rows for validation (use id args):\n');
  r.rows.forEach((row) => console.log(`  ${row.id}  ${row.code}  — ${row.name}`));
  if (r.rows.length === 0) {
    console.log('  (none — run migration 034_campaign_roi_metrics_and_seeds.sql)');
  }
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--list-seeds') {
    await listSeeds();
    await pool.end();
    return;
  }

  let ids = args.filter((a) => /^[0-9a-f-]{36}$/i.test(a));
  if (ids.length === 0 && process.env.CAMPAIGN_ROI_VALIDATE_IDS) {
    ids = process.env.CAMPAIGN_ROI_VALIDATE_IDS.split(/[\s,]+/).filter(Boolean);
  }
  if (ids.length === 0) {
    console.log(`Usage:
  node scripts/validate-campaign-roi-reconcile.js <campaign-uuid> <campaign-uuid> <campaign-uuid>
  CAMPAIGN_ROI_VALIDATE_IDS=u1,u2,u3 node scripts/validate-campaign-roi-reconcile.js
  node scripts/validate-campaign-roi-reconcile.js --list-seeds
`);
    process.exit(1);
  }

  console.log('Campaign ROI reconciliation (raw SQL vs v_campaign_roi_summary)\n');
  let anyFail = false;

  for (const id of ids) {
    console.log(`--- campaign_id ${id} ---`);
    const raw = await rawMetrics(id);
    const vw = await viewRow(id);

    if (!vw) {
      console.log('  VIEW: no row (no leads with this campaign_id, or view error)\n');
      if (raw.leads > 0) {
        console.log('  MISMATCH: raw leads > 0 but view empty\n');
        anyFail = true;
      }
      continue;
    }

    const checks = [
      compare('leads', raw.leads, vw.leads, 'count'),
      compare('wins', raw.wins, vw.wins, 'count'),
      compare('revenue', raw.revenue, vw.revenue, 'money'),
      compare('cost', raw.cost, vw.cost, 'money'),
      compare('profit', raw.profit, vw.profit, 'money'),
      compare('conversion_rate', raw.conversion_rate, vw.conversion_rate, 'rate'),
      compare('avg_revenue_per_win', raw.avg_revenue_per_win, vw.avg_revenue_per_win, 'money'),
      compare('revenue_per_lead', raw.revenue_per_lead, vw.revenue_per_lead, 'money'),
    ];
    checks.forEach((c) => console.log(c.line));
    if (checks.some((c) => c.flag === 'MISMATCH')) anyFail = true;
    console.log(`  label: ${vw.utm_campaign}\n`);
  }

  if (anyFail) {
    console.log('Result: FAIL — fix view or definitions before trusting the summary.');
    process.exitCode = 1;
  } else {
    console.log('Result: OK — sample rows match raw metrics.');
  }

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
