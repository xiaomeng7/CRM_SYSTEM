/**
 * Batch import + website research for discovery candidates (PR9B.3).
 * Uses existing importDiscoveryCandidate and runBuilderResearch — no changes to those engines.
 */

const { pool } = require('../../../lib/db');
const { runBuilderResearch } = require('../runBuilderResearch');
const {
  importDiscoveryCandidate,
  getCandidateById,
  getDiscoveryRunById,
} = require('./builderDiscoveryService');
const { enrichCandidateQualityFromRow } = require('./discoveryQualityScore');

async function resolveProspectIdForCandidate(candidateId, options = {}) {
  const candidate = await getCandidateById(candidateId, options);
  if (!candidate) {
    const err = new Error('Discovery candidate not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  if (candidate.status === 'imported' && candidate.matched_prospect_id) {
    return { candidate, prospectId: candidate.matched_prospect_id, imported: false };
  }

  if (candidate.status !== 'candidate') {
    const err = new Error(`Cannot research candidate with status: ${candidate.status}`);
    err.code = 'INVALID_INPUT';
    throw err;
  }

  if (!candidate.website) {
    const err = new Error('website required to research candidate');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const result = await importDiscoveryCandidate(candidateId, options);
  return {
    candidate: result.candidate,
    prospectId: result.prospect.id,
    imported: true,
    prospect: result.prospect,
  };
}

/**
 * Import (if needed) then run website research for each candidate id.
 */
async function researchDiscoveryCandidates(candidateIds, options = {}) {
  if (!Array.isArray(candidateIds) || !candidateIds.length) {
    const err = new Error('candidate_ids required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const researched = [];
  const errors = [];

  for (const id of candidateIds) {
    try {
      const resolved = await resolveProspectIdForCandidate(id, options);
      const researchRunner = options.researchRunner || runBuilderResearch;
      const researchResult = await researchRunner(resolved.prospectId, options);
      researched.push({
        candidate_id: id,
        prospect_id: resolved.prospectId,
        imported: resolved.imported,
        ok: true,
        fit_score: researchResult.analysis?.estimated_fit_score ?? null,
        fit_band: researchResult.analysis?.fit_band ?? null,
      });
    } catch (err) {
      errors.push({
        candidate_id: id,
        ok: false,
        error: err.message,
        code: err.code || null,
      });
    }
  }

  return {
    researched,
    errors,
    researched_count: researched.length,
    error_count: errors.length,
  };
}

/**
 * Top N candidates in a run by quality_score (importable with website).
 */
async function researchTopDiscoveryCandidates(runId, limit = 10, options = {}) {
  const { candidates } = await getDiscoveryRunById(runId, options);
  const ids = candidates
    .map(enrichCandidateQualityFromRow)
    .filter((c) => c.status === 'candidate' && c.website)
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    .slice(0, Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25))
    .map((c) => c.id);

  if (!ids.length) {
    const err = new Error('No researchable candidates in this run');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const batch = await researchDiscoveryCandidates(ids, options);
  return { ...batch, candidate_ids: ids, run_id: runId };
}

module.exports = {
  researchDiscoveryCandidates,
  researchTopDiscoveryCandidates,
  resolveProspectIdForCandidate,
};
