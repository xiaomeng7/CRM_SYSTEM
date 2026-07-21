#!/usr/bin/env node
/**
 * Phase 3B.2a — Create empty `_prisma_migrations` on neon_dev only.
 *
 * NOT a baseline resolve. Does NOT insert rows. Does NOT mark migrations applied.
 *
 * DDL source (verified): Prisma schema-engine binary shipped with @prisma/engines@6.19.3
 * (engines commit c2990dca591cba766e3b7ef5d9e8a84796e47ab7), PostgreSQL flavour string:
 *   CREATE TABLE _prisma_migrations ( ... )
 *
 * Usage:
 *   node scripts/bootstrap-empty-prisma-migration-history.js --env neon_dev --execute-approved-bootstrap
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  assertProductOsDatabaseTarget,
  resolveDatabaseUrlForEnv,
  assertOutputHasNoSecrets,
  parseDbIdentity
} = require("../src/v2/env-guard");

const PACKAGE_ROOT = path.join(__dirname, "..");
const CRM_SYSTEM_ROOT = path.join(PACKAGE_ROOT, "..", "..");

/** Approved fingerprint comes from PRODUCT_OS_DEV_HOST_FINGERPRINT (Phase 3B.2b+). */

/**
 * Exact PostgreSQL DDL extracted from:
 * node_modules/.pnpm/@prisma+engines@6.19.3/.../schema-engine-darwin-arm64
 * via `strings` — PostgreSQL candidate (TIMESTAMPTZ / now() / INTEGER).
 * Do not invent columns.
 */
const PRISMA_MIGRATIONS_DDL = `
CREATE TABLE _prisma_migrations (
    id                      VARCHAR(36) PRIMARY KEY NOT NULL,
    checksum                VARCHAR(64) NOT NULL,
    finished_at             TIMESTAMPTZ,
    migration_name          VARCHAR(255) NOT NULL,
    logs                    TEXT,
    rolled_back_at          TIMESTAMPTZ,
    started_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    applied_steps_count     INTEGER NOT NULL DEFAULT 0
)
`.trim();

const EXPECTED_COLUMNS = Object.freeze([
  "id",
  "checksum",
  "finished_at",
  "migration_name",
  "logs",
  "rolled_back_at",
  "started_at",
  "applied_steps_count"
]);

const V1_TABLES = Object.freeze([
  "settings",
  "product_catalog",
  "sku_library",
  "labour_library",
  "product_bom",
  "product_labour",
  "product_experiences",
  "product_capabilities",
  "product_rules",
  "product_content",
  "product_icons",
  "product_images",
  "product_theme",
  "product_layout",
  "product_automation",
  "change_log"
]);

function loadDotEnvFiles() {
  for (const file of [
    path.join(CRM_SYSTEM_ROOT, "..", ".env"),
    path.join(CRM_SYSTEM_ROOT, ".env"),
    path.join(PACKAGE_ROOT, ".env")
  ]) {
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, "utf8").split(/\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      let v = t.slice(i + 1).trim();
      if (
        (v.startsWith('"') && v.endsWith('"')) ||
        (v.startsWith("'") && v.endsWith("'"))
      ) {
        v = v.slice(1, -1);
      }
      if (process.env[k] === undefined) process.env[k] = v;
    }
  }
}

function parseArgs(argv) {
  let envName = null;
  let execute = false;
  let acceptBranch = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--env") envName = argv[++i];
    else if (a.startsWith("--env=")) envName = a.slice("--env=".length);
    else if (a === "--execute-approved-bootstrap") execute = true;
    else if (a === "--accept-operator-declared-branch") acceptBranch = argv[++i];
    else if (a.startsWith("--accept-operator-declared-branch=")) {
      acceptBranch = a.slice("--accept-operator-declared-branch=".length);
    } else if (a === "--help" || a === "-h") {
      console.log(
        [
          "bootstrap-empty-prisma-migration-history.js",
          "  --env neon_dev   (required; only neon_dev allowed)",
          "  --execute-approved-bootstrap",
          "  --accept-operator-declared-branch product-os-v2-dev"
        ].join("\n")
      );
      process.exit(0);
    } else {
      const err = new Error(`Unrecognized or disallowed argument: ${a}`);
      err.code = "PRODUCT_OS_ARGS_REJECTED";
      throw err;
    }
  }
  return { envName, execute, acceptBranch };
}

