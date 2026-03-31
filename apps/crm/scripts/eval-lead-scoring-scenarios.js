#!/usr/bin/env node
/**
 * 10 synthetic lead contexts → rule_score / ai_score / final_score / tier / recommended_action
 * Uses previewHybridScores (real Claude when ANTHROPIC_API_KEY set; else rules_only).
 *
 *   node scripts/eval-lead-scoring-scenarios.js
 */

require('../lib/load-env');
const { previewHybridScores } = require('../services/leadScoring');

const base = {
  status: 'new',
  created_at: new Date().toISOString(),
};

const scenarios = [
  {
    id: 1,
    label: '高价值 energy（太阳能+储能+高预算+本周要）',
    lead: {
      ...base,
      source: 'landing:advisory',
      utm_source: 'google',
      utm_medium: 'cpc',
      utm_campaign: 'solar_adl',
      product_interest: '10kW solar + battery storage, feed-in optimisation',
      budget_signal: 'high',
      urgency_level: 'this_week',
      contact_name: 'Sam Chen',
      contact_email: 'sam.chen@email.com',
      contact_phone: '0412345678',
      account_suburb: 'Burnside',
    },
  },
  {
    id: 2,
    label: '模糊 low-intent（只要资料）',
    lead: {
      ...base,
      source: 'organic',
      product_interest: 'general info',
      budget_signal: 'low',
      urgency_level: 'whenever',
      contact_name: 'Alex',
      contact_email: 'alex@yahoo.com',
      contact_phone: '0488111222',
      account_suburb: 'Norwood',
    },
  },
  {
    id: 3,
    label: 'CCTV 安装询价',
    lead: {
      ...base,
      source: 'landing:advisory',
      utm_source: 'google',
      utm_medium: 'organic',
      product_interest: 'CCTV 4 cameras for rental',
      budget_signal: 'medium',
      urgency_level: 'this_month',
      contact_name: 'Priya K',
      contact_email: 'priya.k@gmail.com',
      contact_phone: '0422000333',
      account_suburb: 'Mawson Lakes',
    },
  },
  {
    id: 4,
    label: '紧急 electrical（失电/跳闸）',
    lead: {
      ...base,
      source: 'landing:advisory',
      product_interest: 'Power out half the house, safety concern',
      budget_signal: 'medium',
      urgency_level: 'this_week',
      contact_name: 'Chris Taylor',
      contact_email: 'chris.t@outlook.com',
      contact_phone: '0400999888',
      account_suburb: 'Glenelg',
    },
  },
  {
    id: 5,
    label: 'Facebook 低质量（低价+随意邮箱）',
    lead: {
      ...base,
      source: 'landing:advisory',
      utm_source: 'facebook',
      utm_medium: 'paid_social',
      utm_campaign: 'broad_leads',
      product_interest: 'cheap quote',
      budget_signal: 'low',
      urgency_level: 'no_rush',
      contact_name: 'Test User',
      contact_email: 'asdf123@mailinator.com',
      contact_phone: '0400000111',
      account_suburb: '',
    },
  },
  {
    id: 6,
    label: '明确高预算（全屋升级）',
    lead: {
      ...base,
      source: 'referral',
      product_interest: 'Full switchboard upgrade + LED + safety',
      budget_signal: 'high',
      urgency_level: 'soon',
      contact_name: 'Jordan Lee',
      contact_email: 'jordan@company.com.au',
      contact_phone: '0411222333',
      account_suburb: 'Unley',
    },
  },
  {
    id: 7,
    label: '几乎无正文（仅表单必填项）',
    lead: {
      ...base,
      source: 'landing:advisory',
      product_interest: '',
      budget_signal: '',
      urgency_level: '',
      contact_name: 'M Smith',
      contact_email: 'msmith@gmail.com',
      contact_phone: '0499888777',
      account_suburb: 'Prospect',
    },
  },
  {
    id: 8,
    label: '投资房 / landlord 多套房',
    lead: {
      ...base,
      source: 'landing:advisory',
      product_interest: 'Electrical compliance for 3 rental properties, RCD checks',
      budget_signal: 'high',
      urgency_level: 'this_month',
      contact_name: 'Helen Wong',
      contact_email: 'hwong.invest@icloud.com',
      contact_phone: '0422333444',
      account_suburb: 'Kent Town',
    },
  },
  {
    id: 9,
    label: '仅电话无邮箱',
    lead: {
      ...base,
      source: 'landing:advisory',
      product_interest: 'Air con circuit upgrade',
      budget_signal: 'medium',
      urgency_level: 'soon',
      contact_name: 'Dave',
      contact_email: null,
      contact_phone: '0455666777',
      account_suburb: 'Salisbury',
    },
  },
  {
    id: 10,
    label: '老客户转介绍',
    lead: {
      ...base,
      source: 'referral:existing_customer',
      product_interest: 'Same as neighbour — Essential Electrical Report',
      budget_signal: 'medium',
      urgency_level: 'soon',
      contact_name: 'Pat O’Neil',
      contact_email: 'pat.oneil@gmail.com',
      contact_phone: '0419988776',
      account_suburb: 'Hyde Park',
    },
  },
];

async function main() {
  const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);
  console.log(
    JSON.stringify(
      {
        anthropic_configured: hasKey,
        note: hasKey
          ? 'ai_score from Claude; final = round(rule*0.3 + ai*0.7); tier from final only'
          : 'rules_only (no ANTHROPIC_API_KEY); ai_score shown as null',
      },
      null,
      2
    )
  );
  console.log('');

  for (const s of scenarios) {
    const out = await previewHybridScores(s.lead, { silent: true });
    const row = {
      scenario: s.id,
      label: s.label,
      rule_score: out.rule_score,
      ai_score: out.ai_score,
      final_score: out.final_score,
      tier: out.tier,
      recommended_action: out.recommended_action,
      scoring_method: out.scoring_method,
      ai_reasoning: out.ai_reasoning,
    };
    console.log(JSON.stringify(row, null, 2));
    console.log('');
    await new Promise((r) => setTimeout(r, hasKey ? 400 : 0));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
