/**
 * Builder profile + research runs service (PR8C).
 */

const { pool } = require('../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('./builderProspectConstants');
const {
  FIT_LEVELS,
  RESEARCH_RUN_STATUSES,
  PROFILE_UPDATE_FIELDS,
} = require('./builderProfileConstants');

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

function parseStringArray(value) {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function parseFitScore(value) {
  if (value == null || value === '') return null;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    const err = new Error('estimated_fit_score must be 0–100');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return n;
}

function parseScoreBreakdown(value) {
  if (value == null) return undefined;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  return null;
}

function rowToProfile(row) {
  if (!row) return null;
  let score_breakdown = row.score_breakdown;
  if (score_breakdown != null && typeof score_breakdown === 'string') {
    score_breakdown = parseScoreBreakdown(score_breakdown);
  }
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    profile_summary: row.profile_summary || null,
    builder_focus: row.builder_focus || null,
    project_types: row.project_types || [],
    target_suburbs: row.target_suburbs || [],
    quality_signals: row.quality_signals || [],
    risk_signals: row.risk_signals || [],
    ideal_contact_angle: row.ideal_contact_angle || null,
    smart_home_fit: row.smart_home_fit || 'unknown',
    architectural_fit: row.architectural_fit || 'unknown',
    luxury_fit: row.luxury_fit || 'unknown',
    estimated_fit_score:
      row.estimated_fit_score != null ? Number(row.estimated_fit_score) : null,
    research_source: row.research_source || 'manual',
    founder_summary: row.founder_summary || null,
    why_bht_fit: row.why_bht_fit || [],
    opportunity_summary: row.opportunity_summary || [],
    recommended_founder_action: row.recommended_founder_action || null,
    score_breakdown: score_breakdown || null,
    last_researched_at: row.last_researched_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function rowToResearchRun(row) {
  if (!row) return null;
  let payload = row.payload;
  if (payload != null && typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch (_) {
      payload = {};
    }
  }
  return {
    id: row.id,
    prospect_id: row.prospect_id,
    status: row.status,
    source: row.source,
    input_url: row.input_url || null,
    summary: row.summary || null,
    error_message: row.error_message || null,
    payload: payload || {},
    started_at: row.started_at,
    finished_at: row.finished_at || null,
  };
}

async function assertBuilderProspect(prospectId, db) {
  const r = await db.query(
    `SELECT id, research_status FROM b2b_prospects WHERE id = $1 AND prospect_type = $2`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  if (!r.rows[0]) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  return r.rows[0];
}

async function syncProspectResearchStatus(prospectId, researchStatus, db) {
  if (researchStatus !== 'not_started') return null;
  const r = await db.query(
    `UPDATE b2b_prospects SET research_status = 'researched'
     WHERE id = $1 AND prospect_type = $2 AND research_status = 'not_started'
     RETURNING id, research_status`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  return r.rows[0] || null;
}

async function markProspectResearched(prospectId, db) {
  const r = await db.query(
    `UPDATE b2b_prospects SET research_status = 'researched'
     WHERE id = $1 AND prospect_type = $2
     RETURNING id, research_status`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  return r.rows[0] || null;
}

function normalizeProfileInput(data) {
  const out = {};

  if (data.profile_summary !== undefined) out.profile_summary = trimOrNull(data.profile_summary);
  if (data.builder_focus !== undefined) out.builder_focus = trimOrNull(data.builder_focus);
  if (data.ideal_contact_angle !== undefined) {
    out.ideal_contact_angle = trimOrNull(data.ideal_contact_angle);
  }
  if (data.research_source !== undefined) {
    out.research_source = trimOrNull(data.research_source) || 'manual';
  }

  const arrayFields = [
    'project_types',
    'target_suburbs',
    'quality_signals',
    'risk_signals',
    'why_bht_fit',
    'opportunity_summary',
  ];
  for (const key of arrayFields) {
    if (data[key] !== undefined) out[key] = parseStringArray(data[key]);
  }

  if (data.founder_summary !== undefined) out.founder_summary = trimOrNull(data.founder_summary);
  if (data.recommended_founder_action !== undefined) {
    out.recommended_founder_action = trimOrNull(data.recommended_founder_action);
  }
  if (data.score_breakdown !== undefined) {
    out.score_breakdown = parseScoreBreakdown(data.score_breakdown);
  }

  const fitFields = ['smart_home_fit', 'architectural_fit', 'luxury_fit'];
  for (const key of fitFields) {
    if (data[key] !== undefined) {
      out[key] = assertEnum(data[key], FIT_LEVELS, key) || 'unknown';
    }
  }

  if (data.estimated_fit_score !== undefined) {
    out.estimated_fit_score = parseFitScore(data.estimated_fit_score);
  }

  return out;
}

async function getBuilderProfile(prospectId, options = {}) {
  const db = options.db || pool;
  await assertBuilderProspect(prospectId, db);
  const r = await db.query(`SELECT * FROM builder_profiles WHERE prospect_id = $1`, [prospectId]);
  return rowToProfile(r.rows[0]);
}

async function upsertBuilderProfile(prospectId, data, options = {}) {
  const db = options.db || pool;
  const prospect = await assertBuilderProspect(prospectId, db);
  const markResearched = Boolean(data?.mark_researched);
  const input = normalizeProfileInput(data || {});

  if (!Object.keys(input).length && !markResearched) {
    const err = new Error('No valid profile fields to save');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const now = new Date();
  const existing = await db.query(`SELECT id FROM builder_profiles WHERE prospect_id = $1`, [
    prospectId,
  ]);

  let profile;
  if (existing.rows[0]) {
    const fields = { ...input };
    if (Object.keys(input).length || markResearched) {
      fields.last_researched_at = now;
    }
    if (!Object.keys(fields).length) {
      const r = await db.query(`SELECT * FROM builder_profiles WHERE prospect_id = $1`, [
        prospectId,
      ]);
      profile = rowToProfile(r.rows[0]);
    } else {
      const keys = Object.keys(fields);
      const setClauses = keys.map((k, i) => {
        if (k === 'score_breakdown') return `${k} = $${i + 2}::jsonb`;
        return `${k} = $${i + 2}`;
      });
      const values = [prospectId, ...keys.map((k) => {
        if (k === 'score_breakdown' && fields[k] != null) {
          return JSON.stringify(fields[k]);
        }
        return fields[k];
      })];

      const r = await db.query(
        `UPDATE builder_profiles SET ${setClauses.join(', ')}
         WHERE prospect_id = $1 RETURNING *`,
        values
      );
      profile = rowToProfile(r.rows[0]);
    }
  } else {
    const fields = {
      profile_summary: input.profile_summary ?? null,
      builder_focus: input.builder_focus ?? null,
      project_types: input.project_types ?? [],
      target_suburbs: input.target_suburbs ?? [],
      quality_signals: input.quality_signals ?? [],
      risk_signals: input.risk_signals ?? [],
      ideal_contact_angle: input.ideal_contact_angle ?? null,
      smart_home_fit: input.smart_home_fit ?? 'unknown',
      architectural_fit: input.architectural_fit ?? 'unknown',
      luxury_fit: input.luxury_fit ?? 'unknown',
      estimated_fit_score: input.estimated_fit_score ?? null,
      research_source: input.research_source ?? 'manual',
      founder_summary: input.founder_summary ?? null,
      why_bht_fit: input.why_bht_fit ?? [],
      opportunity_summary: input.opportunity_summary ?? [],
      recommended_founder_action: input.recommended_founder_action ?? null,
      score_breakdown: input.score_breakdown ?? null,
      last_researched_at: now,
    };

    const r = await db.query(
      `INSERT INTO builder_profiles (
         prospect_id, profile_summary, builder_focus, project_types, target_suburbs,
         quality_signals, risk_signals, ideal_contact_angle,
         smart_home_fit, architectural_fit, luxury_fit, estimated_fit_score,
         research_source, founder_summary, why_bht_fit, opportunity_summary,
         recommended_founder_action, score_breakdown, last_researched_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19)
       RETURNING *`,
      [
        prospectId,
        fields.profile_summary,
        fields.builder_focus,
        fields.project_types,
        fields.target_suburbs,
        fields.quality_signals,
        fields.risk_signals,
        fields.ideal_contact_angle,
        fields.smart_home_fit,
        fields.architectural_fit,
        fields.luxury_fit,
        fields.estimated_fit_score,
        fields.research_source,
        fields.founder_summary,
        fields.why_bht_fit,
        fields.opportunity_summary,
        fields.recommended_founder_action,
        fields.score_breakdown ? JSON.stringify(fields.score_breakdown) : null,
        fields.last_researched_at,
      ]
    );
    profile = rowToProfile(r.rows[0]);
  }

  let prospectUpdate = null;
  if (markResearched) {
    prospectUpdate = await markProspectResearched(prospectId, db);
  } else if (prospect.research_status === 'not_started') {
    prospectUpdate = await syncProspectResearchStatus(prospectId, prospect.research_status, db);
  }

  return { profile, prospect_research_status: prospectUpdate?.research_status || null };
}

async function listResearchRuns(prospectId, options = {}) {
  const db = options.db || pool;
  await assertBuilderProspect(prospectId, db);
  const limit = Math.min(100, Math.max(1, parseInt(options.limit, 10) || 50));
  const r = await db.query(
    `SELECT * FROM builder_research_runs
     WHERE prospect_id = $1
     ORDER BY started_at DESC
     LIMIT $2`,
    [prospectId, limit]
  );
  return r.rows.map(rowToResearchRun);
}

async function createManualResearchRun(prospectId, data, options = {}) {
  const db = options.db || pool;
  await assertBuilderProspect(prospectId, db);

  const summary = trimOrNull(data?.summary);
  if (!summary) {
    const err = new Error('summary required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  let payload = data?.payload;
  if (payload == null) payload = {};
  if (typeof payload !== 'object' || Array.isArray(payload)) {
    const err = new Error('payload must be an object');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const now = new Date();
  const r = await db.query(
    `INSERT INTO builder_research_runs (
       prospect_id, status, source, input_url, summary, payload, started_at, finished_at
     ) VALUES ($1, 'completed', 'manual', $2, $3, $4::jsonb, $5, $5)
     RETURNING *`,
    [prospectId, trimOrNull(data?.input_url), summary, JSON.stringify(payload), now]
  );

  return rowToResearchRun(r.rows[0]);
}

module.exports = {
  getBuilderProfile,
  upsertBuilderProfile,
  listResearchRuns,
  createManualResearchRun,
  normalizeProfileInput,
  parseStringArray,
  rowToProfile,
  rowToResearchRun,
  PROFILE_UPDATE_FIELDS,
};
