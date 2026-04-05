/**
 * CRUD for inspectors + link path templates (marketing site paths).
 */

const { pool } = require('../lib/db');
const { getInspectorPerformance } = require('./inspectorPerformance');

const SOURCE_CODE_RE = /^[a-z][a-z0-9_]{0,127}$/;

/** Paths on the public marketing site (prepend origin in UI). */
const LINK_PATHS = {
  pre_purchase: '/pre-purchase-landing/index.html',
  rental: '/rental-lite.html',
  energy: '/index.html',
};

function slugFromName(name) {
  const base = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100);
  if (!base) return 'inspector';
  return base;
}

function sanitizeSourceCode(input) {
  const s = String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!s || !SOURCE_CODE_RE.test(s)) return null;
  return s;
}

async function ensureUniqueSourceCode(client, base, excludeId = null) {
  let code = base;
  let n = 0;
  while (n < 1000) {
    const params = [code];
    let sql = `SELECT 1 FROM inspectors WHERE source_code = $1 LIMIT 1`;
    if (excludeId) {
      sql = `SELECT 1 FROM inspectors WHERE source_code = $1 AND id <> $2::uuid LIMIT 1`;
      params.push(excludeId);
    }
    const hit = await client.query(sql, params);
    if (!hit.rows[0]) return code;
    n += 1;
    code = `${base}_${n}`;
  }
  throw new Error('Could not allocate unique source_code');
}

async function listInspectors() {
  const r = await pool.query(
    `SELECT id, name, company_name, phone, email, source_code, status, notes, created_at, updated_at
     FROM inspectors ORDER BY created_at DESC`
  );
  return r.rows;
}

async function getInspectorById(id) {
  const r = await pool.query(
    `SELECT id, name, company_name, phone, email, source_code, status, notes, created_at, updated_at
     FROM inspectors WHERE id = $1::uuid LIMIT 1`,
    [id]
  );
  return r.rows[0] || null;
}

async function createInspector(body = {}) {
  const name = String(body.name || '').trim();
  if (!name) throw new Error('name is required');

  let sourceCode = sanitizeSourceCode(body.source_code);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (!sourceCode) {
      sourceCode = await ensureUniqueSourceCode(client, slugFromName(name));
    } else {
      const taken = await client.query(`SELECT 1 FROM inspectors WHERE source_code = $1 LIMIT 1`, [sourceCode]);
      if (taken.rows[0]) throw new Error('source_code already in use');
    }

    const company_name = String(body.company_name || '').trim() || null;
    const phone = String(body.phone || '').trim() || null;
    const email = String(body.email || '').trim() || null;
    const status = String(body.status || 'active').trim().toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const notes = String(body.notes || '').trim() || null;

    const ins = await client.query(
      `INSERT INTO inspectors (name, company_name, phone, email, source_code, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, company_name, phone, email, source_code, status, notes, created_at, updated_at`,
      [name, company_name, phone, email, sourceCode, status, notes]
    );
    await client.query('COMMIT');
    return ins.rows[0];
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function updateInspector(id, body = {}) {
  const existing = await getInspectorById(id);
  if (!existing) return null;

  const patches = [];
  const vals = [];
  let i = 1;

  if (body.name != null) {
    const name = String(body.name).trim();
    if (!name) throw new Error('name cannot be empty');
    patches.push(`name = $${i++}`);
    vals.push(name);
  }
  if (body.company_name !== undefined) {
    patches.push(`company_name = $${i++}`);
    vals.push(String(body.company_name || '').trim() || null);
  }
  if (body.phone !== undefined) {
    patches.push(`phone = $${i++}`);
    vals.push(String(body.phone || '').trim() || null);
  }
  if (body.email !== undefined) {
    patches.push(`email = $${i++}`);
    vals.push(String(body.email || '').trim() || null);
  }
  if (body.notes !== undefined) {
    patches.push(`notes = $${i++}`);
    vals.push(String(body.notes || '').trim() || null);
  }
  if (body.status != null) {
    const st = String(body.status).trim().toLowerCase();
    if (!['active', 'inactive'].includes(st)) throw new Error('invalid status');
    patches.push(`status = $${i++}`);
    vals.push(st);
  }
  if (body.source_code != null) {
    const sc = sanitizeSourceCode(body.source_code);
    if (!sc) throw new Error('invalid source_code');
    const dup = await pool.query(
      `SELECT 1 FROM inspectors WHERE source_code = $1 AND id <> $2::uuid LIMIT 1`,
      [sc, id]
    );
    if (dup.rows[0]) throw new Error('source_code already in use');
    patches.push(`source_code = $${i++}`);
    vals.push(sc);
  }

  if (!patches.length) return existing;

  patches.push('updated_at = NOW()');
  vals.push(id);

  const r = await pool.query(
    `UPDATE inspectors SET ${patches.join(', ')} WHERE id = $${i}::uuid
     RETURNING id, name, company_name, phone, email, source_code, status, notes, created_at, updated_at`,
    vals
  );
  return r.rows[0] || null;
}

function linkQueryFor(code) {
  const sub = encodeURIComponent(code);
  return `source=inspector&sub=${sub}`;
}

function inspectorLinks(sourceCode) {
  const q = linkQueryFor(sourceCode);
  return {
    pre_purchase: `${LINK_PATHS.pre_purchase}?${q}`,
    rental: `${LINK_PATHS.rental}?${q}`,
    energy: `${LINK_PATHS.energy}?${q}`,
  };
}

module.exports = {
  listInspectors,
  getInspectorById,
  createInspector,
  updateInspector,
  getInspectorPerformance,
  inspectorLinks,
  LINK_PATHS,
  linkQueryFor,
};
