/**
 * Ad / LP version performance by lead cohort (leads created in window).
 * Dimensions: creative_version, landing_page_version, utm_campaign.
 */

const { pool } = require('../lib/db');

const NOT_SET = '(not set)';

function parseDateRange(filters = {}) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  return { dateFrom, dateTo };
}

function productLineClause(paramIndex) {
  return `(
    $${paramIndex}::text IS NULL
    OR TRIM($${paramIndex}::text) = ''
    OR (
      LOWER(TRIM($${paramIndex}::text)) = 'rental'
      AND (
        LOWER(COALESCE(l.product_type, '')) = 'rental_lite'
        OR LOWER(COALESCE(l.source, '')) LIKE '%rental%'
      )
    )
    OR (
      LOWER(TRIM($${paramIndex}::text)) = 'pre_purchase'
      AND LOWER(COALESCE(l.product_type, '')) = 'pre_purchase'
    )
    OR (
      LOWER(TRIM($${paramIndex}::text)) = 'energy'
      AND (
        LOWER(COALESCE(l.product_type, '')) IN ('energy_audit', 'energy_advisory')
        OR LOWER(COALESCE(l.source, '')) LIKE '%advisory%'
        OR LOWER(COALESCE(l.source, '')) LIKE '%energy%'
      )
    )
  )`;
}

function buildCohortSql(dimMode) {
  const dimCreative =
    dimMode === 'full'
      ? `COALESCE(
          NULLIF(TRIM(l.creative_version), ''),
          NULLIF(TRIM(inta.creative_snap), ''),
          $NS::text
        )`
      : dimMode === 'intake_only'
        ? `COALESCE(NULLIF(TRIM(inta.creative_snap), ''), $NS::text)`
        : `COALESCE(NULLIF(TRIM(l.creative_version), ''), $NS::text)`;
  const dimLp =
    dimMode === 'full'
      ? `COALESCE(
          NULLIF(TRIM(l.landing_page_version), ''),
          NULLIF(TRIM(inta.lp_snap), ''),
          $NS::text
        )`
      : dimMode === 'intake_only'
        ? `COALESCE(NULLIF(TRIM(inta.lp_snap), ''), $NS::text)`
        : `COALESCE(NULLIF(TRIM(l.landing_page_version), ''), $NS::text)`;

  const lateralBlock =
    dimMode === 'lead_only'
      ? ''
      : `
      LEFT JOIN LATERAL (
        SELECT
          o.intake_attribution->>'creative_version' AS creative_snap,
          o.intake_attribution->>'landing_page_version' AS lp_snap
        FROM opportunities o
        WHERE o.lead_id = l.id
        ORDER BY o.created_at ASC NULLS LAST
        LIMIT 1
      ) inta ON TRUE`;

  return `
    WITH cohort AS (
      SELECT
        l.id AS lead_id,
        ${dimCreative} AS creative_version,
        ${dimLp} AS landing_page_version,
        COALESCE(NULLIF(TRIM(l.utm_campaign), ''), $NS::text) AS utm_campaign
      FROM leads l
      ${lateralBlock}
      WHERE 1=1
      $DATE_FILTER
      AND $PL_FILTER
    ),
    enriched AS (
      SELECT
        c.creative_version,
        c.landing_page_version,
        c.utm_campaign,
        c.lead_id,
        (
          SELECT COUNT(*)::bigint
          FROM opportunities o
          WHERE o.lead_id = c.lead_id AND o.stage = 'won'
        ) AS n_won_opps,
        (
          SELECT COUNT(*)::bigint
          FROM invoices inv
          INNER JOIN opportunities o ON o.id = inv.opportunity_id
          WHERE o.lead_id = c.lead_id
            AND (
              inv.paid_at IS NOT NULL
              OR LOWER(TRIM(COALESCE(inv.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
            )
        ) AS n_paid_invoices,
        (
          SELECT COALESCE(SUM(inv.amount::numeric), 0)
          FROM invoices inv
          INNER JOIN opportunities o ON o.id = inv.opportunity_id
          WHERE o.lead_id = c.lead_id
            AND (
              inv.paid_at IS NOT NULL
              OR LOWER(TRIM(COALESCE(inv.status, ''))) IN ('paid', 'complete', 'completed', 'closed')
            )
        ) AS paid_value_sum
      FROM cohort c
    )
    SELECT
      creative_version,
      landing_page_version,
      utm_campaign,
      COUNT(*)::bigint AS leads,
      SUM(n_won_opps)::bigint AS opportunities_won,
      SUM(n_paid_invoices)::bigint AS invoices_paid,
      ROUND(
        (100.0 * SUM(CASE WHEN n_won_opps > 0 THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0))::numeric,
        2
      ) AS lead_to_won_pct,
      ROUND(
        (
          100.0
          * SUM(CASE WHEN n_paid_invoices > 0 THEN 1 ELSE 0 END)
          / NULLIF(SUM(CASE WHEN n_won_opps > 0 THEN 1 ELSE 0 END), 0)
        )::numeric,
        2
      ) AS won_to_paid_pct,
      ROUND(COALESCE(SUM(paid_value_sum), 0)::numeric, 2) AS total_paid_value,
      ROUND(
        (SUM(paid_value_sum) / NULLIF(SUM(n_paid_invoices), 0))::numeric,
        2
      ) AS avg_paid_value
    FROM enriched
    GROUP BY creative_version, landing_page_version, utm_campaign
    ORDER BY leads DESC, creative_version, landing_page_version, utm_campaign
  `;
}

