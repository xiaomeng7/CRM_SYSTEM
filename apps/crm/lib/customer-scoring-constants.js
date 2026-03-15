/**
 * Customer Scoring Engine 2.0 — segment and thresholds.
 */

const SEGMENT = {
  HOT: 'Hot',
  WARM: 'Warm',
  COLD: 'Cold',
  DORMANT: 'Dormant',
  HIGH_VALUE_DORMANT: 'HighValueDormant',
};

// total_score thresholds
const HOT_MIN_SCORE = 80;
const WARM_MIN_SCORE = 60;
const DORMANT_MAX_SCORE = 30;
const DORMANT_LAST_CONTACT_DAYS = 180;
const HIGH_VALUE_DORMANT_VALUE_MIN = 50;

// Weights for total_score (0–100 each dimension, then average)
const WEIGHT_VALUE = 0.25;
const WEIGHT_CONVERSION = 0.25;
const WEIGHT_URGENCY = 0.25;
const WEIGHT_RELATIONSHIP = 0.25;

module.exports = {
  SEGMENT,
  HOT_MIN_SCORE,
  WARM_MIN_SCORE,
  DORMANT_MAX_SCORE,
  DORMANT_LAST_CONTACT_DAYS,
  HIGH_VALUE_DORMANT_VALUE_MIN,
  WEIGHT_VALUE,
  WEIGHT_CONVERSION,
  WEIGHT_URGENCY,
  WEIGHT_RELATIONSHIP,
};
