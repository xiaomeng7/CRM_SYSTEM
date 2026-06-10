/**
 * Unified discovery pipeline (PR9B.1).
 * Provider → normalize → return normalized candidates (dedupe/store handled by service).
 */

const discoveryConfig = require('../../../config/builder-discovery');
const { getProvider } = require('./providers/providerRegistry');
const { assertProviderResult } = require('./providers/baseProvider');
const { normalizeBuilderCandidate } = require('./normalizeBuilderCandidate');

/**
 * @param {object} params
 * @param {string} params.source
 * @param {string} params.query
 * @param {string} [params.location]
 * @param {number} [params.limit]
 * @param {Array<object>} [params.seed_candidates]
 */
async function runDiscovery(params = {}) {
  const source = params.source || 'manual_seed';
  const query = String(params.query || '').trim();
  const location = params.location != null ? String(params.location).trim() : null;
  const limit = params.limit || discoveryConfig.default_limit || 25;

  if (!query) {
    const err = new Error('query required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const provider = getProvider(source);
  const rawResult = await provider.discoverBuilders({
    query,
    location,
    limit,
    seed_candidates: params.seed_candidates || [],
  });

  assertProviderResult(rawResult, provider.name);

  if (!rawResult.ok) {
    return {
      ok: false,
      provider: rawResult.provider,
      reason: rawResult.reason || 'discovery_failed',
      candidates: [],
      total_found: 0,
    };
  }

  const context = { query, location };
  const normalized = [];
  for (const row of rawResult.candidates) {
    if (!row.company_name) continue;
    const base = normalizeBuilderCandidate(
      {
        company_name: row.company_name,
        website: row.website,
        phone: row.phone,
        email: row.email,
        location: row.location,
        suburb: row.suburb,
        source_url: row.source_url,
        source_name: row.source_name || provider.name,
      },
      context
    );
    const rawMeta = row.raw || {};
    base.payload = {
      ...(base.payload || {}),
      provider: provider.name,
      raw_source: rawMeta.raw_source || (provider.name === 'serpapi' ? 'serpapi' : null),
      query: context.query,
      location: context.location,
      google_rating: rawMeta.google_rating != null ? rawMeta.google_rating : null,
      google_reviews: rawMeta.google_reviews != null ? rawMeta.google_reviews : null,
      raw: rawMeta,
    };
    normalized.push(base);
  }

  return {
    ok: true,
    provider: provider.name,
    candidates: normalized,
    total_found: normalized.length,
  };
}

module.exports = {
  runDiscovery,
};
