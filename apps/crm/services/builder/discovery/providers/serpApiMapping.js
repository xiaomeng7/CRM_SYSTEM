/**
 * SerpAPI response → discovery candidate mapping (PR9B.2).
 */

const BLOCKED_TERMS = [
  'facebook',
  'instagram',
  'youtube',
  'linkedin',
  'hipages',
  'yellowpages',
  'truelocal',
  'productreview',
  'reddit',
  'wikipedia',
  'seek',
  'domain.com.au',
  'realestate.com.au',
];

const DIRECTORY_TERMS = ['hipages', 'yellowpages', 'truelocal', 'productreview'];

const COMPANY_SUFFIXES = [
  ' | Custom Home Builder',
  ' - Home',
  ' South Australia',
  ' Adelaide',
];

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function cleanCompanyName(title) {
  let name = trimOrNull(title);
  if (!name) return null;

  for (const suffix of COMPANY_SUFFIXES) {
    if (name.endsWith(suffix)) {
      name = name.slice(0, -suffix.length).trim();
    }
  }

  const pipeIdx = name.indexOf(' | ');
  if (pipeIdx > 0) {
    name = name.slice(0, pipeIdx).trim();
  }

  return name || null;
}

function normalizeWebsite(url) {
  const raw = trimOrNull(url);
  if (!raw) return null;
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  return s;
}

function shouldFilterResult(title, link) {
  const hay = `${title || ''} ${link || ''}`.toLowerCase();
  if (BLOCKED_TERMS.some((term) => hay.includes(term))) return true;

  const isDirectory = DIRECTORY_TERMS.some((term) => hay.includes(term));
  if (isDirectory) return true;

  return false;
}

function mapOrganicResult(result) {
  const title = result.title || '';
  const link = result.link || '';
  if (shouldFilterResult(title, link)) return null;

  const company_name = cleanCompanyName(title);
  if (!company_name) return null;

  return {
    company_name,
    website: normalizeWebsite(link),
    phone: null,
    email: null,
    location: null,
    source_url: link || null,
    source_name: 'serpapi_google',
    raw: {
      raw_source: 'serpapi',
      snippet: result.snippet || null,
      displayed_link: result.displayed_link || null,
      position: result.position || null,
    },
  };
}

function mapLocalResult(result) {
  const title = result.title || '';
  const website = result.website || result.links?.website || null;
  const link = website || result.link || '';
  if (shouldFilterResult(title, link)) return null;

  const company_name = cleanCompanyName(title);
  if (!company_name) return null;

  const phone = trimOrNull(result.phone);
  const location = trimOrNull(result.address);
  const hasWebsite = Boolean(normalizeWebsite(website));
  if (!hasWebsite && !(phone && location)) return null;

  return {
    company_name,
    website: normalizeWebsite(website),
    phone,
    email: null,
    location,
    source_url: link || website || null,
    source_name: 'serpapi_local',
    raw: {
      raw_source: 'serpapi',
      google_rating: result.rating != null ? Number(result.rating) : null,
      google_reviews: result.reviews != null ? Number(result.reviews) : null,
      place_id: result.place_id || null,
    },
  };
}

function candidateKey(candidate) {
  const web = (candidate.website || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const name = (candidate.company_name || '').trim().toLowerCase();
  const phone = String(candidate.phone || '').replace(/\D/g, '');
  return web || `${name}::${phone}` || name;
}

function dedupeCandidates(candidates) {
  const seen = new Set();
  const out = [];
  for (const c of candidates) {
    const key = candidateKey(c);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

/**
 * @param {object} serpBody — SerpAPI JSON response
 * @param {object} [context]
 * @param {number} [limit]
 */
function normalizeLocalResults(localResults) {
  if (!localResults) return [];
  if (Array.isArray(localResults)) return localResults;
  if (Array.isArray(localResults.places)) return localResults.places;
  return [];
}

function parseSerpApiResponse(serpBody, context = {}, limit = 20) {
  const max = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 20);
  const mapped = [];

  for (const row of serpBody.organic_results || []) {
    const candidate = mapOrganicResult(row);
    if (candidate) mapped.push(candidate);
  }

  for (const row of normalizeLocalResults(serpBody.local_results)) {
    const candidate = mapLocalResult(row);
    if (candidate) mapped.push(candidate);
  }

  const unique = dedupeCandidates(mapped).slice(0, max);

  for (const c of unique) {
    c.raw = {
      ...(c.raw || {}),
      query: context.query || null,
      location: context.location || null,
    };
  }

  return unique;
}

module.exports = {
  BLOCKED_TERMS,
  cleanCompanyName,
  shouldFilterResult,
  mapOrganicResult,
  mapLocalResult,
  normalizeLocalResults,
  parseSerpApiResponse,
  dedupeCandidates,
};
