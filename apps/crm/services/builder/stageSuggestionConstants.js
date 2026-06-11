/**
 * Builder stage suggestion constants (PR10C).
 */

const SUGGESTION_STATUSES = ['pending', 'approved', 'dismissed'];

const SUGGESTION_SOURCES = [
  'contact_discovery',
  'manual',
  'email_future',
  'service_m8_future',
];

const CONFIDENCE_BANDS = ['high', 'medium', 'low'];

module.exports = {
  SUGGESTION_STATUSES,
  SUGGESTION_SOURCES,
  CONFIDENCE_BANDS,
};
