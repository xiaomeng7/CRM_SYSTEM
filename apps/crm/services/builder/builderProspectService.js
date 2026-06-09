/**
 * Builder prospect service — reads/writes b2b_prospects where prospect_type = 'builder' (PR8A).
 */

const { pool } = require('../../lib/db');
const {
  PROSPECT_TYPE_BUILDER,
  BUILDER_TYPES,
  PROJECT_FOCUS,
  FIT_PRIORITIES,
  RESEARCH_STATUSES,
  RELATIONSHIP_STAGES,
  BUILDER_CREATE_FIELDS,
  BUILDER_UPDATE_FIELDS,
  RELATIONSHIP_STRENGTHS,
  OPPORTUNITY_POTENTIALS,
  TIMING_STATUSES,
  BUILDER_STATUSES,
} = require('./builderProspectConstants');

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 100;

function assertEnum(value, allowed, fieldName) {
  if (value == null || value === '') return null;
  const v = String(value).trim();
  if (!allowed.includes(v)) {
    const err = new Error(`Invalid ${fieldName}: ${v}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return v;
}

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function parseLimit(raw) {
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function pickFields(body, allowed) {
  const out = {};
  if (!body || typeof body !== 'object') return out;
  for (const key of allowed) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  return out;
}

function setIfDefined(out, key, value) {
  if (value !== undefined) out[key] = value;
}

function normalizeBuilderInput(data, { isCreate = false } = {}) {
  const out = {};

  if (data.company_name !== undefined || isCreate) {
    const companyName = trimOrNull(data.company_name);
    if (isCreate && !companyName) {
      const err = new Error('company_name required');
      err.code = 'INVALID_INPUT';
      throw err;
    }
    setIfDefined(out, 'company_name', companyName);
  }

  const stringFields = [
    'contact_name',
    'phone',
    'email',
    'address',
    'suburb',
    'website',
    'notes',
    'source_detail',
    'target_suburbs',
    'decision_maker_name',
    'decision_maker_role',
    'qualification_notes',
  ];
  for (const key of stringFields) {
    if (data[key] !== undefined) out[key] = trimOrNull(data[key]);
  }

  if (data.source !== undefined || isCreate) {
    out.source = trimOrNull(data.source) || (isCreate ? 'manual' : null);
  }

  if (data.builder_type !== undefined || isCreate) {
    out.builder_type =
      assertEnum(data.builder_type, BUILDER_TYPES, 'builder_type') || (isCreate ? 'unknown' : null);
  }
  if (data.project_focus !== undefined || isCreate) {
    out.project_focus =
      assertEnum(data.project_focus, PROJECT_FOCUS, 'project_focus') || (isCreate ? 'unknown' : null);
  }
  if (data.fit_priority !== undefined || isCreate) {
    out.fit_priority =
      assertEnum(data.fit_priority, FIT_PRIORITIES, 'fit_priority') || (isCreate ? 'unknown' : null);
  }
  if (data.research_status !== undefined || isCreate) {
    out.research_status =
      assertEnum(data.research_status, RESEARCH_STATUSES, 'research_status') ||
      (isCreate ? 'not_started' : null);
  }
  if (data.relationship_stage !== undefined || isCreate) {
    out.relationship_stage =
      assertEnum(data.relationship_stage, RELATIONSHIP_STAGES, 'relationship_stage') ||
      (isCreate ? 'discovered' : null);
  }
  if (data.relationship_strength !== undefined || isCreate) {
    out.relationship_strength =
      assertEnum(data.relationship_strength, RELATIONSHIP_STRENGTHS, 'relationship_strength') ||
      (isCreate ? 'unknown' : null);
  }
  if (data.opportunity_potential !== undefined || isCreate) {
    out.opportunity_potential =
      assertEnum(data.opportunity_potential, OPPORTUNITY_POTENTIALS, 'opportunity_potential') ||
      (isCreate ? 'unknown' : null);
  }
  if (data.timing_status !== undefined || isCreate) {
    out.timing_status =
      assertEnum(data.timing_status, TIMING_STATUSES, 'timing_status') ||
      (isCreate ? 'unknown' : null);
  }
  if (data.founder_notes !== undefined) {
    out.founder_notes = trimOrNull(data.founder_notes);
  }
  if (data.builder_status !== undefined || isCreate) {
    out.builder_status =
      assertEnum(data.builder_status, BUILDER_STATUSES, 'builder_status') ||
      (isCreate ? 'prospect' : null);
  }

  if (data.next_followup_at !== undefined || isCreate) {
    out.next_followup_at =
      data.next_followup_at != null && data.next_followup_at !== '' ? data.next_followup_at : null;
  }
  if (data.last_contacted_at !== undefined) {
    out.last_contacted_at =
      data.last_contacted_at != null && data.last_contacted_at !== '' ? data.last_contacted_at : null;
  }

  return out;
}

function buildListQuery(filters = {}) {
  const conditions = [`prospect_type = $1`];
  const params = [PROSPECT_TYPE_BUILDER];

  if (filters.relationship_stage) {
    params.push(filters.relationship_stage);
    conditions.push(`relationship_stage = $${params.length}`);
  }
  if (filters.builder_type) {
    params.push(filters.builder_type);
    conditions.push(`builder_type = $${params.length}`);
  }
  if (filters.fit_priority) {
    params.push(filters.fit_priority);
    conditions.push(`fit_priority = $${params.length}`);
  }
  if (filters.research_status) {
    params.push(filters.research_status);
    conditions.push(`research_status = $${params.length}`);
  }
  if (filters.search) {
    params.push(`%${filters.search}%`);
    const n = params.length;
    conditions.push(
      `(company_name ILIKE $${n} OR suburb ILIKE $${n} OR website ILIKE $${n} OR decision_maker_name ILIKE $${n} OR contact_name ILIKE $${n} OR email ILIKE $${n})`
    );
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  return { where, params };
}

async function listBuilderProspects(filters = {}, options = {}) {
  const db = options.db || pool;
  const { where, params } = buildListQuery(filters);
  const limit = parseLimit(filters.limit);
  const offset = Math.max(0, parseInt(filters.offset, 10) || 0);

  const listParams = [...params, limit, offset];
  const countParams = [...params];

  const [rows, countRow, stageStats] = await Promise.all([
    db.query(
      `SELECT * FROM b2b_prospects ${where}
       ORDER BY
         CASE fit_priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 WHEN 'low' THEN 2 ELSE 3 END,
         next_followup_at ASC NULLS LAST,
         created_at DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams
    ),
    db.query(`SELECT COUNT(*)::int AS cnt FROM b2b_prospects ${where}`, countParams),
    db.query(
      `SELECT relationship_stage, COUNT(*)::int AS cnt
       FROM b2b_prospects
       WHERE prospect_type = $1
       GROUP BY relationship_stage`,
      [PROSPECT_TYPE_BUILDER]
    ),
  ]);

  return {
    prospects: rows.rows,
    total: countRow.rows[0]?.cnt || 0,
    stage_stats: stageStats.rows,
  };
}