async function main() {
  loadDotEnvFiles();
  const { envName, execute, acceptBranch } = parseArgs(process.argv.slice(2));

  if (envName !== "neon_dev") {
    console.error(
      JSON.stringify({
        code: "PRODUCT_OS_BOOTSTRAP_ENV_REFUSED",
        message: "Bootstrap allows --env neon_dev only."
      })
    );
    process.exit(1);
  }
  if (acceptBranch && acceptBranch !== "product-os-v2-dev") {
    console.error(
      JSON.stringify({
        code: "PRODUCT_OS_BRANCH_MISMATCH",
        message: "Operator-declared branch must be product-os-v2-dev."
      })
    );
    process.exit(1);
  }
  if (!execute) {
    console.error(
      "Bootstrap disabled by default. Re-run with --execute-approved-bootstrap after PO approval."
    );
    process.exit(2);
  }

  const gate = assertProductOsDatabaseTarget({
    envName: "neon_dev",
    requireFingerprint: true,
    requireUrl: true
  });
  const expectedFp = String(process.env.PRODUCT_OS_DEV_HOST_FINGERPRINT || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  const fp = gate.hostFingerprint.replace(/^sha256:/, "");
  if (!expectedFp || fp !== expectedFp) {
    console.error(
      JSON.stringify({
        code: "PRODUCT_OS_FINGERPRINT_MISMATCH",
        message: "Computed fingerprint does not match PRODUCT_OS_DEV_HOST_FINGERPRINT"
      })
    );
    process.exit(1);
  }

  const url = resolveDatabaseUrlForEnv("neon_dev");
  if (!url) {
    console.error("Missing PRODUCT_OS_DEV_DATABASE_URL");
    process.exit(1);
  }
  // Never select production URL.
  if (resolveDatabaseUrlForEnv("production")) {
    // presence OK; identity collision already checked by assertProductOsDatabaseTarget
  }

  console.log(
    JSON.stringify({
      phase: "3B.2a",
      action: "bootstrap_empty_prisma_migration_history",
      env: "neon_dev",
      hostFingerprint: gate.hostFingerprint,
      ddlSource:
        "@prisma/engines@6.19.3 schema-engine-darwin-arm64 PostgreSQL CREATE TABLE _prisma_migrations",
      enginesCommit: "c2990dca591cba766e3b7ef5d9e8a84796e47ab7",
      insertsRows: false,
      resolveApplied: false
    })
  );

  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 20000,
    statement_timeout: 60000
  });

  await client.connect();
  try {
    // Preconditions outside write txn for clarity, then create in a transaction.
    const exists = (
      await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='_prisma_migrations'
        ) AS exists
      `)
    ).rows[0].exists;
    if (exists) {
      console.error(
        JSON.stringify({
          code: "PRODUCT_OS_BOOTSTRAP_ALREADY_EXISTS",
          message: "_prisma_migrations already exists; refusing to bootstrap."
        })
      );
      process.exit(1);
    }

    const tables = (
      await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
      `)
    ).rows.map((r) => r.table_name);
    const v1Present = V1_TABLES.filter((t) => tables.includes(t));
    const pos2Present = tables.filter((t) => t.startsWith("pos2_"));
    if (v1Present.length || pos2Present.length) {
      console.error(
        JSON.stringify({
          code: "PRODUCT_OS_OBJECTS_UNEXPECTED",
          message: "Product OS objects already present; refusing bootstrap.",
          v1Present,
          pos2Present
        })
      );
      process.exit(1);
    }

    await client.query("BEGIN");
    try {
      await client.query(PRISMA_MIGRATIONS_DDL);

      const cols = (
        await client.query(`
          SELECT column_name, data_type, is_nullable, column_default
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name='_prisma_migrations'
          ORDER BY ordinal_position
        `)
      ).rows;
      const colNames = cols.map((c) => c.column_name);
      if (JSON.stringify(colNames) !== JSON.stringify(EXPECTED_COLUMNS)) {
        throw Object.assign(
          new Error(
            `Column mismatch. expected=${EXPECTED_COLUMNS.join(",")} actual=${colNames.join(",")}`
          ),
          { code: "PRODUCT_OS_BOOTSTRAP_DDL_MISMATCH" }
        );
      }

      const pk = (
        await client.query(`
          SELECT kcu.column_name
          FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON kcu.constraint_name=tc.constraint_name AND kcu.table_schema=tc.table_schema
          WHERE tc.table_schema='public' AND tc.table_name='_prisma_migrations'
            AND tc.constraint_type='PRIMARY KEY'
        `)
      ).rows.map((r) => r.column_name);
      if (pk.length !== 1 || pk[0] !== "id") {
        throw Object.assign(new Error(`Unexpected PK: ${pk.join(",")}`), {
          code: "PRODUCT_OS_BOOTSTRAP_DDL_MISMATCH"
        });
      }

      const count = (
        await client.query(`SELECT COUNT(*)::int AS c FROM _prisma_migrations`)
      ).rows[0].c;
      if (count !== 0) {
        throw Object.assign(new Error(`Expected 0 rows, found ${count}`), {
          code: "PRODUCT_OS_BOOTSTRAP_ROWS_UNEXPECTED"
        });
      }

      await client.query("COMMIT");

      const payload = {
        phase: "3B.2a",
        status: "BOOTSTRAP_OK",
        hostFingerprint: gate.hostFingerprint,
        table: "_prisma_migrations",
        rowCount: 0,
        columns: colNames,
        primaryKey: pk,
        databaseName: parseDbIdentity(url)?.database || null
      };
      assertOutputHasNoSecrets(JSON.stringify(payload), [url]);
      console.log(JSON.stringify(payload));
    } catch (err) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw err;
    }
  } catch (err) {
    console.error(err.message || String(err));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  PRISMA_MIGRATIONS_DDL,
  EXPECTED_COLUMNS
};
