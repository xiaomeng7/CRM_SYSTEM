/**
 * Builder contact discovery constants (PR10B).
 */

const TARGET_ROLES = [
  { label: 'Owner', patterns: [/\bowner\b/i, /\bmanaging\s+director\b/i] },
  { label: 'Director', patterns: [/\bdirector\b/i, /\bceo\b/i, /\bfounder\b/i] },
  { label: 'Construction Manager', patterns: [/\bconstruction\s+manager\b/i] },
  { label: 'Project Manager', patterns: [/\bproject\s+manager\b/i, /\bpm\b/i] },
  { label: 'Estimator', patterns: [/\bestimator\b/i, /\btender/i] },
];

const CONFIDENCE_BANDS = ['high', 'medium', 'low'];

const SOURCE_TYPES = ['website', 'research_snippet', 'serpapi', 'existing_prospect'];

const CONTACT_PAGE_HINTS = ['contact', 'team', 'about', 'people', 'staff', 'leadership'];

module.exports = {
  TARGET_ROLES,
  CONFIDENCE_BANDS,
  SOURCE_TYPES,
  CONTACT_PAGE_HINTS,
};