async function getBuilderProspectById(id, options = {}) {
  const db = options.db || pool;
  const r = await db.query(
    `SELECT
       p.*,
       ts.score_kind,
       ts.target_score,
       ts.target_band,
       ts.founder_priority_score,
       ts.founder_priority_band,
       ts.partner_value_score,
       ts.partner_value_band,
       ts.next_best_action AS target_next_best_action,
       ts.calculated_at AS target_scores_calculated_at
     FROM b2b_prospects p
     LEFT JOIN builder_target_scores ts ON ts.prospect_id = p.id
     WHERE p.id = $1 AND p.prospect_type = $2`,
    [id, PROSPECT_TYPE_BUILDER]
  );
  const row = r.rows[0] || null;
  if (!row) return null;

  const {
    score_kind,
    target_score,
    target_band,
    founder_priority_score,
    founder_priority_band,
    partner_value_score,
    partner_value_band,
    target_next_best_action,
    target_scores_calculated_at,
    ...prospectRow
  } = row;

  const prospect = {
    ...prospectRow,
    target_scores: target_score != null || partner_value_score != null || founder_priority_score != null
      ? {
          score_kind: score_kind || null,
          target_score: target_score != null ? Number(target_score) : null,
          target_band: target_band || null,
          founder_priority_score:
            founder_priority_score != null ? Number(founder_priority_score) : null,
          founder_priority_band: founder_priority_band || null,
          partner_value_score:
            partner_value_score != null ? Number(partner_value_score) : null,
          partner_value_band: partner_value_band || null,
          next_best_action: target_next_best_action || null,
          calculated_at: target_scores_calculated_at || null,
        }
      : null,
  };

  const outreach = await db.query(
    `SELECT id, channel, message_body, status, sent_at
     FROM b2b_outreach_log
     WHERE prospect_id = $1
     ORDER BY sent_at DESC
     LIMIT 50`,
    [id]
  );

  return { ...prospect, outreach_log: outreach.rows };
}

