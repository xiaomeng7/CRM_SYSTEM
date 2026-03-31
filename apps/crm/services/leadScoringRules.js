/**
 * Deterministic rule layer for lead scoring (hybrid with AI in leadScoring.js).
 * Conservative weights: urgency, budget, product, contactability, suburb first; utm/source light touch.
 */

function clamp01(n) {
  if (n == null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Number(n)));
}

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function hasPhone(lead) {
  const p = lead.contact_phone;
  return typeof p === 'string' && p.trim().length >= 8;
}

function hasEmail(lead) {
  const e = lead.contact_email;
  return typeof e === 'string' && e.includes('@');
}

/** Free-text for rules that map to `message` on some intakes; include product_interest (common on public forms). */
function leadNarrative(lead) {
  return String(lead.message || '') + ' ' + String(lead.product_interest || '');
}

function isVagueLead(lead) {
  const msg = leadNarrative(lead).toLowerCase().trim();

  const shortMsg = msg.length < 25;

  const vagueWords = ['quote', 'price', 'how much', 'info', 'check', 'looking', 'need help'];

  const hasOnlyVagueIntent =
    vagueWords.some(function (w) {
      return msg.includes(w);
    }) &&
    !msg.includes('urgent') &&
    !msg.includes('asap') &&
    !msg.includes('no power') &&
    !msg.includes('outage');

  return shortMsg && hasOnlyVagueIntent;
}

function isLandlordLead(lead) {
  const text = ((lead.message || '') + ' ' + (lead.product_interest || '')).toLowerCase();

  return (
    text.includes('landlord') ||
    text.includes('investor') ||
    text.includes('rental') ||
    text.includes('investment property') ||
    text.includes('property manager')
  );
}

function isReferralLead(lead) {
  const text = ((lead.message || '') + ' ' + (lead.source || '')).toLowerCase();

  return (
    text.includes('referral') ||
    text.includes('referred') ||
    text.includes('word of mouth') ||
    text.includes('friend') ||
    text.includes('family')
  );
}

function isEmergencyElectrical(lead) {
  const msg = leadNarrative(lead).toLowerCase();

  return (
    msg.includes('no power') ||
    msg.includes('power out') ||
    msg.includes('lost power') ||
    msg.includes('outage') ||
    msg.includes('sparking') ||
    msg.includes('burning smell') ||
    msg.includes('switchboard') ||
    msg.includes('tripping') ||
    msg.includes('safety issue')
  );
}

/**
 * @param {object} lead — row from getLeadContext (snake_case)
 * @returns {{ rule_score: number, breakdown: Record<string, number>, labels: string[] }}
 */
