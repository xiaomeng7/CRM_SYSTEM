/**
 * Run automations script
 * Invokes the automation engine (typically via cron, daily)
 */

require('dotenv').config();
const { runAutomations } = require('../automation/automation-engine');
const { pool } = require('../lib/db');

async function main() {
  try {
    const result = await runAutomations();
    console.log(`Automations complete: ${result.sent} sent, ${result.errors} errors`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
