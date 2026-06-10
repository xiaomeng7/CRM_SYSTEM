/**
 * Normalize and score builder discovery candidates (PR9A).
 */

const BUILDER_KEYWORDS = ['builder', 'homes', 'construction', 'projects', 'developments'];
const ADELAIDE_KEYWORDS = ['adelaide', 'sa', 'south australia'];

const TYPE_RULES = [
  { match: ['custom home', 'custom homes'], builder_type: 'custom_homes', project_focus: 'custom_home' },
  { match: ['luxury'], builder_type: 'luxury_residential', project_focus: 'custom_home' },
  { match: ['architectural'], builder_type: 'architectural_homes', project_focus: 'architectural_new_build' },
  { match: ['townhouse'], builder_type: 'townhouse_developer', project_focus: 'townhouse' },
  { match: ['commercial'], builder_type: 'commercial_builder', project_focus: 'unknown' },
];

function trimOrNull(value) {
  if (value == null) return null;
  const s = String(value).trim();
  return s === '' ? null : s;
}

function normalizeWebsite(url) {
  const raw = trimOrNull(url);
  if (!raw) return null;
  let s = raw.toLowerCase();
  if (!/^https?:\/\//i.test(s)) {
    s = 'https://' + s;
  }
  return s;
}

function normalizeWebsiteForCompare(url) {
  if (!url) return '';
  return String(url)
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');
}

function normalizeCompanyName(name) {
  return trimOrNull(name);
}

function normalizeCompanyNameForCompare(name) {
  return String(name || '')
    .trim()
    .toLowerCase();
}

function normalizePhoneForCompare(phone) {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length >= 8) return digits.slice(-8);
  return digits;
}

function extractSuburb(location, suburb) {
  const direct = trimOrNull(suburb);
  if (direct) return direct;
  const loc = trimOrNull(location);
  if (!loc) return null;
  const parts = loc.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return loc;
}

function combinedText(candidate) {
  return [
    candidate.company_name,
    candidate.website,
    candidate.location,
    candidate.suburb,
    candidate.source_url,
    candidate.source_name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function suggestBuilderType(candidate) {
  const text = combinedText(candidate);
  for (const rule of TYPE_RULES) {
    if (rule.match.some((term) => text.includes(term))) {
      return {
        suggested_builder_type: rule.builder_type,
        suggested_project_focus: rule.project_focus,
      };
    }
  }
  return { suggested_builder_type: 'unknown', suggested_project_focus: 'unknown' };
}

function calculateConfidenceScore(candidate) {
  let score = 0;
  if (candidate.website) score += 30;
  if (candidate.phone) score += 20;

  const text = combinedText(candidate);
  if (BUILDER_KEYWORDS.some((kw) => text.includes(kw))) score += 20;
  if (ADELAIDE_KEYWORDS.some((kw) => text.includes(kw))) score += 15;
  if (candidate.source_url || candidate.source_name) score += 15;

  return Math.max(0, Math.min(100, score));
}

/**
 * @param {object} raw — seed or search result row
 * @param {object} [context] — { query, location }
 */
function normalizeBuilderCandidate(raw, context = {}) {
  const company_name = normalizeCompanyName(raw.company_name);
  if (!company_name) {
    const err = new Error('company_name required');
    err.code = 'INVALID_INPUT';
    throw err;
  }

  const location = trimOrNull(raw.location) || trimOrNull(context.location);
  const candidate = {
    company_name,
    website: normalizeWebsite(raw.website),
    phone: trimOrNull(raw.phone),
    email: trimOrNull(raw.email),
    location,
    suburb: extractSuburb(location, raw.suburb),
    source_url: trimOrNull(raw.source_url),
    source_name: trimOrNull(raw.source_name),
  };

  const suggestions = suggestBuilderType(candidate);
  candidate.suggested_builder_type = suggestions.suggested_builder_type;
  candidate.suggested_project_focus = suggestions.suggested_project_focus;
  candidate.confidence_score = calculateConfidenceScore(candidate);
  candidate.payload = {
    query: context.query || null,
    location: context.location || null,
    raw: raw,
  };

  return candidate;
}

module.exports = {
  normalizeBuilderCandidate,
  normalizeWebsiteForCompare,
  normalizeCompanyNameForCompare,
  normalizePhoneForCompare,
  calculateConfidenceScore,
  suggestBuilderType,
};
