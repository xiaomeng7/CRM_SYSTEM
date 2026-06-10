/**
 * Discovery candidate quality + cleanup classification (PR9B.3 + PR9B.4A).
 */

const {
  normalizeWebsiteForCompare,
  normalizeCompanyNameForCompare,
} = require('./normalizeBuilderCandidate');

const SEO_URL_PATHS = [
  '/blog/',
  '/news/',
  '/article/',
  '/insights/',
  '/guides/',
  '/resources/',
  '/tips/',
];

const SEO_TITLE_PHRASES = [
  'award winning builders',
  'top builders',
  'best builders',
  'luxury home builder',
  'custom home builder adelaide',
  'architectural builder adelaide',
];

const DIRECTORY_DOMAINS = [
  'oneflare.com.au',
  'hipages.com.au',
  'yellowpages.com.au',
  'service.com.au',
  'buildpilot.com.au',
];

/** @deprecated PR9B.3 — kept for tests */
const LOW_QUALITY_URL_PATHS = SEO_URL_PATHS;
const LOW_QUALITY_NAME_TERMS = SEO_TITLE_PHRASES;
const LOW_QUALITY_DOMAINS = DIRECTORY_DOMAINS;

function assignDiscoveryQualityBand(score) {
  const n = Number(score) || 0;
  if (n >= 85) return 'A';
  if (n >= 70) return 'B';
  if (n >= 50) return 'C';
  return 'D';
}

function candidateUrl(candidate) {
  return String(candidate.website || candidate.source_url || '').toLowerCase();
}

function candidateName(candidate) {
  return String(candidate.company_name || '').toLowerCase();
}

function isDirectoryUrl(url) {
  return DIRECTORY_DOMAINS.some((domain) => url.includes(domain));
}

function isSeoUrl(url) {
  return SEO_URL_PATHS.some((path) => url.includes(path));
}

function isSeoTitle(name) {
  return SEO_TITLE_PHRASES.some((phrase) => name.includes(phrase));
}