/**
 * @param {object} filters - { date_from, date_to, product_line?, db? }
 */
async function getAdPerformance(filters = {}, db = pool) {
  const { dateFrom, dateTo } = parseDateRange(filters);
  let productLine = filters.product_line ? String(filters.product_line).trim() : null;
  if (productLine) {
    const pl = productLine.toLowerCase();
    if (!['rental', 'pre_purchase', 'energy'].includes(pl)) {
      const e = new Error('product_line must be one of: rental, pre_purchase, energy');
      e.code = 'VALIDATION';
      throw e;
    }
    productLine = pl;
  }

  const params = [];
  let p = 1;
  const dateParts = [];
  if (dateFrom) {
    params.push(dateFrom);
    dateParts.push(`l.created_at >= $${p++}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    dateParts.push(`l.created_at < ($${p++}::date + INTERVAL '1 day')`);
  }
  const dateFilter = dateParts.length ? `AND ${dateParts.join(' AND ')}` : '';

  params.push(productLine);
  const plIdx = p++;
  params.push(NOT_SET);
  const nsIdx = p++;

  const plFilter = productLineClause(plIdx);

  const template = buildCohortSql('full');
  const sqlFull = template
    .replace(/\$DATE_FILTER/g, dateFilter)
    .replace(/\$PL_FILTER/g, plFilter)
    .replace(/\$NS/g, `$${nsIdx}`);

  const sqlFallback = buildCohortSql('intake_only')
    .replace(/\$DATE_FILTER/g, dateFilter)
    .replace(/\$PL_FILTER/g, plFilter)
    .replace(/\$NS/g, `$${nsIdx}`);

  const sqlLeadOnly = buildCohortSql('lead_only')
    .replace(/\$DATE_FILTER/g, dateFilter)
    .replace(/\$PL_FILTER/g, plFilter)
    .replace(/\$NS/g, `$${nsIdx}`);

  let rows;
  try {
    rows = (await db.query(sqlFull, params)).rows;
  } catch (e) {
    const msg = String(e.message || '');
    if (/creative_version|landing_page_version|column/i.test(msg)) {
      try {
        rows = (await db.query(sqlFallback, params)).rows;
      } catch (e2) {
        if (/intake_attribution|column/i.test(String(e2.message || ''))) {
          rows = (await db.query(sqlLeadOnly, params)).rows;
        } else {
          throw e2;
        }
      }
    } else {
      throw e;
    }
  }

  const normalized = rows.map((row) => ({
    creative_version: row.creative_version === NOT_SET ? null : row.creative_version,
    landing_page_version: row.landing_page_version === NOT_SET ? null : row.landing_page_version,
    utm_campaign: row.utm_campaign === NOT_SET ? null : row.utm_campaign,
    leads: Number(row.leads ?? 0),
    opportunities_won: Number(row.opportunities_won ?? 0),
    invoices_paid: Number(row.invoices_paid ?? 0),
    lead_to_won_pct: row.lead_to_won_pct != null ? Number(row.lead_to_won_pct) : null,
    won_to_paid_pct: row.won_to_paid_pct != null ? Number(row.won_to_paid_pct) : null,
    total_paid_value: row.total_paid_value != null ? Number(row.total_paid_value) : 0,
    avg_paid_value: row.avg_paid_value != null ? Number(row.avg_paid_value) : null,
  }));

  return {
    date_from: dateFrom,
    date_to: dateTo,
    product_line: productLine || null,
    cohort_note:
      'Leads counted by created_at in range; won/paid/value are lifetime outcomes for those leads (opportunities + invoices linked by opportunity_id). Dimensions: lead columns first, else first opportunity intake_attribution snapshot.',
    by_version: normalized,
  };
}

module.exports = { getAdPerformance, NOT_SET };
