/**
 * Guardrails for Phase 3B.2a empty migration-history bootstrap.
 * Does not connect to a database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.join(__dirname, "../..");
const SCRIPT = path.join(
  ROOT,
  "scripts/bootstrap-empty-prisma-migration-history.js"
);
const {
  PRISMA_MIGRATIONS_DDL,
  EXPECTED_COLUMNS
} = require("../../scripts/bootstrap-empty-prisma-migration-history.js");

describe("bootstrap-empty-prisma-migration-history guards", () => {
  it("embeds PostgreSQL DDL matching Prisma schema-engine flavour", () => {
    assert.match(PRISMA_MIGRATIONS_DDL, /CREATE TABLE _prisma_migrations/);
    assert.match(PRISMA_MIGRATIONS_DDL, /TIMESTAMPTZ/);
    assert.match(PRISMA_MIGRATIONS_DDL, /applied_steps_count\s+INTEGER NOT NULL DEFAULT 0/);
    assert.deepEqual(EXPECTED_COLUMNS, [
      "id",
      "checksum",
      "finished_at",
      "migration_name",
      "logs",
      "rolled_back_at",
      "started_at",
      "applied_steps_count"
    ]);
  });

  it("DDL matches strings extracted from installed schema-engine binary", () => {
    const eng = path.join(
      ROOT,
      "../../node_modules/.pnpm/@prisma+engines@6.19.3/node_modules/@prisma/engines/schema-engine-darwin-arm64"
    );
    assert.equal(fs.existsSync(eng), true);
    const { execFileSync } = require("node:child_process");
    const out = execFileSync("strings", [eng], {
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024
    });
    // PostgreSQL flavour markers from schema-engine (not MySQL DATETIME(3))
    assert.match(out, /finished_at\s+TIMESTAMPTZ/);
    assert.match(out, /started_at\s+TIMESTAMPTZ NOT NULL DEFAULT now\(\)/);
    assert.match(out, /applied_steps_count\s+INTEGER NOT NULL DEFAULT 0/);
    assert.equal(out.includes("CREATE TABLE _prisma_migrations ("), true);
    for (const col of EXPECTED_COLUMNS) {
      assert.equal(PRISMA_MIGRATIONS_DDL.includes(col), true);
    }
  });

  it("refuses non-neon_dev env without connecting", () => {
    const r = spawnSync(process.execPath, [SCRIPT, "--env", "production"], {
      encoding: "utf8",
      cwd: ROOT
    });
    assert.notEqual(r.status, 0);
    assert.match(`${r.stdout}\n${r.stderr}`, /BOOTSTRAP_ENV_REFUSED|neon_dev only/i);
  });

  it("refuses without --execute-approved-bootstrap", () => {
    const r = spawnSync(
      process.execPath,
      [SCRIPT, "--env", "neon_dev"],
      { encoding: "utf8", cwd: ROOT }
    );
    assert.equal(r.status, 2);
  });

  it("package script points at guarded bootstrap only", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, "package.json"), "utf8")
    );
    assert.match(
      pkg.scripts["prisma:migration-history:bootstrap-dev"],
      /bootstrap-empty-prisma-migration-history\.js/
    );
    assert.doesNotMatch(
      pkg.scripts["prisma:migration-history:bootstrap-dev"],
      /migrate\s+resolve|db\s+push|migrate\s+deploy/i
    );
  });
});