function matchesExistingProspect(candidate, existingRows) {
  if (!existingRows || !existingRows.length) return null;
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

function isExistingInCrm(candidate, context = {}) {
  if (context.status === 'duplicate' || context.matched_prospect_id) return true;
  return Boolean(matchesExistingProspect(candidate, context.existingProspects));
}

/**
 * PR9B.3 legacy score — used only when candidate passes hard filters.
 */
function calculateDiscoveryQualityScore(candidate) {
  return Math.max(0, Math.min(100, Number(candidate.confidence_score) || 0));
}

/**
 * Full classification for store + display.
 * @param {object} candidate
 * @param {object} [context]
 * @param {string} [context.status]
 * @param {string} [context.matched_prospect_id]
 * @param {Array<object>} [context.existingProspects]
 */
function classifyDiscoveryCandidate(candidate, context = {}) {
  const url = candidateUrl(candidate);
  const name = candidateName(candidate);
  const base = { ...candidate };

  if (isDirectoryUrl(url)) {
    return {
      ...base,
      candidate_type: 'directory',
      quality_score: 0,
      quality_band: 'D',
      hidden: true,
      hide_reason: 'directory',
    };
  }

  if (isSeoUrl(url)) {
    return {
      ...base,
      candidate_type: 'builder',
      quality_score: 0,
      quality_band: 'D',
      hidden: true,
      hide_reason: 'seo_url',
    };
  }

  if (isSeoTitle(name)) {
    return {
      ...base,
      candidate_type: 'builder',
      quality_score: 0,
      quality_band: 'D',
      hidden: true,
      hide_reason: 'seo_title',
    };
  }

  if (isExistingInCrm(candidate, context)) {
    const quality_score = calculateDiscoveryQualityScore(candidate);
    return {
      ...base,
      candidate_type: 'builder',
      quality_score,
      quality_band: assignDiscoveryQualityBand(quality_score),
      hidden: true,
      hide_reason: 'existing_crm',
      matched_prospect_id:
        context.matched_prospect_id ||
        matchesExistingProspect(candidate, context.existingProspects)?.id ||
        base.matched_prospect_id ||
        null,
    };
  }

  const quality_score = calculateDiscoveryQualityScore(candidate);
  return {
    ...base,
    candidate_type: 'builder',
    quality_score,
    quality_band: assignDiscoveryQualityBand(quality_score),
    hidden: quality_score < 50,
    hide_reason: quality_score < 50 ? 'low_quality' : null,
  };
}

/** @deprecated use classifyDiscoveryCandidate */
function applyDiscoveryQuality(candidate, context = {}) {
  return classifyDiscoveryCandidate(candidate, context);
}

function enrichCandidateQualityFromRow(row, existingProspects = null) {
  if (!row) return row;
  const context = {
    status: row.status,
    matched_prospect_id: row.matched_prospect_id,
    existingProspects,
  };
  const classified = classifyDiscoveryCandidate(row, context);
  return {
    ...row,
    ...classified,
    id: row.id,
    status: row.status,
    run_id: row.run_id,
    payload: row.payload,
  };
}

function isNewVisibleBuilder(candidate) {
  return (
    candidate.status === 'candidate' &&
    candidate.candidate_type !== 'directory' &&
    !candidate.hidden &&
    (candidate.quality_score || 0) >= 50
  );
}

/**
 * @param {Array<object>} candidates
 * @param {object} [run]
 */
function buildDiscoveryRunSummary(candidates, run = {}) {
  const enriched = (candidates || []).map((c) => enrichCandidateQualityFromRow(c));
  const total_results = run.total_found != null ? run.total_found : enriched.length;

  const existing_builders_hidden = enriched.filter(
    (c) => c.hide_reason === 'existing_crm' || c.status === 'duplicate'
  ).length;
  const directories_hidden = enriched.filter(
    (c) => c.candidate_type === 'directory' || c.hide_reason === 'directory'
  ).length;
  const seo_pages_hidden = enriched.filter(
    (c) => c.hide_reason === 'seo_url' || c.hide_reason === 'seo_title'
  ).length;
  const new_builders_remaining = enriched.filter((c) => isNewVisibleBuilder(c)).length;

  const top_recommended = enriched
    .filter((c) => isNewVisibleBuilder(c) && c.website)
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      company_name: c.company_name,
      website: c.website,
      quality_score: c.quality_score,
      quality_band: c.quality_band,
    }));

  let recommended_founder_action = 'Review discovery results';
  if (new_builders_remaining > 0) {
    recommended_founder_action = 'Research Top 10 Builders';
  } else if (existing_builders_hidden > 0 && new_builders_remaining === 0) {
    recommended_founder_action = 'Try a different suburb or search — no new builders in this run';
  }

  return {
    total_results,
    builders_found: total_results,
    existing_builders_hidden,
    directories_hidden,
    seo_pages_hidden,
    new_builders_remaining,
    high_quality: enriched.filter((c) => (c.quality_score || 0) >= 85).length,
    medium_quality: enriched.filter(
      (c) => (c.quality_score || 0) >= 50 && (c.quality_score || 0) < 85
    ).length,
    low_quality: enriched.filter((c) => (c.quality_score || 0) < 50).length,
    top_recommended,
    recommended_founder_action,
  };
}

async function attachResearchFounderAction(summary, candidates, db) {
  const importedIds = (candidates || [])
    .filter((c) => c.status === 'imported' && c.matched_prospect_id)
    .map((c) => c.matched_prospect_id);

  if (!importedIds.length) {
    return summary;
  }

  const r = await db.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE research_status = 'researched')::int AS researched
     FROM b2b_prospects
     WHERE id = ANY($1::uuid[])`,
    [importedIds]
  );
  const { total, researched } = r.rows[0] || { total: 0, researched: 0 };

  if (summary.new_builders_remaining > 0) {
    return summary;
  }

  if (total > 0 && researched === total) {
    return {
      ...summary,
      recommended_founder_action: 'Review Research Results',
    };
  }

  if (researched > 0) {
    return {
      ...summary,
      recommended_founder_action: 'Review Research Results',
    };
  }

  return summary;
}

module.exports = {
  SEO_URL_PATHS,
  SEO_TITLE_PHRASES,
  DIRECTORY_DOMAINS,
  LOW_QUALITY_URL_PATHS,
  LOW_QUALITY_NAME_TERMS,
  LOW_QUALITY_DOMAINS,
  assignDiscoveryQualityBand,
  calculateDiscoveryQualityScore,
  classifyDiscoveryCandidate,
  applyDiscoveryQuality,
  enrichCandidateQualityFromRow,
  isNewVisibleBuilder,
  matchesExistingProspect,
  buildDiscoveryRunSummary,
  attachResearchFounderAction,
};
