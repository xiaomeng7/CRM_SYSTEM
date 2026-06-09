/**
 * Builder Discovery Engine service (PR9A).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER, DISCOVERY_CREATE_DEFAULTS } = require('../builderProspectConstants');
const { createBuilderProspect, listBuilderProspects } = require('../builderProspectService');
const { runManualSeedDiscovery } = require('./manualSeedDiscovery');
const { runSearchEngineDiscovery } = require('./searchEngineDiscovery');
const {
  normalizeWebsiteForCompare,
  normalizeCompanyNameForCompare,
} = require('./normalizeBuilderCandidate');

const RUN_SOURCES = ['manual_seed', 'search_engine', 'website_directory'];
const RUN_STATUSES = ['running', 'completed', 'failed'];
const CANDIDATE_STATUSES = ['candidate', 'imported', 'dismissed', 'duplicate'];

function assertRunSource(source) {
  const v = String(source || 'manual_seed').trim();
  if (!RUN_SOURCES.includes(v) && v !== 'web_disabled') {
    const err = new Error(`Invalid discovery source: ${v}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return v === 'web_disabled' ? 'search_engine' : v;
}

async function loadBuilderProspectsForDuplicateCheck(db) {
  const r = await db.query(
    `SELECT id, company_name, website
     FROM b2b_prospects
     WHERE prospect_type = $1`,
    [PROSPECT_TYPE_BUILDER]
  );
  return r.rows;
}

function findMatchingProspect(existingRows, candidate) {
  const web = normalizeWebsiteForCompare(candidate.website);
  const name = normalizeCompanyNameForCompare(candidate.company_name);

  for (const row of existingRows) {
    const rowWeb = normalizeWebsiteForCompare(row.website);
    const rowName = normalizeCompanyNameForCompare(row.company_name);
    if (web && rowWeb && web === rowWeb) return row;
    if (name && rowName && name === rowName) return row;
  }
  return null;
}

function findDuplicateInBatch(seen, candidate) {
  const web = normalizeWebsiteForCompare(candidate.website);
  const name = normalizeCompanyNameForCompare(candidate.company_name);
  if (web && seen.websites.has(web)) return seen.websites.get(web);
  if (name && seen.names.has(name)) return seen.names.get(name);
  return null;
}

function trackBatchCandidate(seen, candidate) {
  const web = normalizeWebsiteForCompare(candidate.website);
  const name = normalizeCompanyNameForCompare(candidate.company_name);
  if (web) seen.websites.set(web, candidate);
  if (name) seen.names.set(name, candidate);
}

async function insertCandidate(db, runId, candidate, status, matchedProspectId = null) {
  const r = await db.query(
    `INSERT INTO builder_discovery_candidates (
       run_id, company_name, website, phone, email, location, suburb,
       source_url, source_name, suggested_builder_type, suggested_project_focus,
       confidence_score, status, matched_prospect_id, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING *`,
    [
      runId,
      candidate.company_name,
      candidate.website,
      candidate.phone,
      candidate.email,
      candidate.location,
      candidate.suburb,
      candidate.source_url,
      candidate.source_name,
      candidate.suggested_builder_type || 'unknown',
      candidate.suggested_project_focus || 'unknown',
      candidate.confidence_score || 0,
      status,
      matchedProspectId,
      JSON.stringify(candidate.payload || {}),
    ]
  );
  return r.rows[0];
}

async function createDiscoveryRun(data, options = {}) {
  const db = options.db || pool;
  const query = String(data.query || '').trim();
  if (!query) {
    const err = new Error('query required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const location = data.location != null ? String(data.location).trim() : null;
  const source = assertRunSource(data.source);
  const seedCandidates = data.seed_candidates || [];

  const runRes = await db.query(
    `INSERT INTO builder_discovery_runs (query, location, source, status)
     VALUES ($1, $2, $3, 'running')
     RETURNING *`,
    [query, location || null, source]
  );
  const run = runRes.rows[0];

  try {
    let discoveryResult;
    if (source === 'manual_seed') {
      discoveryResult = runManualSeedDiscovery({ query, location, seed_candidates: seedCandidates });
    } else if (source === 'search_engine') {
      discoveryResult = await runSearchEngineDiscovery({ query, location });
      if (!discoveryResult.ok && discoveryResult.reason === 'web_discovery_disabled') {
        await db.query(
          `UPDATE builder_discovery_runs
           SET status = 'completed', total_found = 0, completed_at = now(),
               error_message = $2
           WHERE id = $1`,
          [run.id, discoveryResult.reason]
        );
        const updated = await getDiscoveryRunById(run.id, { db });
        return { run: updated.run, candidates: [], web_discovery_disabled: true };
      }
      if (!discoveryResult.ok) {
        await db.query(
          `UPDATE builder_discovery_runs
           SET status = 'failed', error_message = $2, completed_at = now()
           WHERE id = $1`,
          [run.id, discoveryResult.reason || 'discovery_failed']
        );
        const err = new Error(discoveryResult.reason || 'Discovery failed');
        err.code = 'DISCOVERY_FAILED';
        throw err;
      }
    } else {
      discoveryResult = runManualSeedDiscovery({ query, location, seed_candidates: seedCandidates });
    }

    const existingProspects = await loadBuilderProspectsForDuplicateCheck(db);
    const seen = { websites: new Map(), names: new Map() };
    const stored = [];

    for (const candidate of discoveryResult.candidates || []) {
      const existing = findMatchingProspect(existingProspects, candidate);
      if (existing) {
        stored.push(await insertCandidate(db, run.id, candidate, 'duplicate', existing.id));
        continue;
      }

      const batchDup = findDuplicateInBatch(seen, candidate);
      if (batchDup) {
        stored.push(await insertCandidate(db, run.id, candidate, 'duplicate', null));
        continue;
      }

      trackBatchCandidate(seen, candidate);
      stored.push(await insertCandidate(db, run.id, candidate, 'candidate', null));
    }

    await db.query(
      `UPDATE builder_discovery_runs
       SET status = 'completed', total_found = $2, completed_at = now()
       WHERE id = $1`,
      [run.id, stored.length]
    );

    const updated = await getDiscoveryRunById(run.id, { db });
    return { run: updated.run, candidates: stored };
  } catch (err) {
    await db.query(
      `UPDATE builder_discovery_runs
       SET status = 'failed', error_message = $2, completed_at = now()
       WHERE id = $1`,
      [run.id, err.message || 'Discovery failed']
    );
    throw err;
  }
}

async function listDiscoveryRuns(filters = {}, options = {}) {
  const db = options.db || pool;
  const limit = Math.min(Math.max(parseInt(filters.limit, 10) || 20, 1), 100);
  const r = await db.query(
    `SELECT *
     FROM builder_discovery_runs
     ORDER BY created_at DESC
     LIMIT $1`,
    [limit]
  );
  return { runs: r.rows, count: r.rows.length };
}

async function getDiscoveryRunById(id, options = {}) {
  const db = options.db || pool;
  const runRes = await db.query(`SELECT * FROM builder_discovery_runs WHERE id = $1`, [id]);
  const run = runRes.rows[0];
  if (!run) {
    const err = new Error('Discovery run not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const candidatesRes = await db.query(
    `SELECT *
     FROM builder_discovery_candidates
     WHERE run_id = $1
     ORDER BY confidence_score DESC, company_name ASC`,
    [id]
  );
  return { run, candidates: candidatesRes.rows };
}

async function getCandidateById(id, options = {}) {
  const db = options.db || pool;
  const r = await db.query(`SELECT * FROM builder_discovery_candidates WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

async function importDiscoveryCandidate(candidateId, options = {}) {
  const db = options.db || pool;
  const candidate = await getCandidateById(candidateId, { db });
  if (!candidate) {
    const err = new Error('Discovery candidate not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (candidate.status === 'imported') {
    const err = new Error('Candidate already imported');
    err.code = 'ALREADY_IMPORTED';
    throw err;
  }
  if (candidate.status === 'dismissed') {
    const err = new Error('Candidate was dismissed');
    err.code = 'DISMISSED';
    throw err;
  }

  const existingProspects = await loadBuilderProspectsForDuplicateCheck(db);
  const existing = findMatchingProspect(existingProspects, candidate);
  if (existing || candidate.status === 'duplicate') {
    await db.query(
      `UPDATE builder_discovery_candidates
       SET status = 'duplicate', matched_prospect_id = $2, updated_at = now()
       WHERE id = $1`,
      [candidateId, existing ? existing.id : candidate.matched_prospect_id]
    );
    const err = new Error('Duplicate builder — not imported');
    err.code = 'DUPLICATE';
    err.matched_prospect_id = existing ? existing.id : candidate.matched_prospect_id;
    throw err;
  }

  if (!candidate.website) {
    const err = new Error('website required to import candidate');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const runRes = await db.query(`SELECT * FROM builder_discovery_runs WHERE id = $1`, [candidate.run_id]);
  const run = runRes.rows[0];
  const sourceDetail = [run?.query, candidate.source_url].filter(Boolean).join(' | ');

  const prospect = await createBuilderProspect(
    {
      company_name: candidate.company_name,
      website: candidate.website,
      phone: candidate.phone,
      email: candidate.email,
      suburb: candidate.suburb,
      source: 'discovery',
      source_detail: sourceDetail || run?.query || null,
      builder_type: candidate.suggested_builder_type || 'unknown',
      project_focus: candidate.suggested_project_focus || 'unknown',
      builder_status: DISCOVERY_CREATE_DEFAULTS.builder_status,
      relationship_strength: DISCOVERY_CREATE_DEFAULTS.relationship_strength,
      relationship_stage: DISCOVERY_CREATE_DEFAULTS.relationship_stage,
      opportunity_potential: DISCOVERY_CREATE_DEFAULTS.opportunity_potential,
      timing_status: DISCOVERY_CREATE_DEFAULTS.timing_status,
      research_status: 'not_started',
      fit_priority: 'unknown',
    },
    { db }
  );

  await db.query(
    `UPDATE builder_discovery_candidates
     SET status = 'imported', matched_prospect_id = $2, updated_at = now()
     WHERE id = $1`,
    [candidateId, prospect.id]
  );

  await db.query(
    `UPDATE builder_discovery_runs
     SET imported_count = imported_count + 1
     WHERE id = $1`,
    [candidate.run_id]
  );

  const updatedCandidate = await getCandidateById(candidateId, { db });
  return { candidate: updatedCandidate, prospect };
}

async function importSelectedCandidates(candidateIds, options = {}) {
  if (!Array.isArray(candidateIds) || !candidateIds.length) {
    const err = new Error('candidate_ids required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const results = [];
  const errors = [];

  for (const id of candidateIds) {
    try {
      const result = await importDiscoveryCandidate(id, options);
      results.push({ id, ok: true, prospect_id: result.prospect.id });
    } catch (err) {
      errors.push({
        id,
        ok: false,
        error: err.message,
        code: err.code,
        matched_prospect_id: err.matched_prospect_id || null,
      });
    }
  }

  return { imported: results, errors, imported_count: results.length };
}

async function dismissDiscoveryCandidate(candidateId, options = {}) {
  const db = options.db || pool;
  const candidate = await getCandidateById(candidateId, { db });
  if (!candidate) {
    const err = new Error('Discovery candidate not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (candidate.status === 'imported') {
    const err = new Error('Cannot dismiss imported candidate');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const r = await db.query(
    `UPDATE builder_discovery_candidates
     SET status = 'dismissed', updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [candidateId]
  );
  return r.rows[0];
}

async function dismissSelectedCandidates(candidateIds, options = {}) {
  if (!Array.isArray(candidateIds) || !candidateIds.length) {
    const err = new Error('candidate_ids required');
    err.code = 'INVALID_INPUT';
    throw err;
  }
  const dismissed = [];
  for (const id of candidateIds) {
    try {
      dismissed.push(await dismissDiscoveryCandidate(id, options));
    } catch (_) {
      /* skip non-dismissible */
    }
  }
  return { dismissed, count: dismissed.length };
}

module.exports = {
  RUN_SOURCES,
  RUN_STATUSES,
  CANDIDATE_STATUSES,
  createDiscoveryRun,
  listDiscoveryRuns,
  getDiscoveryRunById,
  getCandidateById,
  importDiscoveryCandidate,
  importSelectedCandidates,
  dismissDiscoveryCandidate,
  dismissSelectedCandidates,
  findMatchingProspect,
  loadBuilderProspectsForDuplicateCheck,
};
