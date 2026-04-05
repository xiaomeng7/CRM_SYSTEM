/**
 * Landing page anonymous behavior: ingest + aggregate for Growth dashboard (V1).
 */

const { pool } = require('../lib/db');

const ALLOWED_EVENTS = new Set(['page_view', 'scroll_50', 'form_start', 'form_submit']);
const MAX_LEN = 256;

function trimOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.length > MAX_LEN ? s.slice(0, MAX_LEN) : s;
}

function parseDateRange(filters = {}) {
  const dateFrom = filters.date_from ? String(filters.date_from).trim() : null;
  const dateTo = filters.date_to ? String(filters.date_to).trim() : null;
  return { dateFrom, dateTo };
}

/**
 * @param {object} body
 * @param {import('pg').Pool} [db]
 */
async function recordLpEvent(body, db = pool) {
  const sessionId = trimOrNull(body?.session_id);
  const eventType = trimOrNull(body?.event_type);
  if (!sessionId || sessionId.length > 200) {
    const e = new Error('session_id required');
    e.code = 'VALIDATION';
    throw e;
  }
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) {
    const e = new Error('event_type must be one of: page_view, scroll_50, form_start, form_submit');
    e.code = 'VALIDATION';
    throw e;
  }
  const landing_page_version = trimOrNull(body?.landing_page_version);
  const creative_version = trimOrNull(body?.creative_version);
  const utm_campaign = trimOrNull(body?.utm_campaign);

  await db.query(
    `INSERT INTO lp_events (session_id, event_type, landing_page_version, creative_version, utm_campaign)
     VALUES ($1, $2, $3, $4, $5)`,
    [sessionId, eventType, landing_page_version, creative_version, utm_campaign]
  );
  return { ok: true };
}

function computeDropOffStage(row) {
  const pv = Number(row.page_views) || 0;
  const s50 = Number(row.scroll_50) || 0;
  const fs = Number(row.form_start) || 0;
  const sub = Number(row.form_submit) || 0;
  if (pv < 10) {
    return { drop_off_stage: 'insufficient_data', drop_off_hint: '样本不足（浏览会话≥10 后再判断）' };
  }
  const scrollRate = s50 / pv;
  const startPerScroll = s50 > 0 ? fs / s50 : 0;
  const submitRate = fs > 0 ? sub / fs : 0;

  if (scrollRate < 0.32) {
    return { drop_off_stage: 'headline', drop_off_hint: '👉 headline（首屏/标题吸引力）' };
  }
  if (scrollRate >= 0.32 && s50 >= 5 && startPerScroll < 0.22) {
    return { drop_off_stage: 'cta', drop_off_hint: '👉 CTA（引导至表单）' };
  }
  if (fs >= 4 && submitRate < 0.4) {
    return { drop_off_stage: 'form', drop_off_hint: '👉 form（表单摩擦/字段）' };
  }
  return { drop_off_stage: 'ok', drop_off_hint: '暂无明显瓶颈' };
}

const SUGGESTION_DEFAULT = {
  problem_title: '表现正常',
  problem_description: '暂无明显问题',
  action_text: '继续观察或测试新版本',
  example_text: '',
};

/**
 * Turn LP behavior metrics into staff-facing copy (non-technical).
 * @param {object} row
 * @param {string} [row.landing_page_version]
 * @param {number|null} [row.scroll_rate_pct]
 * @param {number|null} [row.form_start_rate_pct]
 * @param {number|null} [row.submit_rate_pct]
 * @param {string} [row.drop_off_stage]
 * @returns {{ problem_title: string, problem_description: string, action_text: string, example_text: string }}
 */
function generateLpSuggestion(row) {
  const scroll = toFiniteNumber(row?.scroll_rate_pct);
  const formStart = toFiniteNumber(row?.form_start_rate_pct);
  const submit = toFiniteNumber(row?.submit_rate_pct);

  if (scroll != null && scroll < 40) {
    return {
      problem_title: '页面开头不吸引人',
      problem_description: '很多用户没有继续往下看',
      action_text: '请优化第一屏标题，让客户感到风险或损失',
      example_text: 'Avoid $5,000 Electrical Issues Before You Buy',
    };
  }
  if (scroll != null && scroll >= 40 && formStart != null && formStart < 20) {
    return {
      problem_title: '缺少行动引导',
      problem_description: '用户看了内容，但没有点击',
      action_text: '请增加明确的按钮或行动提示',
      example_text: 'Book Your Inspection Today',
    };
  }
  if (formStart != null && formStart >= 20 && submit != null && submit < 40) {
    return {
      problem_title: '表单转化低',
      problem_description: '很多用户开始填写，但没有提交',
      action_text: '请减少字段或增强信任',
      example_text: 'Add "No obligation" or reduce inputs',
    };
  }
  return { ...SUGGESTION_DEFAULT };
}

function toFiniteNumber(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} filters - { date_from, date_to }
 * @param {import('pg').Pool} [db]
 */
async function getLpBehavior(filters = {}, db = pool) {
  const { dateFrom, dateTo } = parseDateRange(filters);
  const params = [];
  let i = 1;
  const where = [];
  if (dateFrom) {
    params.push(dateFrom);
    where.push(`created_at >= $${i++}::date`);
  }
  if (dateTo) {
    params.push(dateTo);
    where.push(`created_at < ($${i++}::date + INTERVAL '1 day')`);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await db.query(
    `SELECT
       COALESCE(NULLIF(TRIM(landing_page_version), ''), '(未填)') AS landing_page_version,
       COUNT(DISTINCT CASE WHEN event_type = 'page_view' THEN session_id END)::bigint AS page_views,
       COUNT(DISTINCT CASE WHEN event_type = 'scroll_50' THEN session_id END)::bigint AS scroll_50,
       COUNT(DISTINCT CASE WHEN event_type = 'form_start' THEN session_id END)::bigint AS form_start,
       COUNT(DISTINCT CASE WHEN event_type = 'form_submit' THEN session_id END)::bigint AS form_submit
     FROM lp_events
     ${whereSql}
     GROUP BY 1
     ORDER BY page_views DESC NULLS LAST`,
    params
  );

  return rows.map((r) => {
    const pv = Number(r.page_views) || 0;
    const s50 = Number(r.scroll_50) || 0;
    const fs = Number(r.form_start) || 0;
    const sub = Number(r.form_submit) || 0;
    const scroll_rate_pct = pv > 0 ? Math.round((s50 / pv) * 1000) / 10 : null;
    const form_start_rate_pct = pv > 0 ? Math.round((fs / pv) * 1000) / 10 : null;
    const submit_rate_pct = fs > 0 ? Math.round((sub / fs) * 1000) / 10 : null;
    const stage = computeDropOffStage(r);
    const metrics = {
      landing_page_version: r.landing_page_version,
      scroll_rate_pct,
      form_start_rate_pct,
      submit_rate_pct,
      drop_off_stage: stage.drop_off_stage,
    };
    const suggestion = generateLpSuggestion(metrics);
    return {
      landing_page_version: r.landing_page_version,
      page_views: pv,
      scroll_50: s50,
      form_start: fs,
      form_submit: sub,
      scroll_rate_pct,
      form_start_rate_pct,
      submit_rate_pct,
      drop_off_stage: stage.drop_off_stage,
      drop_off_hint: stage.drop_off_hint,
      suggestion,
    };
  });
}

module.exports = {
  recordLpEvent,
  getLpBehavior,
  generateLpSuggestion,
  ALLOWED_EVENTS,
};
