/**
 * Phase 3A.1 env-guard / migrate runner / price-period tests (no database).
 * Synthetic fixtures only.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("crypto");

const envGuard = require("../../src/v2/env-guard");
const { structuralValidators } = require("../../src/v2");
const migrateRunner = require("../../scripts/safe-prisma-migrate");

const DEV_URL = "postgresql://devuser:dev-secret@ep-dev.example.neon.tech:5432/product_os_dev?sslmode=require";
const PROD_URL = "postgresql://produser:prod-secret@ep-prod.example.neon.tech:5432/product_os_prod?sslmode=require";
const LOCAL_URL = "postgresql://local:local@127.0.0.1:5432/product_os_local";

function fp(url) {
  return envGuard.computeHostFingerprint(url);
}

describe("env guard fingerprints", () => {
  it("uses sha256 of host|port|db without credentials", () => {
    const a = fp(DEV_URL);
    const expected = crypto
      .createHash("sha256")
      .update("host=ep-dev.example.neon.tech|port=5432|db=product_os_dev", "utf8")
      .digest("hex");
    assert.equal(a, expected);
    assert.equal(a.includes("dev-secret"), false);
  });

  it("rejects missing expected fingerprint for neon_dev", () => {
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "neon_dev",
          requireUrl: true,
          requireFingerprint: true,
          env: { PRODUCT_OS_DEV_DATABASE_URL: DEV_URL }
        }),
      /Missing approved host fingerprint/
    );
  });

  it("rejects fingerprint mismatch", () => {
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "neon_dev",
          requireUrl: true,
          requireFingerprint: true,
          env: {
            PRODUCT_OS_DEV_DATABASE_URL: DEV_URL,
            PRODUCT_OS_DEV_HOST_FINGERPRINT: "deadbeef"
          }
        }),
      /fingerprint mismatch/i
    );
  });

  it("rejects when dev URL equals production URL identity", () => {
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "neon_dev",
          requireUrl: true,
          requireFingerprint: true,
          env: {
            PRODUCT_OS_DEV_DATABASE_URL: DEV_URL,
            PRODUCT_OS_PROD_DATABASE_URL: DEV_URL,
            PRODUCT_OS_DEV_HOST_FINGERPRINT: fp(DEV_URL)
          }
        }),
      /same database identity/
    );
  });

  it("local does not fall back to dev URL", () => {
    assert.equal(
      envGuard.resolveDatabaseUrlForEnv("local", {
        PRODUCT_OS_DEV_DATABASE_URL: DEV_URL
      }),
      null
    );
    assert.equal(
      envGuard.resolveDatabaseUrlForEnv("local", {
        PRODUCT_OS_LOCAL_DATABASE_URL: LOCAL_URL,
        PRODUCT_OS_DEV_DATABASE_URL: DEV_URL
      }),
      LOCAL_URL
    );
  });

  it("production requires both confirmations", () => {
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "production",
          productionConfirmed: false,
          requireUrl: true,
          env: {
            PRODUCT_OS_PROD_DATABASE_URL: PROD_URL,
            PRODUCT_OS_PROD_HOST_FINGERPRINT: fp(PROD_URL)
          }
        }),
      /i-understand-production/
    );
    assert.throws(
      () =>
        envGuard.assertProductOsDatabaseTarget({
          envName: "production",
          productionConfirmed: true,
          productionConfirmValue: "WRONG",
          requireUrl: true,
          env: {
            PRODUCT_OS_PROD_DATABASE_URL: PROD_URL,
            PRODUCT_OS_PROD_HOST_FINGERPRINT: fp(PROD_URL)
          }
        }),
      /Second confirmation/
    );
    const ok = envGuard.assertProductOsDatabaseTarget({
      envName: "production",
      productionConfirmed: true,
      productionConfirmValue: envGuard.PRODUCTION_CONFIRM_VALUE,
      requireUrl: true,
      env: {
        PRODUCT_OS_PROD_DATABASE_URL: PROD_URL,
        PRODUCT_OS_PROD_HOST_FINGERPRINT: fp(PROD_URL)
      }
    });
    assert.equal(ok.ok, true);
  });

  it("sanitized child env sets only child DATABASE_URL and strips Product OS URLs", () => {
    const child = envGuard.buildSanitizedChildEnv({
      selectedUrl: DEV_URL,
      env: {
        DATABASE_URL: "postgresql://root:rootsecret@root.example/db",
        PRODUCT_OS_DEV_DATABASE_URL: DEV_URL,
        PRODUCT_OS_PROD_DATABASE_URL: PROD_URL,
        PATH: "/usr/bin"
      }
    });
    assert.equal(child.DATABASE_URL, DEV_URL);
    assert.equal(child.PRODUCT_OS_DEV_DATABASE_URL, undefined);
    assert.equal(child.PRODUCT_OS_PROD_DATABASE_URL, undefined);
  });

  it("assertOutputHasNoSecrets catches URL and password", () => {
    assert.throws(
      () => envGuard.assertOutputHasNoSecrets(`connected ${DEV_URL}`, [DEV_URL]),
      /database URL/
    );
    assert.throws(
      () => envGuard.assertOutputHasNoSecrets("password=dev-secret leaked", [DEV_URL]),
      /password/
    );
  });
});

describe("guarded migrate runner", () => {
  it("preflight does not connect and returns 0 with valid neon_dev fingerprint", () => {
    const keys = [
      "PRODUCT_OS_DEV_DATABASE_URL",
      "PRODUCT_OS_DEV_HOST_FINGERPRINT"
    ];
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.PRODUCT_OS_DEV_DATABASE_URL = DEV_URL;
    process.env.PRODUCT_OS_DEV_HOST_FINGERPRINT = fp(DEV_URL);
    try {
      const code = migrateRunner.main([
        "--env",
        "neon_dev",
        "--mode",
        "preflight"
      ]);
      assert.equal(code, 0);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it("deploy without execute flag returns 2", () => {
    const keys = [
      "PRODUCT_OS_DEV_DATABASE_URL",
      "PRODUCT_OS_DEV_HOST_FINGERPRINT"
    ];
    const prev = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    process.env.PRODUCT_OS_DEV_DATABASE_URL = DEV_URL;
    process.env.PRODUCT_OS_DEV_HOST_FINGERPRINT = fp(DEV_URL);
    try {
      const code = migrateRunner.main(["--env", "neon_dev", "--mode", "deploy"]);
      assert.equal(code, 2);
    } finally {
      for (const k of keys) {
        if (prev[k] === undefined) delete process.env[k];
        else process.env[k] = prev[k];
      }
    }
  });

  it("rejects arbitrary passthrough args", () => {
    assert.throws(
      () => envGuard.parseCliArgs(["--env", "local", "--mode", "preflight", "--schema", "evil"]),
      /Unrecognized/
    );
  });
});

describe("package scripts guard", () => {
  it("does not contain unguarded migrate deploy alias", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8")
    );
    assert.equal(pkg.scripts["prisma:migrate:deploy:unguarded"], undefined);
    assert.match(pkg.scripts["prisma:migrate"], /safe-prisma-migrate\.js/);
    for (const [name, cmd] of Object.entries(pkg.scripts)) {
      if (name === "prisma:migrate") continue;
      assert.equal(/migrate\s+deploy/i.test(cmd), false, name);
      assert.equal(/db\s+push/i.test(cmd), false, name);
    }
  });
});

describe("price effective periods", () => {
  const base = {
    priceBookId: "book-1",
    productId: "prod-1",
    currencyCode: "AUD",
    fulfilmentMode: "INSTALLED",
    taxBasis: "GST_INCLUSIVE",
    customerVisible: true,
    status: "ACTIVE",
    displayMode: "EXACT",
    amount: 100,
    installationIncluded: true
  };

  it("rejects effective_to <= effective_from", () => {
    const r = structuralValidators.validatePriceEffectiveOrder({
      ...base,
      effectiveFrom: "2026-01-10T00:00:00Z",
      effectiveTo: "2026-01-01T00:00:00Z"
    });
    assert.equal(r.passed, false);
  });

  it("detects overlapping ACTIVE periods", () => {
    const findings = structuralValidators.validateActivePriceNoOverlap([
      {
        ...base,
        priceCode: "p1",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: "2026-06-01T00:00:00Z"
      },
      {
        ...base,
        priceCode: "p2",
        effectiveFrom: "2026-05-01T00:00:00Z",
        effectiveTo: "2026-12-01T00:00:00Z"
      }
    ]);
    assert.equal(findings.some((f) => !f.passed), true);
  });

  it("allows adjacent periods", () => {
    const findings = structuralValidators.validateActivePriceNoOverlap([
      {
        ...base,
        priceCode: "p1",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: "2026-06-01T00:00:00Z"
      },
      {
        ...base,
        priceCode: "p2",
        effectiveFrom: "2026-06-01T00:00:00Z",
        effectiveTo: "2026-12-01T00:00:00Z"
      }
    ]);
    assert.equal(findings.every((f) => f.passed), true);
  });

  it("handles open-ended periods", () => {
    const findings = structuralValidators.validateActivePriceNoOverlap([
      {
        ...base,
        priceCode: "p1",
        effectiveFrom: "2026-01-01T00:00:00Z",
        effectiveTo: null
      },
      {
        ...base,
        priceCode: "p2",
        effectiveFrom: "2026-06-01T00:00:00Z",
        effectiveTo: null
      }
    ]);
    assert.equal(findings.some((f) => !f.passed), true);
  });

  it("requires currency match with price book", () => {
    const r = structuralValidators.validatePriceCurrencyMatchesBook(
      { ...base, currencyCode: "USD" },
      { currencyCode: "AUD" }
    );
    assert.equal(r.passed, false);
  });
});

describe("migration SQL phase 3A.1 constraints", () => {
  it("contains exclusion constraint and remains additive", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql"
      ),
      "utf8"
    );
    assert.match(sql, /pos2_product_prices_no_overlap_active_excl/);
    assert.match(sql, /pos2_product_prices_effective_order_chk/);
    assert.match(sql, /pos2_products_kind_role_chk/);
    assert.match(sql, /pos2_product_relationships_active_cta_uidx/);
    assert.doesNotMatch(sql, /DROP TABLE/i);
    assert.doesNotMatch(sql, /ALTER TABLE "product_catalog"/i);
  });
});
