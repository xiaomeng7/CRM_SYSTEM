/**
 * Conversion funnel + offline queue metrics for ads optimization (Phase 3).
 * Read-only; uses same date window semantics as google-offline summary (created_at / won_at / paid_at).
 */

const { pool } = require('../lib/db');

function parseDateRange(filters = {}) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  return { dateFrom, dateTo };
}

/**
 * @param {object} filters - { date_from, date_to, db? }
 * @returns {Promise<object>}
 */
async function getConversionPerformance(filters = {}, db = pool) {
  const { dateFrom, dateTo } = parseDateRange(filters);
  const params = [];
  let i = 1;
  const leadWhere = [];
  const wonWhere = [];
  const paidWhere = [];
  const offlineWhere = [];

  if (dateFrom) {
    params.push(dateFrom);
    const p = `$${i++}::date`;
    leadWhere.push(`created_at >= ${p}`);
    wonWhere.push(`COALESCE(won_at, updated_at) >= ${p}`);
    paidWhere.push(`COALESCE(paid_at, updated_at) >= ${p}`);
    offlineWhere.push(`created_at >= ${p}`);
  }
  if (dateTo) {
    params.push(dateTo);
    const p = `$${i++}::date`;
    leadWhere.push(`created_at < (${p}::date + INTERVAL '1 day')`);
    wonWhere.push(`COALESCE(won_at, updated_at) < (${p}::date + INTERVAL '1 day')`);
    paidWhere.push(`COALESCE(paid_at, updated_at) < (${p}::date + INTERVAL '1 day')`);
    offlineWhere.push(`created_at < (${p}::date + INTERVAL '1 day')`);
  }

  const lw = leadWhere.length ? `WHERE ${leadWhere.join(' AND ')}` : '';
  const ow = offlineWhere.length ? `WHERE ${offlineWhere.join(' AND ')}` : '';
  const wonDateClause = wonWhere.length ? wonWhere.join(' AND ') : 'TRUE';
  const paidDateClause = paidWhere.length ? paidWhere.join(' AND ') : 'TRUE';

  const [leadsRow, wonRow, paidRow, offlineByType, qualityMix, valueSrcMix] = await Promise.all([
    db.query(`SELECT COUNT(*)::bigint AS n FROM leads ${lw}`, params),
    db.query(
      `SELECT COUNT(*)::bigint AS n FROM opportunities
       WHERE stage = 'won' AND (${wonDateClause})`,
      params
    ),
    db.query(
      `SELECT COUNT(*)::bigint AS n FROM invoices
       WHERE (
         paid_at IS NOT NULL
         OR LOWER(TRIM(COALESCE(status,''))) IN ('paid','complete','completed','closed')
       )
       AND (${paidDateClause})`,
      params
    ),
    db
      .query(
        `SELECT
           event_type,
           COUNT(*)::bigint AS rows_total,
           COUNT(*) FILTER (WHERE status = 'sent')::bigint AS sent,
           COUNT(*) FILTER (WHERE status = 'pending')::bigint AS pending,
           COUNT(*) FILTER (WHERE status = 'processing')::bigint AS processing,
           COUNT(*) FILTER (WHERE status = 'failed')::bigint AS failed,
           COUNT(*) FILTER (WHERE status = 'skipped')::bigint AS skipped,
           ROUND(AVG(conversion_value) FILTER (WHERE status = 'sent')::numeric, 4) AS avg_conversion_value_sent,
           ROUND(AVG(conversion_value)::numeric, 4) AS avg_conversion_value_all
         FROM google_offline_conversion_events
         ${ow}
         GROUP BY event_type
         ORDER BY event_type`,
        params
      )
      .catch(() => ({ rows: [] })),
    db
      .query(
        `SELECT event_type, gclid_quality, COUNT(*)::bigint AS n
         FROM google_offline_conversion_events
         ${ow}
         GROUP BY event_type, gclid_quality
         ORDER BY event_type, gclid_quality NULLS LAST`,
        params
      )
      .catch(() => ({ rows: [] })),
    db
      .query(
        `SELECT event_type, value_source, COUNT(*)::bigint AS n
         FROM google_offline_conversion_events
         ${ow}
         GROUP BY event_type, value_source
         ORDER BY event_type, value_source NULLS LAST`,
        params
      )
      .catch(() => ({ rows: [] })),
  ]);

  const leads = Number(leadsRow.rows[0]?.n ?? 0);
  const won = Number(wonRow.rows[0]?.n ?? 0);
  const paid = Number(paidRow.rows[0]?.n ?? 0);

  const pct = (a, b) => (b > 0 ? Math.round((10000 * a) / b) / 100 : null);

  return {
    date_from: dateFrom,
    date_to: dateTo,
    funnel: {
      leads,
      opportunities_won: won,
      invoices_paid: paid,
      lead_to_won_pct: pct(won, leads),
      lead_to_paid_pct: pct(paid, leads),
      won_to_paid_pct: pct(paid, won),
    },
    offline_queue_by_event_type: offlineByType.rows,
    gclid_quality_by_event_type: qualityMix.rows,
    value_source_by_event_type: valueSrcMix.rows,
  };
}

module.exports = { getConversionPerformance };
