#!/usr/bin/env node
/**
 * Guarded Product OS Prisma migrate runner.
 *
 * Usage:
 *   pnpm prisma:migrate -- --env neon_dev --mode preflight
 *   pnpm prisma:migrate -- --env neon_dev --mode status
 *   pnpm prisma:migrate -- --env neon_dev --mode deploy --execute-approved-migration
 *
 * Phase 3A.1: do not execute against a real database during remediation.
 * Deploy remains disabled unless --execute-approved-migration is present.
 *
 * Never prints DATABASE_URL / credentials. Never uses root DATABASE_URL as target.
 * Spawns Prisma without shell interpolation.
 */

const path = require("path");
const { spawnSync } = require("child_process");
const {
  ALLOWED_MODES,
  assertProductOsDatabaseTarget,
  parseCliArgs,
  resolveDatabaseUrlForEnv,
  buildSanitizedChildEnv,
  assertOutputHasNoSecrets,
  PRODUCTION_CONFIRM_VALUE
} = require("../src/v2/env-guard");

const PACKAGE_ROOT = path.join(__dirname, "..");
const SCHEMA_PATH = path.join(PACKAGE_ROOT, "prisma", "schema.prisma");
const MIGRATION_NAME = "20260721120000_add_handoff_authorized_snapshot";

const PRISMA_ALLOWLIST = Object.freeze({
  status: ["migrate", "status", "--schema", SCHEMA_PATH],
  deploy: ["migrate", "deploy", "--schema", SCHEMA_PATH]
});

function usage() {
  return [
    "Product OS guarded migrate runner",
    "  --env local|neon_dev|production   (required)",
    "  --mode preflight|status|deploy    (default: preflight)",
    "  --execute-approved-migration      (required for deploy)",
    "  --i-understand-production         (required for production)",
    `  --confirm-production ${PRODUCTION_CONFIRM_VALUE}`,
    "Modes preflight/status do not modify the database.",
    "Deploy is disabled without --execute-approved-migration."
  ].join("\n");
}

function logSafe(gate, mode) {
  console.log(
    JSON.stringify({
      productOsMigrate: true,
      env: gate.envName,
      mode,
      hostFingerprint: gate.hostFingerprint,
      migrationName: MIGRATION_NAME,
      schema: "prisma/schema.prisma"
    })
  );
}

function runPrismaAllowlisted(mode, selectedUrl) {
  const args = PRISMA_ALLOWLIST[mode];
  if (!args) {
    const err = new Error(`No Prisma allowlist for mode ${mode}`);
    err.code = "PRODUCT_OS_MODE_INVALID";
    throw err;
  }

  const childEnv = buildSanitizedChildEnv({ selectedUrl });
  const prismaCli = require.resolve("prisma/build/index.js");
  const result = spawnSync(process.execPath, [prismaCli, ...args], {
    env: childEnv,
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
    shell: false
  });

  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  assertOutputHasNoSecrets(combined, [selectedUrl]);

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.error) {
    throw result.error;
  }
  return typeof result.status === "number" ? result.status : 1;
}

function main(argv = process.argv.slice(2)) {
  try {
    if (argv.includes("--help") || argv.includes("-h")) {
      console.log(usage());
      return 0;
    }

    const parsed = parseCliArgs(argv);
    if (!parsed.mode || !ALLOWED_MODES.includes(parsed.mode)) {
      console.error(usage());
      return 1;
    }

    const requireUrl = parsed.mode === "status" || parsed.mode === "deploy";
    const gate = assertProductOsDatabaseTarget({
      envName: parsed.envName,
      productionConfirmed: parsed.productionConfirmed,
      productionConfirmValue: parsed.productionConfirmValue,
      requireFingerprint: true,
      requireUrl
    });

    logSafe(gate, parsed.mode);

    if (parsed.mode === "preflight") {
      // Preflight must not modify the database and must not connect.
      // URL may be absent only when requireUrl=false — still validate fingerprint env for neon_dev/prod.
      if (!gate.hasUrl) {
        // For preflight without URL, re-check fingerprint requirement messaging:
        // neon_dev/production already required fingerprint env above when requireFingerprint.
        console.log(
          "Preflight OK (no DB connection). Provide Product OS URL env before status/deploy."
        );
      } else {
        console.log(
          "Preflight OK (no DB connection). Target identity and fingerprint checks passed."
        );
      }
      return 0;
    }

    if (parsed.mode === "deploy" && !parsed.executeApprovedMigration) {
      console.error(
        "Deploy disabled by default. Re-run with --execute-approved-migration after Phase 3B approval."
      );
      return 2;
    }

    const selectedUrl = resolveDatabaseUrlForEnv(parsed.envName);
    if (!selectedUrl) {
      console.error(`Missing Product OS URL for ${parsed.envName}.`);
      return 1;
    }

    const code = runPrismaAllowlisted(parsed.mode, selectedUrl);
    return code;
  } catch (err) {
    console.error(err.message || String(err));
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  main,
  usage,
  MIGRATION_NAME,
  PRISMA_ALLOWLIST,
  PACKAGE_ROOT,
  SCHEMA_PATH
};
