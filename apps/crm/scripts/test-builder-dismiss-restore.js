#!/usr/bin/env node
/**
 * Builder dismiss + restore tests.
 */

require('../lib/load-env');
const fs = require('fs');
const path = require('path');
const { pool } = require('../lib/db');
const {
  dismissBuilderProspect,
  restoreBuilderProspect,
  listDismissedBuilders,
} = require('../services/builder/builderProspectService');
const { createBuilderProspect } = require('../services/builder/builderProspectService');
const { getBuilderPipelineView } = require('../services/builder/builderPipelineService');

const TEST_PREFIX = 'test_dismiss_';
const createdProspectIds = [];

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function ensureMigration() {
  const sql = fs.readFileSync(path.join(__dirname, '../database/081_builder_dismiss_snapshot.sql'), 'utf8');
  await pool.query(sql);
}

async function cleanup() {
  if (createdProspectIds.length) {
    await pool.query(`DELETE FROM b2b_prospects WHERE id = ANY($1::uuid[])`, [createdProspectIds]);
  }
  await pool.query(`DELETE FROM b2b_prospects WHERE company_name LIKE $1`, [`${TEST_PREFIX}%`]);
}

async function main() {
  try {
    await ensureMigration();
    await cleanup();

    const prospect = await createBuilderProspect({
      company_name: `${TEST_PREFIX} Restore Me`,
      website: 'https://example-dismiss.test',
      pipeline_stage: 'contact_discovery',
      research_status: 'researched',
    });
    createdProspectIds.push(prospect.id);

    const dismissed = await dismissBuilderProspect(prospect.id, { db: pool });
    assert(dismissed.prospect.relationship_stage === 'not_fit', 'dismissed');
    assert(dismissed.restore_snapshot.pipeline_stage === 'contact_discovery', 'snapshot saved');

    const pipeline = await getBuilderPipelineView({ db: pool });
    assert(!pipeline.builders.some((b) => b.id === prospect.id), 'hidden from pipeline');

    const removed = await listDismissedBuilders({}, { db: pool });
    assert(removed.prospects.some((p) => p.id === prospect.id), 'listed as dismissed');

    const restored = await restoreBuilderProspect(prospect.id, { db: pool });
    assert(restored.pipeline_stage === 'contact_discovery', 'restored stage');
    assert(restored.relationship_stage === 'discovered', 'restored relationship');

    const pipeline2 = await getBuilderPipelineView({ db: pool });
    assert(pipeline2.builders.some((b) => b.id === prospect.id), 'back in pipeline');

    console.log('Builder dismiss/restore tests passed.');
  } catch (err) {
    console.error('FAILED:', err.message);
    process.exitCode = 1;
  } finally {
    await cleanup();
    await pool.end();
  }
}

main();
