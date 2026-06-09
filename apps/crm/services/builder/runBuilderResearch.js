/**
 * Builder website research orchestrator (PR8D).
 * Single prospect only — fetch → extract → analyze → persist.
 */

const { pool } = require('../../lib/db');
const { PROSPECT_TYPE_BUILDER } = require('./builderProspectConstants');
const { upsertBuilderProfile, rowToProfile, rowToResearchRun } = require('./builderProfileService');
const { fetchBuilderWebsite } = require('./research/fetchBuilderWebsite');
const { extractWebsiteText } = require('./research/extractWebsiteText');
const { analyzeBuilderWebsite, fitPriorityFromScore } = require('./research/analyzeBuilderWebsite');

const SOURCE = 'website_fetch';

async function getBuilderProspectForResearch(prospectId, db) {
  const r = await db.query(
    `SELECT id, company_name, website, suburb, research_status, fit_priority, relationship_stage
     FROM b2b_prospects
     WHERE id = $1 AND prospect_type = $2`,
    [prospectId, PROSPECT_TYPE_BUILDER]
  );
  if (!r.rows[0]) {
    const err = new Error('Builder prospect not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const prospect = r.rows[0];
  if (!prospect.website || !String(prospect.website).trim()) {
    const err = new Error('Builder prospect has no website URL');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return prospect;
}

async function insertRunningRun(prospectId, inputUrl, db) {
  const r = await db.query(
    `INSERT INTO builder_research_runs (prospect_id, status, source, input_url, started_at)
     VALUES ($1, 'running', $2, $3, NOW())
     RETURNING *`,
    [prospectId, SOURCE, inputUrl]
  );
  return rowToResearchRun(r.rows[0]);
}

async function finishRun(runId, fields, db) {
  const r = await db.query(
    `UPDATE builder_research_runs SET
       status = $2,
       summary = $3,
       error_message = $4,
       payload = $5::jsonb,
       finished_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [
      runId,
      fields.status,
      fields.summary || null,
      fields.error_message || null,
      JSON.stringify(fields.payload || {}),
    ]
  );
  return rowToResearchRun(r.rows[0]);
}

async function updateProspectAfterResearch(prospectId, analysis, db) {
  const fit_priority = fitPriorityFromScore(analysis.estimated_fit_score);
  const r = await db.query(
    `UPDATE b2b_prospects SET
       research_status = 'researched',
       fit_priority = $2
     WHERE id = $1 AND prospect_type = $3
     RETURNING id, research_status, fit_priority, relationship_stage`,
    [prospectId, fit_priority, PROSPECT_TYPE_BUILDER]
  );
  return r.rows[0];
}

/**
 * @param {string} prospectId
 * @param {object} [options]
 * @param {import('pg').Pool|import('pg').PoolClient} [options.db]
 * @param {boolean} [options.force=false]
 * @param {function} [options.fetchBuilderWebsite]
 * @param {function} [options.analyzeBuilderWebsite]
 * @param {boolean} [options.useLlm] — default true when OPENAI_API_KEY set
 * @param {function} [options.log]
 */
async function runBuilderResearch(prospectId, options = {}) {
  const db = options.db || pool;
  const log = options.log || (() => {});
  const fetchFn = options.fetchBuilderWebsite || fetchBuilderWebsite;
  const analyzeFn = options.analyzeBuilderWebsite || analyzeBuilderWebsite;
  const useLlm = options.useLlm !== false;

  const prospect = await getBuilderProspectForResearch(prospectId, db);
  const website = String(prospect.website).trim();

  const run = await insertRunningRun(prospectId, website, db);
  log(`[builder-research] started run=${run.id} prospect=${prospectId}`);

  try {
    const fetched = await fetchFn(website, options);
    const extracted = extractWebsiteText(fetched.pages);
    if (!extracted.combined_text || extracted.total_chars < 50) {
      const err = new Error('Insufficient website text extracted');
      err.code = 'ANALYSIS_FAILED';
      throw err;
    }

    const analysis = await analyzeFn({
      combined_text: extracted.combined_text,
      snippets: extracted.snippets,
      company_name: prospect.company_name,
      website_url: fetched.homepage_url,
      useLlm,
    });

    const profileResult = await upsertBuilderProfile(prospectId, {
      profile_summary: analysis.profile_summary,
      builder_focus: analysis.builder_focus,
      project_types: analysis.project_types,
      target_suburbs: analysis.target_suburbs.length
        ? analysis.target_suburbs
        : undefined,
      quality_signals: analysis.quality_signals,
      risk_signals: analysis.risk_signals,
      ideal_contact_angle: analysis.ideal_contact_angle,
      smart_home_fit: analysis.smart_home_fit,
      architectural_fit: analysis.architectural_fit,
      luxury_fit: analysis.luxury_fit,
      estimated_fit_score: analysis.estimated_fit_score,
      research_source: analysis.research_source,
    }, { db });

    const updatedProspect = await updateProspectAfterResearch(prospectId, analysis, db);

    const payload = {
      fetched_urls: fetched.pages.map((p) => p.url),
      detected_signals: {
        quality: analysis.quality_signals,
        risks: analysis.risk_signals,
      },
      score_breakdown: analysis.score_breakdown,
      snippets: extracted.snippets,
    };

    const completedRun = await finishRun(
      run.id,
      {
        status: 'completed',
        summary: `Website research completed. Fit score ${analysis.estimated_fit_score}/100 (${analysis.research_source}).`,
        payload,
      },
      db
    );

    log(`[builder-research] completed score=${analysis.estimated_fit_score}`);

    return {
      ok: true,
      prospect: updatedProspect,
      profile: profileResult.profile,
      run: completedRun,
      analysis: {
        estimated_fit_score: analysis.estimated_fit_score,
        fit_priority: updatedProspect.fit_priority,
        research_source: analysis.research_source,
        quality_signals: analysis.quality_signals,
        risk_signals: analysis.risk_signals,
      },
    };
  } catch (err) {
    const message = err.message || 'Research failed';
    log(`[builder-research] failed: ${message}`);

    const failedRun = await finishRun(
      run.id,
      {
        status: 'failed',
        summary: message.slice(0, 500),
        error_message: message.slice(0, 1000),
        payload: {
          error_code: err.code || 'RESEARCH_FAILED',
        },
      },
      db
    );

    const wrapped = new Error(message);
    wrapped.code = err.code || 'RESEARCH_FAILED';
    wrapped.run = failedRun;
    throw wrapped;
  }
}

module.exports = {
  runBuilderResearch,
  getBuilderProspectForResearch,
  updateProspectAfterResearch,
  SOURCE,
};
