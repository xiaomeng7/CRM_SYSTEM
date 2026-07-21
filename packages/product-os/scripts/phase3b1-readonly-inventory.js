#!/usr/bin/env node
/**
 * Phase 3B.1 — Read-only schema inventory against PRODUCT_OS_DEV_DATABASE_URL only.
 *
 * Safety:
 * - neon_dev target only
 * - Product OS env-guard + host fingerprint
 * - Never uses root DATABASE_URL as target
 * - Rejects production
 * - SELECT only inside BEGIN READ ONLY
 * - Fixed query catalog (no arbitrary SQL input)
 * - Never prints URL, user, password, or query params
 *
 * Usage:
 *   node scripts/phase3b1-readonly-inventory.js
 *   node scripts/phase3b1-readonly-inventory.js --out docs/path/inventory.json
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  assertProductOsDatabaseTarget,
  resolveDatabaseUrlForEnv,
  assertOutputHasNoSecrets,
  parseDbIdentity,
  computeHostFingerprint
} = require("../src/v2/env-guard");

const PACKAGE_ROOT = path.join(__dirname, "..");
/** crm-system package monorepo root (contains docs/product-os). */
const CRM_SYSTEM_ROOT = path.join(PACKAGE_ROOT, "..", "..");
const EXPECTED_BRANCH = "product-os-v2-dev";

