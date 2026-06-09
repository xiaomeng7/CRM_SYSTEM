/**
 * Builder profile enums and field definitions (PR8C).
 */

const FIT_LEVELS = ['high', 'medium', 'low', 'unknown'];

const RESEARCH_RUN_STATUSES = ['running', 'completed', 'failed', 'skipped'];

const RESEARCH_SOURCES = ['manual', 'website_fetch', 'website_fetch_llm', 'ai_summary'];

/** Fields accepted on profile upsert */
const PROFILE_UPDATE_FIELDS = [
  'profile_summary',
  'builder_focus',
  'project_types',
  'target_suburbs',
  'quality_signals',
  'risk_signals',
  'ideal_contact_angle',
  'smart_home_fit',
  'architectural_fit',
  'luxury_fit',
  'estimated_fit_score',
  'research_source',
  'founder_summary',
  'why_bht_fit',
  'opportunity_summary',
  'recommended_founder_action',
  'score_breakdown',
];

/**
 * Future builder_research_needed detector may use:
 * - b2b_prospects.research_status IN ('not_started', 'needs_update')
 * - builder_profiles.last_researched_at stale threshold
 * - builder_profiles.estimated_fit_score for prioritisation
 */
const RESEARCH_NEEDED_STATUSES = ['not_started', 'needs_update'];

module.exports = {
  FIT_LEVELS,
  RESEARCH_RUN_STATUSES,
  RESEARCH_SOURCES,
  PROFILE_UPDATE_FIELDS,
  RESEARCH_NEEDED_STATUSES,
};
