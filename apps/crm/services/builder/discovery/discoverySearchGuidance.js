/**
 * PR9B.4.2 — Discovery exhaustion guidance and next-search recommendations.
 */

const {
  TARGET_SUBURBS,
  QUICK_SEARCH_CATEGORIES,
  generateQuickSearches,
} = require('./discoveryStrategies');

const NEARBY_SUBURBS = {
  burnside: ['Leabrook', 'Beaumont', 'Toorak Gardens', 'St Georges'],
  leabrook: ['Burnside', 'Beaumont', 'Linden Park'],
  beaumont: ['Burnside', 'Leabrook', 'Glen Osmond'],
  'st georges': ['Toorak Gardens', 'Burnside', 'Mitcham'],
  'toorak gardens': ['St Georges', 'Burnside', 'Rose Park'],
  medindie: ['North Adelaide', 'Walkerville', 'Prospect'],
  springfield: ['Unley Park', 'Mitcham', 'Blackwood'],
  'unley park': ['Springfield', 'Unley', 'Malvern'],
  norwood: ['Kensington', 'St Peters', 'Toorak Gardens'],
};

const ADJACENT_CATEGORY_ORDER = ['architectural', 'luxury', 'custom'];

const UNDERSERVED_SEGMENTS = [
  { id: 'premium', query_term: 'premium home builder', label: 'Premium Home Builders' },
  { id: 'townhouse', query_term: 'townhouse builder', label: 'Townhouse Builders' },
  { id: 'heritage', query_term: 'heritage home builder', label: 'Heritage Home Builders' },
  { id: 'design-build', query_term: 'design and build', label: 'Design and Build' },
  { id: 'boutique', query_term: 'boutique home builder', label: 'Boutique Builders' },
];

const UNDERSERVED_LOCATIONS = [
  { suburb: 'Adelaide Hills', location: 'Adelaide Hills SA' },
  { suburb: 'Glenelg', location: 'Glenelg SA' },
  { suburb: 'Unley', location: 'Unley SA' },
  { suburb: 'Walkerville', location: 'Walkerville SA' },
];

function normalizeQueryKey(query, location) {
  return `${String(query || '').trim().toLowerCase()}|${String(location || '').trim().toLowerCase()}`;
}

function parseRunContext(run = {}) {
  const query = String(run.query || '').trim();
  const location = String(run.location || '').trim();
  const qLower = query.toLowerCase();

  let suburb = null;
  for (const s of TARGET_SUBURBS) {
    if (qLower.includes(s.toLowerCase())) {
      suburb = s;
      break;
    }
  }

  let categoryId = null;
  for (const cat of QUICK_SEARCH_CATEGORIES) {
    if (qLower.includes(cat.query_term.toLowerCase())) {
      categoryId = cat.id;
      break;
    }
  }

  const isBroadAdelaide =
    !suburb &&
    (qLower.includes('adelaide') || qLower.includes('south australia') || qLower.includes(' sa'));

  return { query, location, suburb, categoryId, isBroadAdelaide, qLower };
}

function makeSearch({ query, location, label, category_id, suburb, reason }) {
  return {
    id: normalizeQueryKey(query, location).replace(/[^a-z0-9|]+/g, '-'),
    query,
    location: location || null,
    label: label || query,
    suburb: suburb || null,
    category_id: category_id || null,
    reason: reason || null,
    recommended_provider: 'serpapi',
  };
}

