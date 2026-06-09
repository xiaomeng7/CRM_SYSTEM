/**
 * Founder priority score calculation (PR8E.1).
 * 35% Fit · 25% Relationship · 20% Timing · 20% Follow-up Urgency
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RELATIONSHIP_STRENGTH_POINTS = {
  unknown: 0,
  cold: 5,
  met_once: 15,
  known: 25,
  worked_together: 35,
  trusted_partner: 50,
};

const TIMING_POINTS = {
  unknown: 0,
  slow_period: 4,
  active_project: 12,
  quoting_projects: 18,
  growth_mode: 20,
};

const FOUNDER_PRIORITY_BANDS = [
  { min: 90, band: 'A' },
  { min: 75, band: 'B' },
  { min: 60, band: 'C' },
  { min: 0, band: 'D' },
];

const PRIORITY_EVENT_THRESHOLD = 90;

function daysSince(date, now = new Date()) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY));
}

function daysOverdue(followUpAt, now = new Date()) {
  if (!followUpAt) return 0;
  const d = new Date(followUpAt);
  if (Number.isNaN(d.getTime())) return 0;
  if (d >= now) return 0;
  return Math.floor((now.getTime() - d.getTime()) / MS_PER_DAY);
}

function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function assignFounderPriorityBand(score) {
  for (const row of FOUNDER_PRIORITY_BANDS) {
    if (score >= row.min) return row.band;
  }
  return 'D';
}

function fitComponent(estimatedFitScore) {
  const fit = Number(estimatedFitScore);
  const raw = Number.isFinite(fit) ? fit : 0;
  const points = raw * 0.35;
  return {
    component: 'fit',
    weight: '35%',
    points: Math.round(points * 10) / 10,
    max_points: 35,
    detail: { estimated_fit_score: Number.isFinite(fit) ? fit : null },
  };
}

function relationshipStrengthComponent(strength) {
  const key = strength != null ? String(strength).trim() : 'unknown';
  const raw = RELATIONSHIP_STRENGTH_POINTS[key] ?? 0;
  const points = (raw / 50) * 25;
  return {
    component: 'relationship',
    weight: '25%',
    points: Math.round(points * 10) / 10,
    max_points: 25,
    detail: { relationship_strength: key, raw_points: raw },
  };
}

function timingComponent(timingStatus) {
  const key = timingStatus != null ? String(timingStatus).trim() : 'unknown';
  const raw = TIMING_POINTS[key] ?? 0;
  const points = (raw / 20) * 20;
  return {
    component: 'timing',
    weight: '20%',
    points: Math.round(points * 10) / 10,
    max_points: 20,
    detail: { timing_status: key, raw_points: raw },
  };
}

function followupUrgencyComponent(prospect, openFollowupEvent, now) {
  let overdueDays = 0;
  if (openFollowupEvent?.payload?.overdue_days != null) {
    overdueDays = Number(openFollowupEvent.payload.overdue_days) || 0;
  } else if (prospect.next_followup_at) {
    overdueDays = daysOverdue(prospect.next_followup_at, now);
  }

  let raw = 0;
  let reason = 'no_followup_urgency';
  if (overdueDays >= 30) {
    raw = 20;
    reason = 'followup_30d_overdue';
  } else if (overdueDays >= 1 || openFollowupEvent) {
    raw = 14;
    reason = 'followup_overdue';
  } else if (prospect.timing_status === 'quoting_projects') {
    raw = 12;
    reason = 'quoting_projects_active';
  } else if (prospect.timing_status === 'growth_mode') {
    raw = 10;
    reason = 'growth_mode';
  }

  const points = (raw / 20) * 20;
  return {
    component: 'followup_urgency',
    weight: '20%',
    points: Math.round(points * 10) / 10,
    max_points: 20,
    detail: { overdue_days: overdueDays, reason },
  };
}

/**
 * @param {object} input
 * @param {object} input.prospect
 * @param {object|null} input.profile
 * @param {object|null} input.openFollowupEvent
 * @param {Date} [input.now]
 */
function calculateFounderPriorityScore(input) {
  const prospect = input.prospect || {};
  const profile = input.profile || null;
  const now = input.now || new Date();

  const components = [
    fitComponent(profile?.estimated_fit_score),
    relationshipStrengthComponent(prospect.relationship_strength),
    timingComponent(prospect.timing_status),
    followupUrgencyComponent(prospect, input.openFollowupEvent, now),
  ];

  const total = components.reduce((sum, c) => sum + c.points, 0);
  const founder_priority_score = clampScore(total);
  const founder_priority_band = assignFounderPriorityBand(founder_priority_score);

  const founder_priority_breakdown = {
    components,
    total_raw: Math.round(total * 10) / 10,
    founder_priority_score,
    founder_priority_band,
    calculated_at: now.toISOString(),
  };

  return {
    founder_priority_score,
    founder_priority_band,
    founder_priority_breakdown,
    score_kind: 'prospect_priority',
  };
}

module.exports = {
  calculateFounderPriorityScore,
  assignFounderPriorityBand,
  fitComponent,
  relationshipStrengthComponent,
  timingComponent,
  followupUrgencyComponent,
  RELATIONSHIP_STRENGTH_POINTS,
  TIMING_POINTS,
  FOUNDER_PRIORITY_BANDS,
  PRIORITY_EVENT_THRESHOLD,
};
