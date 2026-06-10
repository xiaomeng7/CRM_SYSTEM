/**
 * Better Home premium builder discovery strategies (PR9B.1 + live quick searches).
 */

const TARGET_SUBURBS = [
  'Burnside',
  'Leabrook',
  'Beaumont',
  'St Georges',
  'Toorak Gardens',
  'Medindie',
  'Springfield',
  'Unley Park',
  'Norwood',
];

const QUICK_SEARCH_CATEGORIES = [
  {
    id: 'architectural',
    label: 'Architectural Builders',
    query_term: 'architectural builder',
    builder_type_hint: 'architectural_homes',
  },
  {
    id: 'luxury',
    label: 'Luxury Home Builders',
    query_term: 'luxury home builder',
    builder_type_hint: 'luxury_residential',
  },
  {
    id: 'custom',
    label: 'Custom Home Builders',
    query_term: 'custom home builder',
    builder_type_hint: 'custom_homes',
  },
];

const TARGET_SEARCHES = [
  'architectural builder',
  'custom home builder',
  'luxury builder',
  'residential builder',
  'premium home builder',
];

const REGIONAL_LOCATIONS = [
  { label: 'Adelaide Hills', location: 'Adelaide Hills SA' },
  { label: 'Adelaide', location: 'Adelaide SA' },
];

const STRATEGY_NAME = 'Better Home Premium Builder Strategy';

const VERIFICATION_SEARCHES = [
  { query: 'architectural builder Burnside SA', location: 'Burnside SA', category: 'architectural' },
  { query: 'luxury builder Adelaide SA', location: 'Adelaide SA', category: 'luxury' },
  { query: 'custom home builder Norwood SA', location: 'Norwood SA', category: 'custom' },
];

function generateQuickSearches(options = {}) {
  const provider = options.recommended_provider || 'serpapi';
  const searches = [];

  for (const category of QUICK_SEARCH_CATEGORIES) {
    for (const suburb of TARGET_SUBURBS) {
      const location = `${suburb} SA`;
      searches.push({
        id: `${category.id}-${suburb}`.toLowerCase().replace(/\s+/g, '-'),
        category_id: category.id,
        category_label: category.label,
        query_term: category.query_term,
        query: `${category.query_term} ${suburb} SA`,
        location,
        label: `${category.label} — ${suburb}`,
        suburb,
        recommended_provider: provider,
        provider_enabled: false,
        builder_type_hint: category.builder_type_hint,
      });
    }
  }

  return searches;
}

function generateRecommendedSearches(options = {}) {
  const provider = options.recommended_provider || 'serpapi';
  const searches = generateQuickSearches(options);

  for (const term of TARGET_SEARCHES) {
    if (QUICK_SEARCH_CATEGORIES.some((c) => c.query_term === term)) continue;
    for (const suburb of TARGET_SUBURBS) {
      const location = `${suburb} SA`;
      searches.push({
        id: `${term}-${suburb}`.toLowerCase().replace(/\s+/g, '-'),
        strategy: STRATEGY_NAME,
        query: `${term} ${suburb} SA`,
        location,
        label: `${term} ${suburb} SA`,
        recommended_provider: provider,
        provider_enabled: false,
      });
    }
  }

  for (const term of ['custom builder', 'residential builder', 'premium home builder']) {
    for (const region of REGIONAL_LOCATIONS) {
      searches.push({
        id: `${term}-${region.label}`.toLowerCase().replace(/\s+/g, '-'),
        strategy: STRATEGY_NAME,
        query: `${term} ${region.label}`,
        location: region.location,
        label: `${term} ${region.label}`,
        recommended_provider: provider,
        provider_enabled: false,
      });
    }
  }

  return searches;
}

function getDiscoveryStrategyMeta() {
  return {
    name: STRATEGY_NAME,
    target_suburbs: TARGET_SUBURBS,
    target_searches: TARGET_SEARCHES,
    quick_search_categories: QUICK_SEARCH_CATEGORIES,
    regional_locations: REGIONAL_LOCATIONS,
    total_combinations: generateRecommendedSearches().length,
    quick_search_count: generateQuickSearches().length,
  };
}

module.exports = {
  STRATEGY_NAME,
  TARGET_SUBURBS,
  QUICK_SEARCH_CATEGORIES,
  TARGET_SEARCHES,
  REGIONAL_LOCATIONS,
  VERIFICATION_SEARCHES,
  generateQuickSearches,
  generateRecommendedSearches,
  getDiscoveryStrategyMeta,
};
