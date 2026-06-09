#!/usr/bin/env node
/**
 * PR8E.3 debug — Ivara-style strategic partner save + recalculate path.
 *
 * Usage:
 *   pnpm --filter @bht/crm run test:builder-segmentation-debug
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  createBuilderProspect,
  updateBuilderProspect,
  getBuilderProspectById,
} = require('../services/builder/builderProspectService');
const { upsertBuilderProfile } = require('../services/builder/builderProfileService');
const {
  refreshBuilderTargetScoreForProspect,
} = require('../services/builder/targetSelection/refreshBuilderTargetScores');
const { getTopBuilderTargets } = require('../services/builder/targetSelection/getTopBuilderTargets');
const { getStrategicPartners } = require('../services/builder/targetSelection/getStrategicPartners');

const TEST_PREFIX = 'test_pr8e3dbg_';
const NOW = new Date('2026-06-08T12:00:00.000Z');
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigrations() {
  const files = [
    '../database/069_builder_prospect_foundation.sql',
    '../database/070_builder_research_profiles.sql',
    '../database/071_builder_target_scores.sql',
    '../database/073_builder_relationship_intelligence.sql',
    '../database/074_builder_segmentation.sql',
  ];
  for (const rel of files) {
    await pool.query(fs.readFileSync(path.join(__dirname, rel), 'utf8'));
  }
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function main() {
  console.log('PR8E.3 segmentation debug tests\n');

  try {
    await ensureMigrations();
    await cleanup();

    const col = await pool.query(
      `SELECT 1 FROM information_schema.columns
       WHERE table_name = 'b2b_prospects' AND column_name = 'builder_status'`
    );
    assert(col.rows.length === 1, 'builder_status column exists');

    const created = await createBuilderProspect({
      company_name: `${TEST_PREFIX} Ivara Homes`,
      builder_status: 'prospect',
      relationship_strength: 'known',
      opportunity_potential: 'medium',
      timing_status: 'growth_mode',
      research_status: 'researched',
    });
    createdProspectIds.push(created.id);
    await upsertBuilderProfile(created.id, { estimated_fit_score: 61, research_source: 'manual' });

    const updated = await updateBuilderProspect(created.id, {
      builder_status: 'strategic_partner',
      relationship_strength: 'trusted_partner',
      opportunity_potential: 'strategic',
      timing_status: 'active_project',
      founder_notes: 'Long-term trusted partner',
    });
    assert(updated.builder_status === 'strategic_partner', 'strategic_partner saved through update');
    assert(updated.relationship_strength === 'trusted_partner', 'trusted_partner saved');

    const scores = await refreshBuilderTargetScoreForProspect(created.id, { now: NOW });
    assert(scores.score_kind === 'partner_value', 'recalculate uses partner value score');
    assert(scores.partner_value_score >= 70, `partner score >= 70, got ${scores.partner_value_score}`);
    assert(scores.partner_value_band !== 'C' && scores.partner_value_band !== 'D', 'not Band C/D');
    assert(
      scores.partner_value_band === 'A' || scores.partner_value_band === 'B',
      `expected Band A or B, got ${scores.partner_value_band}`
    );

    const full = await getBuilderProspectById(created.id);
    assert(full.target_scores, 'GET prospect includes target_scores');
    assert(full.target_scores.partner_value_score >= 70, 'target_scores has partner value');

    const { partners } = await getStrategicPartners({ limit: 20 });
    const ivara = partners.find((p) => p.company_name.includes('Ivara'));
    assert(ivara, 'strategic_partner appears in strategic partners API');
    assert(ivara.partner_value_score >= 70, 'strategic partners API returns partner value score');

    const { targets } = await getTopBuilderTargets({ limit: 20 });
    assert(!targets.some((t) => t.prospect_id === created.id), 'not in prospect contact list');

    console.log('Ivara debug result:', {
      builder_status: updated.builder_status,
      partner_value_score: scores.partner_value_score,
      partner_value_band: scores.partner_value_band,
      website_fit_score: 61,
    });

    console.log('\n✓ All PR8E.3 debug tests passed\n');
  } finally {
    await cleanup();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n✗', err.message);
  cleanup()
    .then(() => pool.end())
    .finally(() => process.exit(1));
});