function dedupeSearches(searches, excludeKey) {
  const seen = new Set();
  const out = [];
  for (const s of searches) {
    const key = normalizeQueryKey(s.query, s.location);
    if (key === excludeKey || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function detectCategoryFromQuery(qLower) {
  for (const cat of QUICK_SEARCH_CATEGORIES) {
    if (qLower.includes(cat.query_term.toLowerCase())) return cat;
  }
  return QUICK_SEARCH_CATEGORIES[1];
}

function buildNearbyPremiumSuburbs(ctx, excludeKey, limit = 4) {
  const cat = ctx.categoryId
    ? QUICK_SEARCH_CATEGORIES.find((c) => c.id === ctx.categoryId)
    : detectCategoryFromQuery(ctx.qLower);
  const searches = [];

  if (ctx.suburb) {
    const nearby = NEARBY_SUBURBS[ctx.suburb.toLowerCase()] || [];
    for (const suburb of nearby) {
      searches.push(
        makeSearch({
          query: `${cat.query_term} ${suburb} SA`,
          location: `${suburb} SA`,
          label: `${cat.label} — ${suburb}`,
          category_id: cat.id,
          suburb,
          reason: 'nearby_premium_suburb',
        })
      );
    }
  } else if (ctx.isBroadAdelaide) {
    for (const suburb of TARGET_SUBURBS) {
      searches.push(
        makeSearch({
          query: `${cat.query_term} ${suburb} SA`,
          location: `${suburb} SA`,
          label: `${cat.label} — ${suburb}`,
          category_id: cat.id,
          suburb,
          reason: 'premium_suburb_focus',
        })
      );
    }
  } else {
    for (const suburb of TARGET_SUBURBS.slice(0, 5)) {
      searches.push(
        makeSearch({
          query: `${cat.query_term} ${suburb} SA`,
          location: `${suburb} SA`,
          label: `${cat.label} — ${suburb}`,
          category_id: cat.id,
          suburb,
          reason: 'premium_suburb_focus',
        })
      );
    }
  }

  return dedupeSearches(searches, excludeKey).slice(0, limit);
}

function buildAdjacentBuilderSegments(ctx, excludeKey, limit = 3) {
  const suburb =
    ctx.suburb || (ctx.isBroadAdelaide ? 'Burnside' : TARGET_SUBURBS[0]);
  const location = `${suburb} SA`;
  const searches = [];

  for (const catId of ADJACENT_CATEGORY_ORDER) {
    if (ctx.categoryId && catId === ctx.categoryId) continue;
    const cat = QUICK_SEARCH_CATEGORIES.find((c) => c.id === catId);
    if (!cat) continue;
    searches.push(
      makeSearch({
        query: `${cat.query_term} ${suburb} SA`,
        location,
        label: `${cat.label} — ${suburb}`,
        category_id: cat.id,
        suburb,
        reason: 'adjacent_segment',
      })
    );
  }

  return dedupeSearches(searches, excludeKey).slice(0, limit);
}

function buildUnderservedMarketSegments(ctx, excludeKey, limit = 3) {
  const searches = [];
  const suburb = ctx.suburb || 'Norwood';

  for (const segment of UNDERSERVED_SEGMENTS) {
    if (ctx.qLower.includes(segment.query_term.toLowerCase())) continue;
    searches.push(
      makeSearch({
        query: `${segment.query_term} ${suburb} SA`,
        location: `${suburb} SA`,
        label: `${segment.label} — ${suburb}`,
        category_id: segment.id,
        suburb,
        reason: 'underserved_segment',
      })
    );
  }

  for (const loc of UNDERSERVED_LOCATIONS) {
    if (ctx.suburb && loc.suburb.toLowerCase() === ctx.suburb.toLowerCase()) continue;
    searches.push(
      makeSearch({
        query: `custom home builder ${loc.location}`,
        location: loc.location,
        label: `Custom Home Builders — ${loc.suburb}`,
        category_id: 'custom',
        suburb: loc.suburb,
        reason: 'underserved_location',
      })
    );
  }

  return dedupeSearches(searches, excludeKey).slice(0, limit);
}

function buildMarketCoverage(summary = {}) {
  return {
    total_found: summary.total_results != null ? summary.total_results : summary.builders_found || 0,
    existing_builders: summary.existing_builders_hidden || 0,
    seo_pages_filtered:
      (summary.seo_pages_hidden || 0) + (summary.directories_hidden || 0),
    new_builders: summary.new_builders_remaining || 0,
  };
}

/**
 * @param {object} run — discovery run row
 * @param {object} summary — from buildDiscoveryRunSummary
 */
function buildDiscoveryExhaustionGuidance(run, summary = {}) {
  const newRemaining = summary.new_builders_remaining || 0;
  const market_coverage = buildMarketCoverage(summary);

  if (newRemaining > 0) {
    return {
      exhausted: false,
      market_coverage,
      recommended_next_searches: [],
    };
  }

  const ctx = parseRunContext(run);
  const excludeKey = normalizeQueryKey(ctx.query, ctx.location);

  const recommended_next_searches = [
    {
      id: 'nearby_premium_suburbs',
      label: 'Nearby Premium Suburbs',
      searches: buildNearbyPremiumSuburbs(ctx, excludeKey),
    },
    {
      id: 'adjacent_builder_segments',
      label: 'Adjacent Builder Segments',
      searches: buildAdjacentBuilderSegments(ctx, excludeKey),
    },
    {
      id: 'underserved_market_segments',
      label: 'Underserved Market Segments',
      searches: buildUnderservedMarketSegments(ctx, excludeKey),
    },
  ].filter((cat) => cat.searches.length > 0);

  if (!recommended_next_searches.length) {
    const fallback = generateQuickSearches()
      .filter((s) => normalizeQueryKey(s.query, s.location) !== excludeKey)
      .slice(0, 6)
      .map((s) => ({ ...s, reason: 'fallback' }));
    recommended_next_searches.push({
      id: 'nearby_premium_suburbs',
      label: 'Nearby Premium Suburbs',
      searches: fallback,
    });
  }

  return {
    exhausted: true,
    market_coverage,
    recommended_next_searches,
    recommended_founder_action: 'Run the next recommended search below',
  };
}

module.exports = {
  NEARBY_SUBURBS,
  UNDERSERVED_SEGMENTS,
  parseRunContext,
  buildMarketCoverage,
  buildDiscoveryExhaustionGuidance,
};
