const { pool } = require('../lib/db');
const { INTENTS, PRIORITIES, isValidUuid } = require('./seoKeywords');

const TASK_STATUSES = ['draft', 'pending_approval', 'approved', 'in_progress', 'done', 'rejected'];

const STATUS_TRANSITIONS = {
  draft: ['pending_approval'],
  approved: ['in_progress'],
  in_progress: ['done'],
  pending_approval: [],
  rejected: [],
  done: [],
};

function cleanText(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function isValidDateOnly(v) {
  if (typeof v !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

async function keywordExists(id) {
  const r = await pool.query(`SELECT 1 FROM seo_keywords WHERE id = $1 LIMIT 1`, [id]);
  return r.rows.length > 0;
}

async function getById(id) {
  if (!isValidUuid(id)) return null;
  const r = await pool.query(
    `SELECT t.*, k.keyword AS keyword
     FROM seo_content_tasks t
     LEFT JOIN seo_keywords k ON k.id = t.keyword_id
     WHERE t.id = $1`,
    [id]
  );
  return r.rows[0] || null;
}

async function list(filters = {}) {
  const params = [];
  const where = [];
  let i = 1;

  if (filters.week_start_date) {
    if (!isValidDateOnly(String(filters.week_start_date))) {
      throw Object.assign(new Error('week_start_date must be YYYY-MM-DD'), { code: 'VALIDATION' });
    }
    where.push(`t.week_start_date = $${i++}`);
    params.push(filters.week_start_date);
  }
  if (filters.status) {
    if (!TASK_STATUSES.includes(filters.status)) throw Object.assign(new Error('status is invalid'), { code: 'VALIDATION' });
    where.push(`t.status = $${i++}`);
    params.push(filters.status);
  }
  if (filters.priority) {
    if (!PRIORITIES.includes(filters.priority)) throw Object.assign(new Error('priority is invalid'), { code: 'VALIDATION' });
    where.push(`t.priority = $${i++}`);
    params.push(filters.priority);
  }
  if (filters.intent) {
    if (!INTENTS.includes(filters.intent)) throw Object.assign(new Error('intent is invalid'), { code: 'VALIDATION' });
    where.push(`t.intent = $${i++}`);
    params.push(filters.intent);
  }
  if (filters.owner_id) {
    where.push(`t.owner_id = $${i++}`);
    params.push(String(filters.owner_id));
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const r = await pool.query(
    `SELECT t.*, k.keyword AS keyword
     FROM seo_content_tasks t
     LEFT JOIN seo_keywords k ON k.id = t.keyword_id
     ${whereSql}
     ORDER BY t.week_start_date DESC, t.updated_at DESC`,
    params
  );
  return r.rows;
}

async function create(input = {}) {
  const week = cleanText(input.week_start_date);
  const title = cleanText(input.title);
  const taskType = cleanText(input.task_type);
  const targetPage = cleanText(input.target_page);
  const intent = cleanText(input.intent);
  const priority = cleanText(input.priority) || 'medium';
  const ownerId = cleanText(input.owner_id || input.ownerId);
  const actor = cleanText(input.actor) || 'seo-control-center';
  const notes = cleanText(input.notes);
  const keywordId = cleanText(input.keyword_id);

  if (!week || !isValidDateOnly(week)) throw Object.assign(new Error('week_start_date must be YYYY-MM-DD'), { code: 'VALIDATION' });
  if (!title) throw Object.assign(new Error('title is required'), { code: 'VALIDATION' });
  if (!intent || !INTENTS.includes(intent)) throw Object.assign(new Error('intent is invalid'), { code: 'VALIDATION' });
  if (!PRIORITIES.includes(priority)) throw Object.assign(new Error('priority is invalid'), { code: 'VALIDATION' });
  if (!ownerId) throw Object.assign(new Error('owner_id is required'), { code: 'VALIDATION' });

  let normalizedKeywordId = null;
  if (keywordId != null) {
    if (!isValidUuid(keywordId)) throw Object.assign(new Error('keyword_id must be valid UUID'), { code: 'VALIDATION' });
    if (!(await keywordExists(keywordId))) throw Object.assign(new Error('keyword_id not found'), { code: 'NOT_FOUND' });
    normalizedKeywordId = keywordId;
  }

  const r = await pool.query(
    `INSERT INTO seo_content_tasks
      (keyword_id, week_start_date, task_type, title, target_page, intent, priority, status, owner_id, created_by, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', $8, $9, $10)
     RETURNING *`,
    [normalizedKeywordId, week, taskType, title, targetPage, intent, priority, ownerId, actor, notes]
  );
  return r.rows[0];
}

async function patch(id, patchData = {}) {
  if (!isValidUuid(id)) throw Object.assign(new Error('id must be a valid UUID'), { code: 'VALIDATION' });

  const allowed = ['keyword_id', 'week_start_date', 'task_type', 'title', 'target_page', 'intent', 'priority', 'owner_id', 'notes'];
  const keys = Object.keys(patchData);
  if (!keys.length) throw Object.assign(new Error('No patch fields provided'), { code: 'VALIDATION' });
  if (keys.some((k) => !allowed.includes(k))) throw Object.assign(new Error('Patch contains unsupported fields'), { code: 'VALIDATION' });

  const sets = [];
  const params = [];
  let i = 1;

  if (Object.prototype.hasOwnProperty.call(patchData, 'keyword_id')) {
    const v = cleanText(patchData.keyword_id);
    if (v == null) {
      sets.push(`keyword_id = NULL`);
    } else {
      if (!isValidUuid(v)) throw Object.assign(new Error('keyword_id must be valid UUID'), { code: 'VALIDATION' });
      if (!(await keywordExists(v))) throw Object.assign(new Error('keyword_id not found'), { code: 'NOT_FOUND' });
      sets.push(`keyword_id = $${i++}`);
      params.push(v);
    }
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'week_start_date')) {
    const v = cleanText(patchData.week_start_date);
    if (!v || !isValidDateOnly(v)) throw Object.assign(new Error('week_start_date must be YYYY-MM-DD'), { code: 'VALIDATION' });
    sets.push(`week_start_date = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'task_type')) {
    sets.push(`task_type = $${i++}`);
    params.push(cleanText(patchData.task_type));
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'title')) {
    const v = cleanText(patchData.title);
    if (!v) throw Object.assign(new Error('title cannot be empty'), { code: 'VALIDATION' });
    sets.push(`title = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'target_page')) {
    sets.push(`target_page = $${i++}`);
    params.push(cleanText(patchData.target_page));
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'intent')) {
    const v = cleanText(patchData.intent);
    if (!INTENTS.includes(v)) throw Object.assign(new Error('intent is invalid'), { code: 'VALIDATION' });
    sets.push(`intent = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'priority')) {
    const v = cleanText(patchData.priority);
    if (!PRIORITIES.includes(v)) throw Object.assign(new Error('priority is invalid'), { code: 'VALIDATION' });
    sets.push(`priority = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'owner_id')) {
    const v = cleanText(patchData.owner_id);
    if (!v) throw Object.assign(new Error('owner_id cannot be empty'), { code: 'VALIDATION' });
    sets.push(`owner_id = $${i++}`);
    params.push(v);
  }
  if (Object.prototype.hasOwnProperty.call(patchData, 'notes')) {
    sets.push(`notes = $${i++}`);
    params.push(cleanText(patchData.notes));
  }

  params.push(id);
  const r = await pool.query(
    `UPDATE seo_content_tasks
     SET ${sets.join(', ')}, updated_at = NOW()
     WHERE id = $${i}
     RETURNING *`,
    params
  );
  return r.rows[0] || null;
}

async function approve(id, action, actor) {
  if (!isValidUuid(id)) throw Object.assign(new Error('id must be a valid UUID'), { code: 'VALIDATION' });
  if (!['approve', 'reject'].includes(action)) throw Object.assign(new Error('action must be approve or reject'), { code: 'VALIDATION' });

  const existing = await getById(id);
  if (!existing) return null;
  if (existing.status !== 'pending_approval') {
    throw Object.assign(new Error('Only pending_approval tasks can be approved/rejected'), { code: 'VALIDATION' });
  }
  const nextStatus = action === 'approve' ? 'approved' : 'rejected';
  const approvedBy = cleanText(actor) || 'seo-control-center';

  const r = await pool.query(
    `UPDATE seo_content_tasks
     SET status = $1, approved_by = $2, approved_at = NOW(), updated_at = NOW()
     WHERE id = $3
     RETURNING *`,
    [nextStatus, approvedBy, id]
  );
  return r.rows[0] || null;
}

async function changeStatus(id, targetStatus) {
  if (!isValidUuid(id)) throw Object.assign(new Error('id must be a valid UUID'), { code: 'VALIDATION' });
  if (!TASK_STATUSES.includes(targetStatus)) throw Object.assign(new Error('status is invalid'), { code: 'VALIDATION' });

  const existing = await getById(id);
  if (!existing) return null;
  if (['rejected', 'done'].includes(existing.status)) {
    throw Object.assign(new Error(`Cannot transition from terminal status ${existing.status}`), { code: 'VALIDATION' });
  }
  const allowed = STATUS_TRANSITIONS[existing.status] || [];
  if (!allowed.includes(targetStatus)) {
    throw Object.assign(new Error(`Invalid status transition: ${existing.status} -> ${targetStatus}`), { code: 'VALIDATION' });
  }

  const r = await pool.query(
    `UPDATE seo_content_tasks
     SET status = $1, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [targetStatus, id]
  );
  return r.rows[0] || null;
}

module.exports = {
  TASK_STATUSES,
  list,
  create,
  patch,
  approve,
  changeStatus,
  getById,
};

