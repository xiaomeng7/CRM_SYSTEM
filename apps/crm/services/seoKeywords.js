const { pool } = require('../lib/db');

const INTENTS = ['pre_purchase', 'builder', 'service', 'suburb', 'advisory', 'informational'];
const PRIORITIES = ['high', 'medium', 'low'];
const KEYWORD_STATUSES = ['active', 'paused', 'used'];

function isValidUuid(s) {
  if (!s || typeof s !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

async function list(filters = {}) {
  const params = [];
  const where = [];
  let i = 1;

  if (filters.status && KEYWORD_STATUSES.includes(filters.status)) {
    where.push(`status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.intent && INTENTS.includes(filters.intent)) {
    where.push(`intent = $${i++}`);
    params.push(filters.intent);
  }
  if (filters.priority && PRIORITIES.includes(filters.priority)) {
    where.push(`priority = $${i++}`);
    params.push(filters.priority);
  }
  if (filters.keyword) {
    where.push(`keyword ILIKE $${i++}`);
    params.push(`%${String(filters.keyword).trim()}%`);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await pool.query(
    `SELECT id, keyword, intent, priority, status, target_page_hint, notes, created_by, created_at, updated_at
     FROM seo_keywords
     ${whereSql}
     ORDER BY updated_at DESC`,
    params
  );
  return result.rows;
}

async function create(input = {}) {
  const keyword = cleanText(input.keyword);
  const intent = cleanText(input.intent);
  const priority = cleanText(input.priority) || 'medium';
  const status = cleanText(input.status) || 'active';
  const notes = cleanText(input.notes);
  const targetPageHint = cleanText(input.target_page_hint);
  const actor = cleanText(input.actor) || 'seo-control-center';

  if (!keyword) throw Object.assign(new Error('keyword is required'), { code: 'VALIDATION' });
  if (!INTENTS.includes(intent)) throw Object.assign(new Error('intent is invalid'), { code: 'VALIDATION' });
  if (!PRIORITIES.includes(priority)) throw Object.assign(new Error('priority is invalid'), { code: 'VALIDATION' });
  if (!KEYWORD_STATUSES.includes(status)) throw Object.assign(new Error('status is invalid'), { code: 'VALIDATION' });

  const result = await pool.query(
    `INSERT INTO seo_keywords (keyword, intent, priority, status, target_page_hint, notes, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, keyword, intent, priority, status, target_page_hint, notes, created_by, created_at, updated_at`,
    [keyword, intent, priority, status, targetPageHint, notes, actor]
  );
  return result.rows[0];
}

async function patch(id, patch = {}) {
  if (!isValidUuid(id)) throw Object.assign(new Error('id must be a valid UUID'), { code: 'VALIDATION' });

  const allowed = ['keyword', 'intent', 'priority', 'status', 'target_page_hint', 'notes'];
  const keys = Object.keys(patch);
  if (!keys.length) throw Object.assign(new Error('No patch fields provided'), { code: 'VALIDATION' });
  if (keys.some((k) => !allowed.includes(k))) {
    throw Object.assign(new Error('Patch contains unsupported fields'), { code: 'VALIDATION' });
  }

  const sets = [];
  const params = [];
  let i = 1;

  if (Object.prototype.hasOwnProperty.call(patch, 'keyword')) {
    const v = cleanText(patch.keyword);
    if (!v) throw Object.assign(new Error('keyword cannot be empty'), { code: 'VALIDATION' });
    sets.push(`keyword = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'intent')) {
    const v = cleanText(patch.intent);
    if (!INTENTS.includes(v)) throw Object.assign(new Error('intent is invalid'), { code: 'VALIDATION' });
    sets.push(`intent = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'priority')) {
    const v = cleanText(patch.priority);
    if (!PRIORITIES.includes(v)) throw Object.assign(new Error('priority is invalid'), { code: 'VALIDATION' });
    sets.push(`priority = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
    const v = cleanText(patch.status);
    if (!KEYWORD_STATUSES.includes(v)) throw Object.assign(new Error('status is invalid'), { code: 'VALIDATION' });
    sets.push(`status = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'target_page_hint')) {
    sets.push(`target_page_hint = $${i++}`);
    params.push(cleanText(patch.target_page_hint));
  }
  if (Object.prototype.hasOwnProperty.call(patch, 'notes')) {
    sets.push(`notes = $${i++}`);
    params.push(cleanText(patch.notes));
  }

  params.push(id);
  const result = await pool.query(
    `UPDATE seo_keywords
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING id, keyword, intent, priority, status, target_page_hint, notes, created_by, created_at, updated_at`,
    params
  );
  return result.rows[0] || null;
}

module.exports = {
  list,
  create,
  patch,
  isValidUuid,
  INTENTS,
  PRIORITIES,
  KEYWORD_STATUSES,
};