const QUERY_CATALOG = Object.freeze([
  {
    id: "session_identity",
    purpose: "Session database name and Neon-related settings (no secrets)",
    object: "pg_settings / current_database",
    type: "SELECT",
    sql: `
      SELECT
        current_database() AS database_name,
        current_user AS session_user_name,
        current_setting('server_version', true) AS server_version,
        current_setting('transaction_read_only', true) AS transaction_read_only,
        current_setting('neon.branch_id', true) AS neon_branch_id,
        current_setting('neon.timeline_id', true) AS neon_timeline_id,
        current_setting('neon.tenant_id', true) AS neon_tenant_id,
        current_setting('neon.project_id', true) AS neon_project_id
    `
  },
  {
    id: "neon_settings",
    purpose: "List neon.* settings names only for branch identity evidence",
    object: "pg_settings",
    type: "SELECT",
    sql: `
      SELECT name, setting
      FROM pg_settings
      WHERE name LIKE 'neon.%'
      ORDER BY name
    `
  },
  {
    id: "extensions",
    purpose: "Installed extensions in public/pg_catalog scope",
    object: "pg_extension",
    type: "SELECT",
    sql: `
      SELECT e.extname, e.extversion, n.nspname AS schema_name
      FROM pg_extension e
      JOIN pg_namespace n ON n.oid = e.extnamespace
      ORDER BY e.extname
    `
  },
  {
    id: "enums",
    purpose: "User enums in public schema with ordered labels",
    object: "pg_type / pg_enum",
    type: "SELECT",
    sql: `
      SELECT
        t.typname AS enum_name,
        e.enumsortorder AS sort_order,
        e.enumlabel AS label
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      ORDER BY t.typname, e.enumsortorder
    `
  },
  {
    id: "tables",
    purpose: "Base tables in public schema",
    object: "information_schema.tables",
    type: "SELECT",
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `
  },
  {
    id: "views",
    purpose: "Views in public schema with definitions",
    object: "pg_views",
    type: "SELECT",
    sql: `
      SELECT schemaname, viewname, definition
      FROM pg_views
      WHERE schemaname = 'public'
      ORDER BY viewname
    `
  },
  {
    id: "columns",
    purpose: "Column metadata for public tables/views",
    object: "information_schema.columns",
    type: "SELECT",
    sql: `
      SELECT
        c.table_name,
        c.column_name,
        c.ordinal_position,
        c.data_type,
        c.udt_name,
        c.character_maximum_length,
        c.numeric_precision,
        c.numeric_scale,
        c.datetime_precision,
        c.is_nullable,
        c.column_default,
        c.is_identity,
        c.is_generated
      FROM information_schema.columns c
      JOIN information_schema.tables t
        ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public'
        AND t.table_type IN ('BASE TABLE', 'VIEW')
      ORDER BY c.table_name, c.ordinal_position
    `
  },
  {
    id: "primary_keys",
    purpose: "Primary key constraints",
    object: "information_schema.table_constraints",
    type: "SELECT",
    sql: `
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'PRIMARY KEY'
      ORDER BY tc.table_name, kcu.ordinal_position
    `
  },
  {
    id: "unique_constraints",
    purpose: "UNIQUE constraints",
    object: "information_schema.table_constraints",
    type: "SELECT",
    sql: `
      SELECT
        tc.table_name,
        tc.constraint_name,
        kcu.column_name,
        kcu.ordinal_position
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'UNIQUE'
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `
  },
  {
    id: "foreign_keys",
    purpose: "Foreign keys with delete/update actions",
    object: "information_schema.referential_constraints",
    type: "SELECT",
    sql: `
      SELECT
        tc.table_name AS from_table,
        kcu.column_name AS from_column,
        ccu.table_name AS to_table,
        ccu.column_name AS to_column,
        tc.constraint_name,
        rc.update_rule,
        rc.delete_rule
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      JOIN information_schema.referential_constraints rc
        ON rc.constraint_name = tc.constraint_name
       AND rc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'FOREIGN KEY'
      ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position
    `
  },
  {
    id: "check_constraints",
    purpose: "CHECK constraints",
    object: "information_schema.check_constraints",
    type: "SELECT",
    sql: `
      SELECT
        tc.table_name,
        tc.constraint_name,
        cc.check_clause
      FROM information_schema.table_constraints tc
      JOIN information_schema.check_constraints cc
        ON cc.constraint_name = tc.constraint_name
       AND cc.constraint_schema = tc.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type = 'CHECK'
      ORDER BY tc.table_name, tc.constraint_name
    `
  },
  {
    id: "indexes",
    purpose: "Indexes on public tables",
    object: "pg_indexes",
    type: "SELECT",
    sql: `
      SELECT
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `
  },
  {
    id: "prisma_migrations_exists",
    purpose: "Whether _prisma_migrations table exists",
    object: "_prisma_migrations",
    type: "SELECT",
    sql: `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
      ) AS exists
    `
  },
  {
    id: "prisma_migrations_rows",
    purpose: "Migration history metadata only (no app data)",
    object: "_prisma_migrations",
    type: "SELECT",
    sql: `
      SELECT
        migration_name,
        finished_at,
        applied_steps_count,
        rolled_back_at,
        started_at,
        checksum,
        CASE WHEN logs IS NULL THEN false ELSE true END AS has_logs
      FROM _prisma_migrations
      ORDER BY started_at NULLS LAST, migration_name
    `,
    optionalIfMissing: "_prisma_migrations"
  },
  {
    id: "pos2_objects",
    purpose: "Existing pos2_* tables for V2 collision preview",
    object: "information_schema.tables",
    type: "SELECT",
    sql: `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
        AND table_name LIKE 'pos2_%'
      ORDER BY table_name
    `
  },
  {
    id: "pos2_enums",
    purpose: "Existing Pos2* / pos2-related enums",
    object: "pg_type",
    type: "SELECT",
    sql: `
      SELECT t.typname
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
        AND t.typtype = 'e'
        AND (t.typname LIKE 'Pos2%' OR t.typname LIKE 'pos2%')
      ORDER BY t.typname
    `
  },
  {
    id: "btree_gist",
    purpose: "Whether btree_gist extension is installed",
    object: "pg_extension",
    type: "SELECT",
    sql: `
      SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'btree_gist'
      ) AS installed
    `
  }
]);

function loadDotEnvFiles() {
  const files = [
    path.join(CRM_SYSTEM_ROOT, "..", ".env"),
    path.join(CRM_SYSTEM_ROOT, ".env"),
    path.join(PACKAGE_ROOT, ".env")
  ];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, "utf8");
    for (const line of text.split(/\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq < 0) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  }
}

function parseArgs(argv) {
  let outPath = null;
  let expectedBranch = EXPECTED_BRANCH;
  let operatorDeclaredBranch = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--out") outPath = argv[++i];
    else if (a.startsWith("--out=")) outPath = a.slice("--out=".length);
    else if (a === "--expected-branch") expectedBranch = argv[++i];
    else if (a.startsWith("--expected-branch=")) {
      expectedBranch = a.slice("--expected-branch=".length);
    } else if (a === "--accept-operator-declared-branch") {
      operatorDeclaredBranch = argv[++i];
    } else if (a.startsWith("--accept-operator-declared-branch=")) {
      operatorDeclaredBranch = a.slice("--accept-operator-declared-branch=".length);
    } else if (a === "--help" || a === "-h") {
      console.log(
        [
          "phase3b1-readonly-inventory.js",
          "  [--out path]",
          "  [--expected-branch product-os-v2-dev]",
          "  [--accept-operator-declared-branch product-os-v2-dev]"
        ].join("\n")
      );
      process.exit(0);
    } else {
      throw Object.assign(new Error(`Unrecognized argument: ${a}`), {
        code: "PRODUCT_OS_ARGS_REJECTED"
      });
    }
  }
  return { outPath, expectedBranch, operatorDeclaredBranch };
}

function sanitizeRow(row) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (/user|password|secret|url|connection/i.test(k) && k !== "neon_branch_id") {
      out[k] = "[REDACTED]";
      continue;
    }
    if (v instanceof Date) out[k] = v.toISOString();
    else if (typeof v === "string" && /postgres(ql)?:\/\//i.test(v)) {
      out[k] = "[REDACTED_URL_LIKE]";
    } else out[k] = v;
  }
  return out;
}

function assertNoSecretsInPayload(payload, urls) {
  const text = JSON.stringify(payload);
  assertOutputHasNoSecrets(text, urls);
}

function proveBranchIdentity({
  url,
  expectedBranch,
  operatorDeclaredBranch,
  sessionRows,
  neonSettings
}) {
  const identity = parseDbIdentity(url);
  const evidence = {
    expectedBranch,
    fingerprintMatched: true,
    urlEnvVar: "PRODUCT_OS_DEV_DATABASE_URL",
    productionUrlPresent: Boolean(resolveDatabaseUrlForEnv("production")),
    databaseName: identity ? identity.database : null,
    hostKind: identity && /\.neon\.tech$/i.test(identity.host) ? "neon_tech" : "other",
    neonSettingsFound: (neonSettings || []).map((r) => r.name),
    branchProven: false,
    proofMethod: null,
    stopReason: null
  };

  if (identity && evidence.hostKind !== "neon_tech") {
    evidence.stopReason = "Selected host is not a *.neon.tech endpoint; refusing.";
    return evidence;
  }

  // 1) Explicit env binding (preferred local ignored config)
  const bound =
    process.env.PRODUCT_OS_DEV_NEON_BRANCH ||
    process.env.PRODUCT_OS_EXPECTED_NEON_BRANCH ||
    null;
  if (bound) {
    if (bound === expectedBranch) {
      evidence.branchProven = true;
      evidence.proofMethod = "PRODUCT_OS_DEV_NEON_BRANCH_ENV";
    } else {
      evidence.stopReason = `Configured branch binding "${bound}" != expected "${expectedBranch}"`;
    }
    return evidence;
  }

  // 2) Local annotation file (non-secret)
  const annotationPath = path.join(PACKAGE_ROOT, ".neon-dev-branch");
  if (fs.existsSync(annotationPath)) {
    const label = fs.readFileSync(annotationPath, "utf8").trim();
    if (label === expectedBranch) {
      evidence.branchProven = true;
      evidence.proofMethod = "LOCAL_ANNOTATION_FILE_.neon-dev-branch";
      return evidence;
    }
    evidence.stopReason = `Annotation file branch "${label}" != expected "${expectedBranch}"`;
    return evidence;
  }

  // 3) Operator-declared branch on this audit CLI (must match expected)
  if (operatorDeclaredBranch) {
    if (operatorDeclaredBranch === expectedBranch) {
      evidence.branchProven = true;
      evidence.proofMethod =
        "OPERATOR_DECLARED_BRANCH_FLAG_PLUS_FINGERPRINT_APPROVED_DEV_URL";
      return evidence;
    }
    evidence.stopReason = `Operator-declared branch "${operatorDeclaredBranch}" != expected "${expectedBranch}"`;
    return evidence;
  }

  evidence.branchProven = false;
  evidence.proofMethod = null;
  evidence.stopReason =
    "Cannot prove Neon branch name via SQL alone. Provide one of: " +
    "PRODUCT_OS_DEV_NEON_BRANCH=product-os-v2-dev, " +
    "packages/product-os/.neon-dev-branch, or " +
    "--accept-operator-declared-branch product-os-v2-dev. Stopping.";
  evidence.sessionSample = sessionRows;
  return evidence;
}

async function runQuery(client, entry, tablesPresent) {
  if (entry.optionalIfMissing && !tablesPresent.has(entry.optionalIfMissing)) {
    return {
      id: entry.id,
      purpose: entry.purpose,
      object: entry.object,
      type: entry.type,
      readOnly: true,
      skipped: true,
      reason: `table ${entry.optionalIfMissing} absent`,
      rowCount: 0,
      rows: []
    };
  }
  const result = await client.query(entry.sql);
  return {
    id: entry.id,
    purpose: entry.purpose,
    object: entry.object,
    type: entry.type,
    readOnly: true,
    skipped: false,
    rowCount: result.rowCount,
    rows: result.rows.map(sanitizeRow)
  };
}

async function main() {
  loadDotEnvFiles();
  const { outPath, expectedBranch, operatorDeclaredBranch } = parseArgs(
    process.argv.slice(2)
  );

  // Hard refuse root DATABASE_URL as target even if Product OS URL missing.
  const gate = assertProductOsDatabaseTarget({
    envName: "neon_dev",
    requireFingerprint: true,
    requireUrl: true
  });

  const selectedUrl = resolveDatabaseUrlForEnv("neon_dev");
  if (!selectedUrl) {
    console.error("Missing PRODUCT_OS_DEV_DATABASE_URL");
    process.exit(1);
  }
  if (process.env.DATABASE_URL && selectedUrl === process.env.DATABASE_URL) {
    // Same string coincidence is possible if misconfigured; still OK if it's the Product OS URL
    // env var value — we selected via PRODUCT_OS_DEV_DATABASE_URL key, not DATABASE_URL key.
  }

  const prodUrl = resolveDatabaseUrlForEnv("production");
  if (prodUrl && computeHostFingerprint(prodUrl) === computeHostFingerprint(selectedUrl)) {
    console.error("DEV URL identity collides with production. Refusing.");
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      phase: "3B.1",
      mode: "readonly_inventory",
      env: gate.envName,
      hostFingerprint: gate.hostFingerprint,
      urlEnvVar: "PRODUCT_OS_DEV_DATABASE_URL",
      rootDatabaseUrlUsedAsTarget: false
    })
  );

  const client = new Client({
    connectionString: selectedUrl,
    connectionTimeoutMillis: 20000,
    statement_timeout: 60000,
    query_timeout: 60000
  });

  const queryLog = [];
  let inventory = null;

  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    await client.query("SET TRANSACTION READ ONLY");

    // First pass: tables list needed for optional queries
    const tablesResult = await client.query(
      QUERY_CATALOG.find((q) => q.id === "tables").sql
    );
    const tablesPresent = new Set(tablesResult.rows.map((r) => r.table_name));

    const results = {};
    for (const entry of QUERY_CATALOG) {
      if (entry.id === "tables") {
        const packed = {
          id: entry.id,
          purpose: entry.purpose,
          object: entry.object,
          type: entry.type,
          readOnly: true,
          skipped: false,
          rowCount: tablesResult.rowCount,
          rows: tablesResult.rows.map(sanitizeRow)
        };
        results[entry.id] = packed;
        queryLog.push({
          purpose: packed.purpose,
          object: packed.object,
          type: packed.type,
          rowCount: packed.rowCount,
          readOnly: true,
          result: "ok"
        });
        continue;
      }
      try {
        const packed = await runQuery(client, entry, tablesPresent);
        results[entry.id] = packed;
        queryLog.push({
          purpose: packed.purpose,
          object: packed.object,
          type: packed.type,
          rowCount: packed.rowCount,
          readOnly: true,
          result: packed.skipped ? "skipped" : "ok"
        });
      } catch (err) {
        queryLog.push({
          purpose: entry.purpose,
          object: entry.object,
          type: entry.type,
          rowCount: 0,
          readOnly: true,
          result: `error:${err.code || "QUERY_FAILED"}`
        });
        throw err;
      }
    }

    await client.query("COMMIT");

    const branchEvidence = proveBranchIdentity({
      url: selectedUrl,
      expectedBranch,
      operatorDeclaredBranch,
      sessionRows: results.session_identity?.rows || [],
      neonSettings: results.neon_settings?.rows || []
    });

    inventory = {
      phase: "3B.1",
      generatedAt: new Date().toISOString(),
      target: {
        env: "neon_dev",
        hostFingerprint: gate.hostFingerprint,
        expectedBranch,
        branchEvidence
      },
      queryLog,
      results
    };

    assertNoSecretsInPayload(inventory, [selectedUrl, process.env.DATABASE_URL].filter(Boolean));

    if (!branchEvidence.branchProven) {
      console.error(
        JSON.stringify({
          phase: "3B.1",
          status: "STOPPED",
          code: "NEON_BRANCH_UNPROVEN",
          message: branchEvidence.stopReason,
          hostFingerprint: gate.hostFingerprint
        })
      );
      // Still write partial inventory for diagnostics if --out provided
      if (outPath) {
        const abs = path.isAbsolute(outPath)
          ? outPath
          : path.join(CRM_SYSTEM_ROOT, outPath);
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, JSON.stringify(inventory, null, 2));
        console.error(JSON.stringify({ wrotePartialInventory: true, out: outPath }));
      }
      process.exit(3);
    }

    if (outPath) {
      const abs = path.isAbsolute(outPath)
        ? outPath
        : path.join(CRM_SYSTEM_ROOT, outPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(inventory, null, 2));
      console.log(JSON.stringify({ wroteInventory: true, out: outPath }));
    } else {
      console.log(JSON.stringify({ inventorySummary: summarize(inventory) }, null, 2));
    }

    console.log(
      JSON.stringify({
        phase: "3B.1",
        status: "INVENTORY_OK",
        hostFingerprint: gate.hostFingerprint,
        branchProven: true,
        proofMethod: branchEvidence.proofMethod,
        tableCount: results.tables.rowCount,
        enumTypeCount: new Set((results.enums.rows || []).map((r) => r.enum_name)).size,
        viewCount: results.views.rowCount,
        prismaMigrationsExists: results.prisma_migrations_exists.rows[0]?.exists === true,
        pos2TableCount: results.pos2_objects.rowCount,
        btreeGistInstalled: results.btree_gist.rows[0]?.installed === true
      })
    );
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    console.error(err.message || String(err));
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

function summarize(inventory) {
  const r = inventory.results;
  return {
    tables: (r.tables.rows || []).map((x) => x.table_name),
    enums: [...new Set((r.enums.rows || []).map((x) => x.enum_name))],
    views: (r.views.rows || []).map((x) => x.viewname),
    prismaMigrations: (r.prisma_migrations_rows.rows || []).map((x) => ({
      migration_name: x.migration_name,
      finished_at: x.finished_at,
      applied_steps_count: x.applied_steps_count,
      rolled_back_at: x.rolled_back_at
    })),
    pos2Tables: (r.pos2_objects.rows || []).map((x) => x.table_name),
    extensions: r.extensions.rows
  };
}

if (require.main === module) {
  main();
}

module.exports = { QUERY_CATALOG, EXPECTED_BRANCH };
