/**
 * Discovery candidate quality scoring (PR9B.3).
 * Starts from confidence_score and applies directory/content penalties.
 */

const LOW_QUALITY_URL_PATHS = [
  '/insights/',
  '/blog/',
  '/blogs/',
  '/news/',
  '/article/',
  '/articles/',
  '/guides/',
];

const LOW_QUALITY_NAME_TERMS = [
  'award winning',
  'best builder',
  'luxury home builder in',
  'home builder in',
  'top builder',
  'guide',
  'blog',
  'article',
];

const LOW_QUALITY_DOMAINS = [
  'oneflare.com.au',
  'hipages.com.au',
  'yellowpages.com.au',
  'buildpilot.com.au',
];

function assignDiscoveryQualityBand(score) {
  const n = Number(score) || 0;
  if (n >= 85) return 'A';
  if (n >= 70) return 'B';
  if (n >= 50) return 'C';
  return 'D';
}

/**
 * @param {object} candidate — normalized or DB row with confidence_score
 */
function calculateDiscoveryQualityScore(candidate) {
  let score = Number(candidate.confidence_score) || 0;

  const url = String(candidate.website || candidate.source_url || '').toLowerCase();
  const name = String(candidate.company_name || '').toLowerCase();

  if (LOW_QUALITY_URL_PATHS.some((path) => url.includes(path))) {
    score -= 40;
  }
  if (LOW_QUALITY_NAME_TERMS.some((term) => name.includes(term))) {
    score -= 40;
  }
  if (LOW_QUALITY_DOMAINS.some((domain) => url.includes(domain))) {
    score -= 50;
  }

  return Math.max(0, score);
}

function applyDiscoveryQuality(candidate) {
  const quality_score = calculateDiscoveryQualityScore(candidate);
  const quality_band = assignDiscoveryQualityBand(quality_score);
  return {
    ...candidate,
    quality_score,
    quality_band,
  };
}

function enrichCandidateQualityFromRow(row) {
  if (!row) return row;
  if (row.quality_score != null && row.quality_band) {
    return row;
  }
  return applyDiscoveryQuality(row);
}

/**
 * @param {Array<object>} candidates
 * @param {object} [run]
 */
function buildDiscoveryRunSummary(candidates, run = {}) {
  const enriched = (candidates || []).map(enrichCandidateQualityFromRow);
  const buildersFound = run.total_found != null ? run.total_found : enriched.length;

  const high_quality = enriched.filter((c) => (c.quality_score || 0) >= 85).length;
  const medium_quality = enriched.filter(
    (c) => (c.quality_score || 0) >= 50 && (c.quality_score || 0) < 85
  ).length;
  const low_quality = enriched.filter((c) => (c.quality_score || 0) < 50).length;

  const top_recommended = enriched
    .filter((c) => c.status === 'candidate' && c.website)
    .sort((a, b) => (b.quality_score || 0) - (a.quality_score || 0))
    .slice(0, 5)
    .map((c) => ({
      id: c.id,
      company_name: c.company_name,
      website: c.website,
      quality_score: c.quality_score,
      quality_band: c.quality_band,
    }));

  const researchable = enriched.some(
    (c) => c.status === 'candidate' && c.website && (c.quality_score || 0) >= 50
  );

  let recommended_founder_action = 'Review and dismiss low quality candidates';
  if (researchable) {
    recommended_founder_action = 'Research Top 10 Builders';
  }

  return {
    builders_found: buildersFound,
    high_quality,
    medium_quality,
    low_quality,
    top_recommended,
    recommended_founder_action,
  };
}

/**
 * Refine founder action when imported prospects have all been researched.
 * @param {object} summary — from buildDiscoveryRunSummary
 * @param {Array<object>} candidates
 * @param {import('pg').Pool|import('pg').PoolClient} db
 */
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

  const researchable = (candidates || []).some(
    (c) => c.status === 'candidate' && c.website && (c.quality_score || 0) >= 50
  );

  if (!researchable && total > 0 && researched === total) {
    return {
      ...summary,
      recommended_founder_action: 'Review Research Results',
    };
  }

  if (!researchable && researched > 0) {
    return {
      ...summary,
      recommended_founder_action: 'Review Research Results',
    };
  }

  return summary;
}

module.exports = {
  LOW_QUALITY_URL_PATHS,
  LOW_QUALITY_NAME_TERMS,
  LOW_QUALITY_DOMAINS,
  assignDiscoveryQualityBand,
  calculateDiscoveryQualityScore,
  applyDiscoveryQuality,
  enrichCandidateQualityFromRow,
  buildDiscoveryRunSummary,
  attachResearchFounderAction,
};
