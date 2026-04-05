/**
 * Landing Page Version Library — registry only (no rendering / CMS).
 */

const { pool } = require('../lib/db');
const { bumpVersionLabel, insertVersionEvent } = require('./adAssetVersioning');

const PRODUCT_LINES = new Set(['pre_purchase', 'rental', 'energy']);
const STATUSES = new Set(['draft', 'active', 'archived']);

function trim(v) {
  if (v == null) return '';
  return String(v).trim();
}

function isUuid(s) {
  return typeof s === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function createVersion(body = {}) {
  const productLine = trim(body.product_line).toLowerCase();
  if (!productLine || !PRODUCT_LINES.has(productLine)) {
    const e = new Error(`product_line is required; one of: ${[...PRODUCT_LINES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const version = trim(body.version);
  if (!version) {
    const e = new Error('version is required (use same value as URL lpv= when tracking)');
    e.code = 'VALIDATION';
    throw e;
  }
  const pageName = trim(body.page_name);
  if (!pageName) {
    const e = new Error('page_name is required');
    e.code = 'VALIDATION';
    throw e;
  }
  let routePath = trim(body.route_path);
  if (!routePath) {
    const e = new Error('route_path is required (e.g. /index.html)');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!routePath.startsWith('/')) routePath = `/${routePath}`;

  const status = trim(body.status).toLowerCase() || 'draft';
  if (!STATUSES.has(status)) {
    const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }

  const headline = trim(body.headline) || null;
  const subheadline = trim(body.subheadline) || null;
  const ctaText = trim(body.cta_text) || null;

  const r = await pool.query(
    `INSERT INTO landing_page_versions (
       product_line, version, page_name, route_path, headline, subheadline, cta_text, status
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [productLine, version, pageName, routePath, headline, subheadline, ctaText, status]
  );
  return r.rows[0];
}

async function getVersionById(id, db = pool) {
  if (!isUuid(id)) return null;
  const r = await db.query(`SELECT * FROM landing_page_versions WHERE id = $1::uuid`, [id]);
  return r.rows[0] || null;
}

async function listVersions(filters = {}) {
  const limit = Math.min(Math.max(parseInt(String(filters.limit || '100'), 10) || 100, 1), 500);
  const params = [];
  const where = [];
  let i = 1;
  if (filters.status) {
    params.push(String(filters.status).trim().toLowerCase());
    where.push(`status = $${i++}`);
  }
  if (filters.product_line) {
    params.push(String(filters.product_line).trim().toLowerCase());
    where.push(`product_line = $${i++}`);
  }
  if (filters.version) {
    params.push(String(filters.version).trim());
    where.push(`version = $${i++}`);
  }
  if (filters.route_path) {
    params.push(String(filters.route_path).trim());
    where.push(`route_path = $${i++}`);
  }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(limit);
  const r = await pool.query(
    `SELECT * FROM landing_page_versions ${w}
     ORDER BY updated_at DESC NULLS LAST, created_at DESC
     LIMIT $${i}`,
    params
  );
  return r.rows;
}

function normalizeProductLineForCopy(pl) {
  const s = trim(pl).toLowerCase().replace(/-/g, '_');
  if (PRODUCT_LINES.has(s)) return s;
  return 'energy';
}

/**
 * @param {object} row - landing_page_versions-shaped row or plain object
 */
function rowToCopySnapshot(row) {
  if (!row || typeof row !== 'object') {
    return { version: null, headline: null, subheadline: null, cta_text: null };
  }
  return {
    version: row.version != null ? trim(row.version) || null : null,
    headline: row.headline != null ? trim(row.headline) || null : null,
    subheadline: row.subheadline != null ? trim(row.subheadline) || null : null,
    cta_text: row.cta_text != null ? trim(row.cta_text) || null : null,
  };
}

function shortenClause(s, max) {
  const t = trim(s);
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

function riskCoreFromBetterHeadline(betterHeadline) {
  const t = trim(betterHeadline);
  if (!t) return '';
  return shortenClause(t.replace(/^(stronger offer:\s*|risk:\s*)/i, '').trim(), 52);
}

function productRiskAnchor(pl) {
  if (pl === 'pre_purchase') {
    return 'Avoid $5,000+ electrical surprises before settlement';
  }
  if (pl === 'rental') {
    return "Don't risk undocumented electrical issues on rental changeovers";
  }
  return 'Avoid costly tariff and upgrade mistakes — independent read, no sales pitch';
}

function productSubFallback(pl) {
  if (pl === 'pre_purchase') {
    return 'Licensed review before you commit — clarity, not sales projections.';
  }
  if (pl === 'rental') {
    return 'Documented safety and compliance clarity for landlords and agencies.';
  }
  return 'Independent on-site read of your bill, usage, and options.';
}

function ctaTodayForProductLine(pl, betterCta) {
  const b = trim(betterCta);
  if (pl === 'pre_purchase') return 'Book Your Pre-Purchase Electrical Review Today';
  if (pl === 'rental') return 'Book Your Inspection Today';
  if (pl === 'energy') return 'Book Your Advisory Review Today';
  if (b) {
    const core = shortenClause(b.replace(/\s*—.*$/, '').replace(/\.$/, ''), 36);
    return `${core} Today`;
  }
  return 'Book Your Inspection Today';
}

/**
 * One-click optimized English LP copy: start from better_version, tune by drop_off_stage, then product_line.
 * @param {object} opts
 * @param {string} [opts.product_line]
 * @param {string} [opts.drop_off_stage] - headline | cta | form | ok | insufficient_data
 * @param {object} [opts.better_version] - { headline?, subheadline?, cta_text?, version? }
 * @param {object} [opts.current_version] - weaker LP snapshot (for optional contrast)
 * @returns {{ headline: string, subheadline: string, cta_text: string }}
 */
function generateOptimizedLandingPageCopy(opts = {}) {
  const pl = normalizeProductLineForCopy(opts.product_line || 'energy');
  const stage = String(opts.drop_off_stage || 'ok').toLowerCase();
  const better = rowToCopySnapshot(opts.better_version);
  const current = rowToCopySnapshot(opts.current_version);

  let headline = better.headline || productRiskAnchor(pl);
  let subheadline = better.subheadline || productSubFallback(pl);
  let cta_text = better.cta_text || 'Book now';

  const coreFromBetter = riskCoreFromBetterHeadline(better.headline);

  if (stage === 'headline' || stage === 'insufficient_data') {
    if (pl === 'pre_purchase') {
      headline = coreFromBetter
        ? `Avoid Costly Electrical Issues Before You Buy — ${coreFromBetter}`
        : 'Avoid $5,000 Electrical Issues Before You Buy';
    } else if (pl === 'rental') {
      headline = coreFromBetter
        ? `Don't Risk Compliance Gaps on Changeovers — ${coreFromBetter}`
        : "Don't Risk Undocumented Electrical Issues on Changeovers";
    } else {
      headline = coreFromBetter
        ? `Avoid Costly Energy Mistakes — ${coreFromBetter}`
        : "Don't Risk Bill Shock — Independent Read Before You Upgrade";
    }
    headline = shortenClause(headline, 140);
    const trust = 'Independent, no installation sales.';
    subheadline = subheadline ? `${subheadline} ${trust}` : `${productSubFallback(pl)} ${trust}`;
    subheadline = shortenClause(subheadline, 220);
  } else if (stage === 'cta') {
    cta_text = ctaTodayForProductLine(pl, better.cta_text);
    const nudge =
      pl === 'rental'
        ? 'Scroll to book — same-week slots across Adelaide metro.'
        : pl === 'pre_purchase'
          ? 'Ready when you are — book a licensed pre-purchase electrical review.'
          : 'See availability — book your independent advisory visit.';
    subheadline = subheadline ? `${subheadline} ${nudge}` : `${productSubFallback(pl)} ${nudge}`;
    subheadline = shortenClause(subheadline, 240);
  } else if (stage === 'form') {
    const ease = 'No obligation. Takes 30 seconds.';
    subheadline = subheadline.includes('30 seconds') ? subheadline : `${subheadline} ${ease}`;
    subheadline = shortenClause(subheadline, 240);
    cta_text = 'Get Started — No Obligation';
  } else {
    headline = better.headline
      ? shortenClause(better.headline, 120)
      : current.headline
        ? shortenClause(current.headline, 120)
        : shortenClause(productRiskAnchor(pl), 120);
    subheadline = shortenClause(subheadline || productSubFallback(pl), 220);
    cta_text = shortenClause(cta_text, 60);
  }

  return {
    headline: trim(headline) || productRiskAnchor(pl),
    subheadline: trim(subheadline) || productSubFallback(pl),
    cta_text: trim(cta_text) || 'Book now',
  };
}

async function patchVersion(id, patch = {}) {
  if (!isUuid(id)) {
    const e = new Error('Invalid id');
    e.code = 'VALIDATION';
    throw e;
  }

  const existingRes = await pool.query(`SELECT id, status FROM landing_page_versions WHERE id = $1::uuid`, [id]);
  const existing = existingRes.rows[0];
  if (!existing) return null;

  const patchKeys = Object.keys(patch || {}).filter(
    (k) => patch[k] !== undefined && !['sync_secret'].includes(k)
  );
  if (String(existing.status || '').toLowerCase() === 'active') {
    const onlyStatus = patchKeys.length === 1 && patchKeys[0] === 'status';
    const nextSt = onlyStatus ? trim(patch.status).toLowerCase() : '';
    if (!onlyStatus || nextSt !== 'archived') {
      const e = new Error(
        'Active landing page version cannot be edited in place. Use POST /api/ads/landing-pages/:id/publish-new-version, or set status to archived to deprecate.'
      );
      e.code = 'ACTIVE_IMMUTABLE';
      throw e;
    }
  }

  const allowed = [
    ['product_line', 'product_line'],
    ['version', 'version'],
    ['page_name', 'page_name'],
    ['route_path', 'route_path'],
    ['headline', 'headline'],
    ['subheadline', 'subheadline'],
    ['cta_text', 'cta_text'],
    ['status', 'status'],
  ];
  const sets = [];
  const vals = [];
  let idx = 1;
  for (const [key, col] of allowed) {
    if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;
    const raw = patch[key];
    if (key === 'product_line') {
      const p = trim(raw).toLowerCase();
      if (!PRODUCT_LINES.has(p)) {
        const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(p);
    } else if (key === 'status') {
      const s = trim(raw).toLowerCase();
      if (!STATUSES.has(s)) {
        const e = new Error(`status must be one of: ${[...STATUSES].join(', ')}`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(s);
    } else if (key === 'route_path') {
      let p = trim(raw);
      if (!p) {
        const e = new Error('route_path cannot be empty');
        e.code = 'VALIDATION';
        throw e;
      }
      if (!p.startsWith('/')) p = `/${p}`;
      vals.push(p);
    } else if (key === 'version' || key === 'page_name') {
      const t = trim(raw);
      if (!t) {
        const e = new Error(`${key} cannot be empty`);
        e.code = 'VALIDATION';
        throw e;
      }
      vals.push(t);
    } else {
      vals.push(raw == null || raw === '' ? null : String(raw).trim());
    }
    sets.push(`${col} = $${idx++}`);
  }
  if (!sets.length) {
    const e = new Error('No updatable fields in body');
    e.code = 'VALIDATION';
    throw e;
  }
  vals.push(id);
  const r = await pool.query(
    `UPDATE landing_page_versions SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${idx}::uuid RETURNING *`,
    vals
  );
  return r.rows[0] || null;
}

/**
 * Fork a new landing_page_versions row (same route_path, bumped version label).
 * @param {string} id
 * @param {object} [opts] - { edits?, initial_status?, deactivate_previous?, version? }
 */
async function publishNewLandingVersion(id, opts = {}) {
  if (!isUuid(id)) {
    const e = new Error('Invalid id');
    e.code = 'VALIDATION';
    throw e;
  }
  const edits = opts.edits && typeof opts.edits === 'object' ? opts.edits : {};
  const initialStatus = trim(opts.initial_status).toLowerCase() || 'draft';
  if (!STATUSES.has(initialStatus)) {
    const e = new Error(`initial_status must be one of: ${[...STATUSES].join(', ')}`);
    e.code = 'VALIDATION';
    throw e;
  }
  const deactivatePrevious = opts.deactivate_previous === true;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const cur = await client.query(`SELECT * FROM landing_page_versions WHERE id = $1::uuid FOR UPDATE`, [id]);
    const old = cur.rows[0];
    if (!old) {
      await client.query('ROLLBACK');
      return null;
    }

    const oldVer = trim(old.version) || null;
    const newVer = trim(opts.version) || bumpVersionLabel(oldVer || 'v1');

    const clash = await client.query(
      `SELECT 1 FROM landing_page_versions WHERE route_path = $1 AND version = $2 LIMIT 1`,
      [old.route_path, newVer]
    );
    if (clash.rows.length > 0) {
      const e = new Error(`Version label "${newVer}" already exists for route_path ${old.route_path}`);
      e.code = 'DUPLICATE_VERSION';
      throw e;
    }

    const pick = (key, fallback) =>
      Object.prototype.hasOwnProperty.call(edits, key) ? edits[key] : fallback;

    const productLineRaw = pick('product_line', old.product_line);
    const productLine = trim(String(productLineRaw || '')).toLowerCase();
    if (!PRODUCT_LINES.has(productLine)) {
      const e = new Error(`product_line must be one of: ${[...PRODUCT_LINES].join(', ')}`);
      e.code = 'VALIDATION';
      throw e;
    }
    const pageName = trim(String(pick('page_name', old.page_name) || ''));
    if (!pageName) {
      const e = new Error('page_name cannot be empty');
      e.code = 'VALIDATION';
      throw e;
    }
    let routePath = trim(String(pick('route_path', old.route_path) || ''));
    if (!routePath.startsWith('/')) routePath = `/${routePath}`;

    const headline = pick('headline', old.headline);
    const subheadline = pick('subheadline', old.subheadline);
    const ctaText = pick('cta_text', old.cta_text);

    const ins = await client.query(
      `INSERT INTO landing_page_versions (
         product_line, version, page_name, route_path, headline, subheadline, cta_text, status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        productLine,
        newVer,
        pageName,
        routePath,
        headline != null ? trim(String(headline)) || null : null,
        subheadline != null ? trim(String(subheadline)) || null : null,
        ctaText != null ? trim(String(ctaText)) || null : null,
        initialStatus,
      ]
    );
    const created = ins.rows[0];

    if (deactivatePrevious && String(old.status || '').toLowerCase() === 'active') {
      await client.query(
        `UPDATE landing_page_versions SET status = 'archived', updated_at = NOW() WHERE id = $1::uuid`,
        [old.id]
      );
    }

    await insertVersionEvent(client, {
      object_type: 'landing_page',
      old_id: old.id,
      new_id: created.id,
      old_version: oldVer,
      new_version: newVer,
      meta: {
        initial_status: initialStatus,
        deactivate_previous: deactivatePrevious,
        route_path: old.route_path,
      },
    });

    await client.query('COMMIT');
    return {
      landing_page_version: created,
      forked_from_id: old.id,
      previous_status_archived:
        deactivatePrevious && String(old.status || '').toLowerCase() === 'active',
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  createVersion,
  listVersions,
  getVersionById,
  patchVersion,
  publishNewLandingVersion,
  generateOptimizedLandingPageCopy,
  PRODUCT_LINES,
  STATUSES,
};