async function createBuilderProspect(data, options = {}) {
  const db = options.db || pool;
  const input = normalizeBuilderInput(data, { isCreate: true });

  const r = await db.query(
    `INSERT INTO b2b_prospects (
       company_name, contact_name, phone, email, address, suburb, website,
       prospect_type, notes, source, source_detail,
       builder_type, project_focus, target_suburbs, fit_priority,
       research_status, relationship_stage,
       relationship_strength, opportunity_potential, timing_status, founder_notes,
       builder_status,
       decision_maker_name, decision_maker_role, qualification_notes,
       next_followup_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,
       $8,$9,$10,$11,
       $12,$13,$14,$15,
       $16,$17,
       $18,$19,$20,$21,$22,
       $23,$24,$25,
       $26
     ) RETURNING *`,
    [
      input.company_name,
      input.contact_name,
      input.phone,
      input.email,
      input.address,
      input.suburb,
      input.website,
      PROSPECT_TYPE_BUILDER,
      input.notes,
      input.source,
      input.source_detail,
      input.builder_type,
      input.project_focus,
      input.target_suburbs,
      input.fit_priority,
      input.research_status,
      input.relationship_stage,
      input.relationship_strength ?? 'unknown',
      input.opportunity_potential ?? 'unknown',
      input.timing_status ?? 'unknown',
      input.founder_notes ?? null,
      input.builder_status ?? 'prospect',
      input.decision_maker_name,
      input.decision_maker_role,
      input.qualification_notes,
      input.next_followup_at,
    ]
  );
  return r.rows[0];
}

async function updateBuilderProspect(id, data, options = {}) {
  const db = options.db || pool;
  const existing = await db.query(
    `SELECT id FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [id, PROSPECT_TYPE_BUILDER]
  );
  if (!existing.rows[0]) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const picked = pickFields(data, BUILDER_UPDATE_FIELDS);
  if (!Object.keys(picked).length) {
    const err = new Error('No valid fields to update');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const updates = normalizeBuilderInput(picked);
  if (!Object.keys(updates).length) {
    const err = new Error('No valid fields to update');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
  const values = [id, ...Object.values(updates)];

  values.push(PROSPECT_TYPE_BUILDER);
  const r = await db.query(
    `UPDATE b2b_prospects SET ${setClauses.join(', ')}
     WHERE id = $1 AND prospect_type = $${values.length}
     RETURNING *`,
    values
  );
  return r.rows[0];
}

async function addBuilderProspectNote(id, noteText, options = {}) {
  const db = options.db || pool;
  const text = trimOrNull(noteText);
  if (!text) {
    const err = new Error('note required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const existing = await db.query(
    `SELECT notes FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [id, PROSPECT_TYPE_BUILDER]
  );
  if (!existing.rows[0]) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const entry = `[${stamp}] ${text}`;
  const prev = existing.rows[0].notes;
  const combined = prev ? `${prev}\n\n${entry}` : entry;

  const r = await db.query(
    `UPDATE b2b_prospects SET notes = $2
     WHERE id = $1 AND prospect_type = $3
     RETURNING *`,
    [id, combined, PROSPECT_TYPE_BUILDER]
  );
  return r.rows[0];
}

module.exports = {
  listBuilderProspects,
  getBuilderProspectById,
  createBuilderProspect,
  updateBuilderProspect,
  addBuilderProspectNote,
  parseLimit,
  PROSPECT_TYPE_BUILDER,
};
