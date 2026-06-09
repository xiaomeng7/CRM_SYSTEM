/**
 * Deterministic builder target score calculation (PR8E).
 * Explainable components — not a black box.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const RELATIONSHIP_POINTS = {
  discovered: 5,
  researching: 5,
  qualified: 25,
  contacted: 15,
  meeting_booked: 35,
  proposal_sent: 30,
  working_together: 0,
  inactive: 0,
  not_fit: 0,
};

const TARGET_BANDS = [
  { min: 90, band: 'A' },
  { min: 75, band: 'B' },
  { min: 50, band: 'C' },
  { min: 0, band: 'D' },
];

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

function fitComponent(estimatedFitScore) {
  const fit = Number(estimatedFitScore);
  const score = Number.isFinite(fit) ? fit * 0.4 : 0;
  return {
    component: 'research_fit',
    points: Math.round(score * 10) / 10,
    detail: { estimated_fit_score: Number.isFinite(fit) ? fit : null, weight: 0.4 },
  };
}

function relationshipComponent(stage) {
  const key = stage != null ? String(stage).trim() : '';
  const points = RELATIONSHIP_POINTS[key] ?? 0;
  return {
    component: 'relationship_stage',
    points,
    detail: { relationship_stage: key || null },
  };
}

function followupComponent(prospect, openFollowupEvent, now) {
  let overdueDays = 0;
  if (openFollowupEvent?.payload?.overdue_days != null) {
    overdueDays = Number(openFollowupEvent.payload.overdue_days) || 0;
  } else if (prospect.next_followup_at) {
    overdueDays = daysOverdue(prospect.next_followup_at, now);
  }

  if (overdueDays >= 30) {
    return {
      component: 'followup_urgency',
      points: 30,
      detail: { overdue_days: overdueDays, reason: 'followup_30d_overdue' },
    };
  }
  if (overdueDays >= 1 || openFollowupEvent) {
    return {
      component: 'followup_urgency',
      points: 20,
      detail: { overdue_days: overdueDays, reason: 'followup_overdue' },
    };
  }
  return {
    component: 'followup_urgency',
    points: 0,
    detail: { overdue_days: 0, reason: 'no_followup_urgency' },
  };
}

function activityComponent(lastContactedAt, now) {
  const days = daysSince(lastContactedAt, now);
  if (days == null) {
    return { component: 'activity_freshness', points: 0, detail: { days_since_contact: null } };
  }
  if (days <= 14) {
    return { component: 'activity_freshness', points: 15, detail: { days_since_contact: days } };
  }
  if (days <= 30) {
    return { component: 'activity_freshness', points: 10, detail: { days_since_contact: days } };
  }
  if (days <= 60) {
    return { component: 'activity_freshness', points: 5, detail: { days_since_contact: days } };
  }
  return { component: 'activity_freshness', points: 0, detail: { days_since_contact: days } };
}

function researchComponent(prospect, profile, now) {
  const lastResearched = profile?.last_researched_at;
  if (!lastResearched) {
    const notResearched =
      prospect.research_status === 'not_started' || !profile?.estimated_fit_score;
    return {
      component: 'research_freshness',
      points: notResearched ? -10 : 0,
      detail: {
        last_researched_at: null,
        research_status: prospect.research_status || null,
        reason: notResearched ? 'not_researched' : 'no_profile',
      },
    };
  }
  const days = daysSince(lastResearched, now);
  if (days != null && days <= 90) {
    return {
      component: 'research_freshness',
      points: 10,
      detail: { last_researched_at: lastResearched, days_since_research: days },
    };
  }
  return {
    component: 'research_freshness',
    points: 0,
    detail: { last_researched_at: lastResearched, days_since_research: days },
  };
}

function assignBand(targetScore) {
  for (const row of TARGET_BANDS) {
    if (targetScore >= row.min) return row.band;
  }
  return 'D';
}

/**
 * @param {object} input
 * @param {object} input.prospect — b2b_prospects row
 * @param {object|null} input.profile — builder_profiles row
 * @param {object|null} input.openFollowupEvent — open builder_followup event
 * @param {Date} [input.now]
 */
function calculateBuilderTargetScore(input) {
  const prospect = input.prospect || {};
  const profile = input.profile || null;
  const now = input.now || new Date();

  const components = [
    fitComponent(profile?.estimated_fit_score),
    relationshipComponent(prospect.relationship_stage),
    followupComponent(prospect, input.openFollowupEvent, now),
    activityComponent(prospect.last_contacted_at, now),
    researchComponent(prospect, profile, now),
  ];

  const total = components.reduce((sum, c) => sum + c.points, 0);
  const target_score = clampScore(total);
  const target_band = assignBand(target_score);

  const score_breakdown = {
    components,
    total_raw: Math.round(total * 10) / 10,
    target_score,
    target_band,
    calculated_at: now.toISOString(),
  };

  return {
    target_score,
    target_band,
    score_breakdown,
  };
}

module.exports = {
  calculateBuilderTargetScore,
  assignBand,
  fitComponent,
  relationshipComponent,
  followupComponent,
  activityComponent,
  researchComponent,
  RELATIONSHIP_POINTS,
  TARGET_BANDS,
  TARGET_EVENT_THRESHOLD: 90,
};
