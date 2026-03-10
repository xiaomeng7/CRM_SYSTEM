/**
 * Run automations script
 * Invokes the automation engine. Typically run via cron on Railway (daily).
 */

require('../lib/load-env');
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
