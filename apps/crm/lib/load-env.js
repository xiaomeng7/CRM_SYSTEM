/**
 * Load .env from monorepo root (when running via pnpm from root) or current dir.
 * Call this once at app entrypoints; no-op if already loaded.
 */

const path = require('path');
const dotenv = require('dotenv');

const rootEnv = path.resolve(__dirname, '../../.env');
dotenv.config({ path: rootEnv });
if (!process.env.DATABASE_URL && !process.env.SERVICEM8_API_KEY) {
  dotenv.config();
}

module.exports = {};