function computeRuleScore(lead) {
  const breakdown = {};
  const labels = [];

  const urgency = norm(lead.urgency_level);
  if (urgency.includes('this_week') || urgency.includes('this week') || urgency === 'urgent') {
    breakdown.urgency = 26;
    labels.push('urgency:this_week');
  } else if (urgency.includes('soon') || urgency.includes('asap')) {
    breakdown.urgency = 16;
    labels.push('urgency:soon');
  } else if (urgency.includes('month') || urgency.includes('2_week')) {
    breakdown.urgency = 8;
    labels.push('urgency:medium');
  } else if (urgency) {
    breakdown.urgency = 3;
    labels.push('urgency:stated');
  } else {
    breakdown.urgency = 0;
  }

  const budget = norm(lead.budget_signal);
  if (budget.includes('high') || budget.includes('premium')) {
    breakdown.budget = 20;
    labels.push('budget:high');
  } else if (budget.includes('medium') || budget.includes('mid')) {
    breakdown.budget = 11;
    labels.push('budget:medium');
  } else if (budget.includes('low')) {
    breakdown.budget = 4;
    labels.push('budget:low');
  } else if (budget) {
    breakdown.budget = 5;
    labels.push('budget:unknown');
  } else {
    breakdown.budget = 0;
  }

  const interest = norm(lead.product_interest);
  if (interest) {
    let pi = 6;
    if (/ev|solar|battery|energy|cctv|upgrade|switchboard/.test(interest)) {
      pi += 10;
      labels.push('product:high_intent_keyword');
    } else {
      labels.push('product:stated');
    }
    breakdown.product_interest = Math.min(16, pi);
  } else {
    breakdown.product_interest = 0;
  }

  breakdown.contactability = 0;
  if (hasPhone(lead)) {
    breakdown.contactability += 14;
    labels.push('contact:phone');
  }
  if (hasEmail(lead)) {
    breakdown.contactability += 7;
    labels.push('contact:email');
  }

  if (norm(lead.account_suburb)) {
    breakdown.suburb = 6;
    labels.push('geo:suburb');
  } else {
    breakdown.suburb = 0;
  }

  const utm = norm(lead.utm_source) + ' ' + norm(lead.utm_medium);
  const src = norm(lead.source);
  if (/google|gclid|facebook|meta|instagram|cpc|paid|ppc|sem/.test(utm)) {
    breakdown.attribution = 5;
    labels.push('utm:paid_or_search');
  } else if (norm(lead.utm_source) || norm(lead.utm_medium)) {
    breakdown.attribution = 2;
    labels.push('utm:present');
  } else if (src && !/^landing/.test(src)) {
    breakdown.attribution = 1;
    labels.push('source:non_default');
  } else {
    breakdown.attribution = 0;
  }

  const rawSum = Object.values(breakdown).reduce((a, b) => a + b, 0);
  let score = clamp01(Math.min(100, Math.round(rawSum)));

  if (isVagueLead(lead)) {
    score -= 10;
    labels.push('adjust:vague_penalty');
  }
  if (isLandlordLead(lead)) {
    score += 12;
    labels.push('adjust:landlord_investor');
  }
  if (isReferralLead(lead)) {
    score += 10;
    labels.push('adjust:referral');
  }

  const rule_score = clamp01(Math.max(0, Math.min(100, Math.round(score))));
  return { rule_score, breakdown, labels };
}

function expectedValueFromRules(lead, rule_score) {
  const budget = norm(lead.budget_signal);
  let base = 1200;
  if (budget.includes('high') || budget.includes('premium')) base = 9000;
  else if (budget.includes('medium') || budget.includes('mid')) base = 4500;
  else if (budget.includes('low')) base = 1500;
  const bump = (rule_score / 100) * 2500;
  return Math.round(base + bump);
}

function conversionFromRuleScore(rule_score) {
  return clamp01(Math.round(15 + rule_score * 0.55));
}

/** Tier is always derived from final_score in the pipeline (never from AI). */
function tierFromFinalScore(s) {
  const x = clamp01(s);
  if (x >= 85) return 'vip';
  if (x >= 65) return 'high';
  if (x >= 40) return 'medium';
  return 'low';
}

function recommendedActionFromRules(lead, rule_score) {
  let recommended_action;

  const urgency = norm(lead.urgency_level);
  const budget = norm(lead.budget_signal);
  const urgent = urgency.includes('this_week') || urgency.includes('this week') || urgency.includes('asap');
  if (urgent && (budget.includes('high') || budget.includes('premium'))) recommended_action = 'book_immediately';
  else if (urgent) recommended_action = 'call';
  else if (budget.includes('high') || budget.includes('premium')) recommended_action = 'call';
  else if (rule_score >= 55) recommended_action = 'call';
  else if (rule_score >= 35) recommended_action = 'send_sms';
  else recommended_action = 'owner_follow_up';

  if (isEmergencyElectrical(lead)) {
    recommended_action = 'book_immediately';
  }

  return recommended_action;
}

module.exports = {
  computeRuleScore,
  expectedValueFromRules,
  conversionFromRuleScore,
  tierFromFinalScore,
  recommendedActionFromRules,
};
