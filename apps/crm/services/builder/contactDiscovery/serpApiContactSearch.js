/**
 * Optional public search for builder contacts via SerpAPI (PR10B).
 * Does not scrape LinkedIn — only reads public search snippets.
 */

const discoveryConfig = require('../../../config/builder-discovery');
const { roleFromText, nameLooksValid } = require('./extractContactCandidates');

const SERPAPI_ENDPOINT = 'https://serpapi.com/search.json';

function websiteDomain(website) {
  if (!website) return null;
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, '');
  } catch (_) {
    return null;
  }
}

function extractFromOrganicResult(result, companyName) {
  const title = `${result.title || ''}`.trim();
  const snippet = `${result.snippet || result.description || ''}`.trim();
  const combined = `${title} ${snippet}`.trim();
  if (!combined) return null;

  const role = roleFromText(combined);
  if (!role) return null;

  const nameMatch =
    combined.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})/) ||
    title.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){1,3})/);
  const name = nameMatch ? nameMatch[1] : null;
  if (name && !nameLooksValid(name)) return null;

  return {
    name,
    role,
    email: null,
    phone: null,
    linkedin_url: null,
    confidence_score: 42,
    confidence_band: 'low',
    source_type: 'serpapi',
    source_url: result.link || null,
    reason: `Public search snippet suggests ${role}${name ? `: ${name}` : ''} (${companyName})`,
  };
}

async function searchPublicContacts({ companyName, website, suburb }, options = {}) {
  if (!discoveryConfig.isSerpApiConfigured()) return [];

  const apiKey = process.env.SERPAPI_API_KEY;
  const fetchFn = options.fetch || global.fetch;
  const domain = websiteDomain(website);
  const location = suburb ? `${suburb}, South Australia, Australia` : 'Adelaide, South Australia, Australia';
  const queries = [
    `"${companyName}" director`,
    `"${companyName}" estimator`,
    domain ? `site:${domain} team` : null,
  ].filter(Boolean);

  const candidates = [];
  const seen = new Set();

  for (const q of queries) {
    const params = new URLSearchParams({
      engine: 'google',
      q,
      api_key: apiKey,
      num: '5',
      gl: 'au',
      hl: 'en',
      location,
    });

    let response;
    try {
      response = await fetchFn(`${SERPAPI_ENDPOINT}?${params.toString()}`);
    } catch (_) {
      continue;
    }
    if (!response.ok) continue;

    let body;
    try {
      body = await response.json();
    } catch (_) {
      continue;
    }

    const organic = body.organic_results || [];
    for (const row of organic) {
      const candidate = extractFromOrganicResult(row, companyName);
      if (!candidate) continue;
      const key = `${candidate.name || ''}|${candidate.role}|${candidate.source_url || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push(candidate);
    }
  }

  return candidates;
}

module.exports = {
  searchPublicContacts,
  websiteDomain,
};
