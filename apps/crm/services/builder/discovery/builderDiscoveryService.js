/**
 * Builder Discovery Engine service (PR9A + PR9B.1).
 */

const { pool } = require('../../../lib/db');
const { PROSPECT_TYPE_BUILDER, DISCOVERY_CREATE_DEFAULTS } = require('../builderProspectConstants');
const { createBuilderProspect } = require('../builderProspectService');
const { runDiscovery } = require('./runDiscovery');
const {
  normalizeProviderSource,
  listProviders,
  PROVIDER_SOURCES,
} = require('./providers/providerRegistry');
const {
  normalizeWebsiteForCompare,
  normalizeCompanyNameForCompare,
  normalizePhoneForCompare,
} = require('./normalizeBuilderCandidate');
const {
  classifyDiscoveryCandidate,
  enrichCandidateQualityFromRow,
  buildDiscoveryRunSummary,
  attachResearchFounderAction,
} = require('./discoveryQualityScore');
const { buildDiscoveryExhaustionGuidance } = require('./discoverySearchGuidance');

const RUN_STATUSES = ['running', 'completed', 'failed'];
const CANDIDATE_STATUSES = ['candidate', 'imported', 'dismissed', 'duplicate'];

function assertRunSource(source) {
  const normalized = normalizeProviderSource(source);
  if (!PROVIDER_SOURCES.includes(normalized)) {
    const err = new Error(`Invalid discovery source: ${source}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }
  return normalized;
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
  const phone = normalizePhoneForCompare(candidate.phone);

  for (const row of existingRows) {
    const rowWeb = normalizeWebsiteForCompare(row.website);
    const rowName = normalizeCompanyNameForCompare(row.company_name);
    const rowPhone = normalizePhoneForCompare(row.phone);
    if (web && rowWeb && web === rowWeb) return row;
    if (name && rowName && name === rowName) return row;
    if (phone && rowPhone && phone === rowPhone) return row;
  }
  return null;
}

function findDuplicateInBatch(seen, candidate) {
  const web = normalizeWebsiteForCompare(candidate.website);
  const name = normalizeCompanyNameForCompare(candidate.company_name);
  const phone = normalizePhoneForCompare(candidate.phone);
  if (web && seen.websites.has(web)) return seen.websites.get(web);
  if (name && seen.names.has(name)) return seen.names.get(name);
  if (phone && seen.phones.has(phone)) return seen.phones.get(phone);
  return null;
}

function trackBatchCandidate(seen, candidate) {
  const web = normalizeWebsiteForCompare(candidate.website);
  const name = normalizeCompanyNameForCompare(candidate.company_name);
  const phone = normalizePhoneForCompare(candidate.phone);
  if (web) seen.websites.set(web, candidate);
  if (name) seen.names.set(name, candidate);
  if (phone) seen.phones.set(phone, candidate);
}

async function insertCandidate(
  db,
  runId,
  candidate,
  status,
  matchedProspectId = null,
  existingProspects = []
) {
  const classified = classifyDiscoveryCandidate(candidate, {
    status,
    matched_prospect_id: matchedProspectId,
    existingProspects,
  });
  const r = await db.query(
    `INSERT INTO builder_discovery_candidates (
       run_id, company_name, website, phone, email, location, suburb,
       source_url, source_name, suggested_builder_type, suggested_project_focus,
       confidence_score, quality_score, quality_band, candidate_type, hidden, hide_reason,
       status, matched_prospect_id, payload
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
     RETURNING *`,
    [
      runId,
      classified.company_name,
      classified.website,
      classified.phone,
      classified.email,
      classified.location,
      classified.suburb,
      classified.source_url,
      classified.source_name,
      classified.suggested_builder_type || 'unknown',
      classified.suggested_project_focus || 'unknown',
      classified.confidence_score || 0,
      classified.quality_score || 0,
      classified.quality_band || null,
      classified.candidate_type || 'builder',
      Boolean(classified.hidden),
      classified.hide_reason || null,
      status,
      matchedProspectId,
      JSON.stringify(classified.payload || {}),
    ]
  );
  return r.rows[0];
}

async function storeDiscoveryCandidates(db, runId, candidates) {
  const existingProspects = await loadBuilderProspectsForDuplicateCheck(db);
  const seen = { websites: new Map(), names: new Map(), phones: new Map() };
  const stored = [];

  for (const candidate of candidates || []) {
    const existing = findMatchingProspect(existingProspects, candidate);
    if (existing) {
      stored.push(
        await insertCandidate(db, runId, candidate, 'duplicate', existing.id, existingProspects)
      );
      continue;
    }

    const batchDup = findDuplicateInBatch(seen, candidate);
    if (batchDup) {
      stored.push(await insertCandidate(db, runId, candidate, 'duplicate', null, existingProspects));
      continue;
    }

    trackBatchCandidate(seen, candidate);
    stored.push(await insertCandidate(db, runId, candidate, 'candidate', null, existingProspects));
  }

  return stored;
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
    const discoveryResult = await runDiscovery({
      source,
      query,
      location,
      limit: data.limit,
      seed_candidates: seedCandidates,
    });

    if (!discoveryResult.ok) {
      const reason = discoveryResult.reason || 'discovery_failed';
      await db.query(
        `UPDATE builder_discovery_runs
         SET status = 'completed', total_found = 0, completed_at = now(), error_message = $2
         WHERE id = $1`,
        [run.id, reason]
      );
      const updated = await getDiscoveryRunById(run.id, { db });
      return {
        run: updated.run,
        candidates: [],
        provider: discoveryResult.provider,
        provider_disabled:
          reason === 'provider_not_enabled' ||
          reason === 'web_discovery_disabled' ||
          reason === 'serpapi_not_configured',
        reason,
      };
    }

    const stored = await storeDiscoveryCandidates(db, run.id, discoveryResult.candidates);

    await db.query(
      `UPDATE builder_discovery_runs
       SET status = 'completed', total_found = $2, completed_at = now()
       WHERE id = $1`,
      [run.id, stored.length]
    );

    const updated = await getDiscoveryRunById(run.id, { db });
    return {
      run: updated.run,
      candidates: updated.candidates,
      summary: updated.summary,
      exhaustion: updated.exhaustion,
      provider: discoveryResult.provider,
    };
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

function mapCandidatesWithQuality(rows, existingProspects = null) {
  return (rows || []).map((row) => enrichCandidateQualityFromRow(row, existingProspects));
}

async function getDiscoveryRunSummary(runId, options = {}) {
  return getDiscoveryRunById(runId, options);
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
  const existingProspects = await loadBuilderProspectsForDuplicateCheck(db);
  const candidatesRes = await db.query(
    `SELECT *
     FROM builder_discovery_candidates
     WHERE run_id = $1
     ORDER BY hidden ASC, quality_score DESC NULLS LAST, confidence_score DESC, company_name ASC`,
    [id]
  );
  const candidates = mapCandidatesWithQuality(candidatesRes.rows, existingProspects);
  let summary = buildDiscoveryRunSummary(candidates, run);
  summary = await attachResearchFounderAction(summary, candidates, db);
  const exhaustion = buildDiscoveryExhaustionGuidance(run, summary);
  if (exhaustion.exhausted && exhaustion.recommended_founder_action) {
    summary = {
      ...summary,
      recommended_founder_action: exhaustion.recommended_founder_action,
    };
  }
  return { run, candidates, summary, exhaustion };
}

async function getDiscoveryDashboard(options = {}) {
  const db = options.db || pool;

  const [
    runsRes,
    candidatesRes,
    importedRes,
    dismissedRes,
    researchPendingRes,
    topTypesRes,
  ] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS cnt FROM builder_discovery_runs`),
    db.query(`SELECT COUNT(*)::int AS cnt FROM builder_discovery_candidates`),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM builder_discovery_candidates WHERE status = 'imported'`
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt FROM builder_discovery_candidates WHERE status = 'dismissed'`
    ),
    db.query(
      `SELECT COUNT(*)::int AS cnt
       FROM b2b_prospects
       WHERE prospect_type = $1
         AND source = 'discovery'
         AND research_status = 'not_started'`,
      [PROSPECT_TYPE_BUILDER]
    ),
    db.query(
      `SELECT suggested_builder_type AS builder_type, COUNT(*)::int AS cnt
       FROM builder_discovery_candidates
       WHERE suggested_builder_type IS NOT NULL
       GROUP BY suggested_builder_type
       ORDER BY cnt DESC, suggested_builder_type ASC
       LIMIT 8`
    ),
  ]);

  return {
    discovery_runs: runsRes.rows[0]?.cnt || 0,
    candidates_found: candidatesRes.rows[0]?.cnt || 0,
    builders_found: candidatesRes.rows[0]?.cnt || 0,
    imported: importedRes.rows[0]?.cnt || 0,
    builders_imported: importedRes.rows[0]?.cnt || 0,
    dismissed: dismissedRes.rows[0]?.cnt || 0,
    research_pending: researchPendingRes.rows[0]?.cnt || 0,
    builders_pending_research: researchPendingRes.rows[0]?.cnt || 0,
    top_builder_types: topTypesRes.rows,
    providers: listProviders(),
  };
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
  RUN_SOURCES: PROVIDER_SOURCES,
  RUN_STATUSES,
  CANDIDATE_STATUSES,
  createDiscoveryRun,
  listDiscoveryRuns,
  getDiscoveryRunById,
  getDiscoveryRunSummary,
  getDiscoveryDashboard,
  getCandidateById,
  importDiscoveryCandidate,
  importSelectedCandidates,
  dismissDiscoveryCandidate,
  dismissSelectedCandidates,
  findMatchingProspect,
  loadBuilderProspectsForDuplicateCheck,
  storeDiscoveryCandidates,
};
