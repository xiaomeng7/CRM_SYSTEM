#!/usr/bin/env node
/**
 * Phase 3B.2 — Pre/post deployment structural snapshot (read-only by default).
 * Reuses Product OS neon_dev guard. Never prints credentials.
 *
 * Usage:
 *   node scripts/phase3b2-schema-snapshot.js --label pre --out docs/product-os/_phase3b2-pre.json
 *   node scripts/phase3b2-schema-snapshot.js --label post --out docs/product-os/_phase3b2-post.json
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Client } = require("pg");
const {
  assertProductOsDatabaseTarget,
  resolveDatabaseUrlForEnv,
  assertOutputHasNoSecrets
} = require("../src/v2/env-guard");

const PACKAGE_ROOT = path.join(__dirname, "..");
const CRM_SYSTEM_ROOT = path.join(PACKAGE_ROOT, "..", "..");

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

const V1_ENUMS = Object.freeze(["product_type", "record_status", "included_type"]);
const V1_VIEWS = Object.freeze(["product_pricing_summary"]);

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

function hashList(items) {
  const material = [...items].sort().join("\n");
  return `sha256:${crypto.createHash("sha256").update(material, "utf8").digest("hex")}`;
}

function parseArgs(argv) {
  let label = "snapshot";
  let outPath = null;
  let acceptBranch = null;
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") continue;
    if (a === "--label") label = argv[++i];
    else if (a.startsWith("--label=")) label = a.slice("--label=".length);
    else if (a === "--out") outPath = argv[++i];
    else if (a.startsWith("--out=")) outPath = a.slice("--out=".length);
    else if (a === "--accept-operator-declared-branch") acceptBranch = argv[++i];
    else if (a.startsWith("--accept-operator-declared-branch=")) {
      acceptBranch = a.slice("--accept-operator-declared-branch=".length);
    } else {
      throw new Error(`Unrecognized argument: ${a}`);
    }
  }
  return { label, outPath, acceptBranch };
}

function isProductOsObject(name) {
  if (!name) return false;
  if (name === "_prisma_migrations") return true;
  if (name.startsWith("pos2_")) return true;
  if (V1_TABLES.includes(name)) return true;
  if (V1_VIEWS.includes(name)) return true;
  return false;
}

async function main() {
  loadDotEnvFiles();
  const { label, outPath, acceptBranch } = parseArgs(process.argv.slice(2));
  if (acceptBranch && acceptBranch !== "product-os-v2-dev") {
    console.error("Branch declaration mismatch");
    process.exit(1);
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
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 20000,
    statement_timeout: 60000
  });

  await client.connect();
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SET TRANSACTION READ ONLY");

    const session = await client.query(`
      SELECT current_database() AS database_name,
             current_schema() AS active_schema,
             current_setting('neon.branch_id', true) AS neon_branch_id,
             current_setting('transaction_read_only', true) AS transaction_read_only
    `);

    const tables = (
      await client.query(`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public' AND table_type='BASE TABLE'
        ORDER BY table_name
      `)
    ).rows.map((r) => r.table_name);

    const views = (
      await client.query(`
        SELECT viewname FROM pg_views WHERE schemaname='public' ORDER BY viewname
      `)
    ).rows.map((r) => r.viewname);

    const enums = (
      await client.query(`
        SELECT t.typname AS enum_name,
               string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) AS labels
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid=t.oid
        JOIN pg_namespace n ON n.oid=t.typnamespace
        WHERE n.nspname='public'
        GROUP BY t.typname
        ORDER BY t.typname
      `)
    ).rows;

    const extensions = (
      await client.query(`
        SELECT extname, extversion FROM pg_extension ORDER BY extname
      `)
    ).rows;

    const indexes = (
      await client.query(`
        SELECT tablename, indexname, indexdef
        FROM pg_indexes WHERE schemaname='public'
        ORDER BY tablename, indexname
      `)
    ).rows;

    const fks = (
      await client.query(`
        SELECT tc.table_name, tc.constraint_name, rc.delete_rule, rc.update_rule
        FROM information_schema.table_constraints tc
        JOIN information_schema.referential_constraints rc
          ON rc.constraint_name=tc.constraint_name AND rc.constraint_schema=tc.table_schema
        WHERE tc.table_schema='public' AND tc.constraint_type='FOREIGN KEY'
        ORDER BY tc.table_name, tc.constraint_name
      `)
    ).rows;

    const checks = (
      await client.query(`
        SELECT tc.table_name, tc.constraint_name, cc.check_clause
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON cc.constraint_name=tc.constraint_name AND cc.constraint_schema=tc.table_schema
        WHERE tc.table_schema='public' AND tc.constraint_type='CHECK'
        ORDER BY tc.table_name, tc.constraint_name
      `)
    ).rows;

    const prismaExists = (
      await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema='public' AND table_name='_prisma_migrations'
        ) AS exists
      `)
    ).rows[0].exists;

    let migrations = [];
    if (prismaExists) {
      migrations = (
        await client.query(`
          SELECT migration_name, finished_at, applied_steps_count, rolled_back_at, checksum
          FROM _prisma_migrations
          ORDER BY started_at NULLS LAST, migration_name
        `)
      ).rows.map((r) => ({
        migration_name: r.migration_name,
        finished_at: r.finished_at ? new Date(r.finished_at).toISOString() : null,
        applied_steps_count: r.applied_steps_count,
        rolled_back_at: r.rolled_back_at
          ? new Date(r.rolled_back_at).toISOString()
          : null,
        checksum: r.checksum
      }));
    }

    const crmTables = tables.filter((t) => !isProductOsObject(t));
    const crmViews = views.filter((v) => !isProductOsObject(v));
    const pos2Tables = tables.filter((t) => t.startsWith("pos2_"));
    const v1TablesPresent = V1_TABLES.filter((t) => tables.includes(t));
    const v1EnumsPresent = V1_ENUMS.filter((e) =>
      enums.some((row) => row.enum_name === e)
    );
    const v1ViewsPresent = V1_VIEWS.filter((v) => views.includes(v));

    // CRM structural hashes (exclude Product OS objects)
    const crmIndexMaterial = indexes
      .filter((i) => !isProductOsObject(i.tablename))
      .map((i) => `${i.tablename}|${i.indexname}|${i.indexdef}`);
    const crmFkMaterial = fks
      .filter((f) => !isProductOsObject(f.table_name))
      .map(
        (f) =>
          `${f.table_name}|${f.constraint_name}|${f.delete_rule}|${f.update_rule}`
      );
    const crmCheckMaterial = checks
      .filter((c) => !isProductOsObject(c.table_name))
      .map((c) => `${c.table_name}|${c.constraint_name}|${c.check_clause}`);

    // Row counts only for Product OS tables (empty check) — never CRM business tables
    const posRowCounts = {};
    for (const t of [...v1TablesPresent, ...pos2Tables]) {
      const r = await client.query(`SELECT COUNT(*)::int AS c FROM "${t}"`);
      posRowCounts[t] = r.rows[0].c;
    }

    const btreeGist = extensions.some((e) => e.extname === "btree_gist");

    // Key V2 constraint presence
    const constraintNames = (
      await client.query(`
        SELECT conname FROM pg_constraint
        WHERE connamespace = 'public'::regnamespace
        ORDER BY conname
      `)
    ).rows.map((r) => r.conname);

    const snapshot = {
      phase: "3B.2",
      label,
      generatedAt: new Date().toISOString(),
      target: {
        env: "neon_dev",
        hostFingerprint: gate.hostFingerprint,
        expectedFingerprint: gate.expectedFingerprint,
        declaredBranch: "product-os-v2-dev",
        neonBranchId: session.rows[0].neon_branch_id,
        databaseName: session.rows[0].database_name,
        activeSchema: session.rows[0].active_schema,
        transactionReadOnly: session.rows[0].transaction_read_only
      },
      counts: {
        allTables: tables.length,
        allViews: views.length,
        allEnums: enums.length,
        crmTables: crmTables.length,
        crmViews: crmViews.length,
        v1Tables: v1TablesPresent.length,
        v1Enums: v1EnumsPresent.length,
        v1Views: v1ViewsPresent.length,
        pos2Tables: pos2Tables.length,
        indexes: indexes.length,
        foreignKeys: fks.length,
        checks: checks.length
      },
      hashes: {
        crmTableNames: hashList(crmTables),
        crmViewNames: hashList(crmViews),
        crmIndexes: hashList(crmIndexMaterial),
        crmForeignKeys: hashList(crmFkMaterial),
        crmChecks: hashList(crmCheckMaterial),
        allTableNames: hashList(tables),
        allViewNames: hashList(views)
      },
      productOs: {
        v1TablesPresent,
        v1EnumsPresent,
        v1ViewsPresent,
        pos2Tables,
        pos2Enums: enums
          .filter((e) => e.enum_name.startsWith("Pos2") || e.enum_name.startsWith("pos2"))
          .map((e) => ({ name: e.enum_name, labels: e.labels })),
        allEnums: enums,
        rowCounts: posRowCounts,
        btreeGistInstalled: btreeGist,
        notableConstraints: {
          kindRoleChk: constraintNames.includes("pos2_products_kind_role_chk"),
          priceExclusion:
            constraintNames.includes("pos2_product_prices_no_overlap_excl") ||
            constraintNames.some((n) => /price.*overlap|no_overlap/i.test(n)),
          addonNoRoom: constraintNames.includes("pos2_addon_profiles_no_new_room_chk"),
          addonNoExperience: constraintNames.includes(
            "pos2_addon_profiles_no_new_experience_chk"
          ),
          relationshipNoSelf: constraintNames.includes(
            "pos2_product_relationships_no_self_chk"
          ),
          aliasResolution: constraintNames.includes(
            "pos2_product_aliases_resolution_chk"
          )
        },
        constraintNameSample: constraintNames.filter(
          (n) => n.startsWith("pos2_") || n.includes("product_")
        )
      },
      extensions,
      prismaMigrations: {
        exists: prismaExists,
        rows: migrations
      },
      crmTableNames: crmTables,
      crmViewNames: crmViews
    };

    await client.query("COMMIT");

    assertOutputHasNoSecrets(JSON.stringify(snapshot), [url]);

    console.log(
      JSON.stringify({
        phase: "3B.2",
        label,
        hostFingerprint: gate.hostFingerprint,
        counts: snapshot.counts,
        hashes: snapshot.hashes,
        prismaMigrationsExists: prismaExists,
        migrationCount: migrations.length,
        btreeGist,
        v1Tables: v1TablesPresent.length,
        pos2Tables: pos2Tables.length
      })
    );

    if (outPath) {
      const abs = path.isAbsolute(outPath)
        ? outPath
        : path.join(CRM_SYSTEM_ROOT, outPath);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, JSON.stringify(snapshot, null, 2));
      console.log(JSON.stringify({ wrote: outPath }));
    }
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

main();
