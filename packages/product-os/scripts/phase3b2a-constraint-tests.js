#!/usr/bin/env node
/**
 * Phase 3B.2a — Constraint integration tests in a ROLLBACK transaction.
 * Neon DEV only. Never commits. Never prints secrets.
 */

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
const {
  assertProductOsDatabaseTarget,
  resolveDatabaseUrlForEnv,
  assertOutputHasNoSecrets
} = require("../src/v2/env-guard");

const PACKAGE_ROOT = path.join(__dirname, "..");
const CRM_SYSTEM_ROOT = path.join(PACKAGE_ROOT, "..", "..");
const TEST_PREFIX = "PHASE3B2A_TEST_";

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

function makeExpectFail(client) {
  return function expectFail(label, fn) {
    return (async () => {
      const sp = `sp_${label.replace(/[^a-zA-Z0-9_]/g, "_")}`.slice(0, 63);
      await client.query(`SAVEPOINT ${sp}`);
      try {
        await fn();
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        return { label, passed: false, detail: "expected failure but succeeded" };
      } catch (err) {
        await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
        return {
          label,
          passed: true,
          detail: err.code || String(err.message || "").slice(0, 160)
        };
      }
    })();
  };
}

async function main() {
  loadDotEnvFiles();
  const gate = assertProductOsDatabaseTarget({
    envName: "neon_dev",
    requireFingerprint: true,
    requireUrl: true
  });
  const expectedFp = String(process.env.PRODUCT_OS_DEV_HOST_FINGERPRINT || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
  if (
    !expectedFp ||
    gate.hostFingerprint.replace(/^sha256:/, "") !== expectedFp
  ) {
    console.error("Fingerprint mismatch");
    process.exit(1);
  }
  const url = resolveDatabaseUrlForEnv("neon_dev");
  const client = new Client({
    connectionString: url,
    connectionTimeoutMillis: 20000,
    statement_timeout: 60000
  });

  const results = [];
  await client.connect();
  try {
    await client.query("BEGIN");
    const expectFail = makeExpectFail(client);

    const p1 = (
      await client.query(
        `INSERT INTO pos2_products
           (id, product_code, canonical_name, product_kind, commercial_role, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'EXPERIENCE', 'STANDARD', 'DRAFT', NOW())
         RETURNING id`,
        [`${TEST_PREFIX}P1`, `${TEST_PREFIX} Product One`]
      )
    ).rows[0].id;

    results.push(
      await expectFail("kind_role_illegal_experience_bonus", () =>
        client.query(
          `INSERT INTO pos2_products
             (id, product_code, canonical_name, product_kind, commercial_role, status, updated_at)
           VALUES (gen_random_uuid(), $1, $2, 'EXPERIENCE', 'BONUS', 'DRAFT', NOW())`,
          [`${TEST_PREFIX}BAD`, `${TEST_PREFIX} Bad Bonus`]
        )
      )
    );

    const book = (
      await client.query(
        `INSERT INTO pos2_price_books
           (id, price_book_code, name, currency_code, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'AUD', 'ACTIVE', NOW())
         RETURNING id`,
        [`${TEST_PREFIX}BOOK`, `${TEST_PREFIX} Book`]
      )
    ).rows[0].id;

    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 100.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v1', 'ACTIVE',
         TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2026-12-31', true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE1`, book, p1]
    );

    results.push(
      await expectFail("price_overlap_rejection", () =>
        client.query(
          `INSERT INTO pos2_product_prices (
             id, price_code, price_book_id, product_id, amount, currency_code,
             tax_basis, display_mode, fulfilment_mode, version_label, status,
             effective_from, effective_to, customer_visible, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 110.00, 'AUD',
             'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2', 'ACTIVE',
             TIMESTAMPTZ '2026-06-01', TIMESTAMPTZ '2027-01-01', true, NOW()
           )`,
          [`${TEST_PREFIX}PRICE2`, book, p1]
        )
      )
    );

    // Adjacent [) allowed
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 120.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2a', 'ACTIVE',
         TIMESTAMPTZ '2026-12-31', TIMESTAMPTZ '2027-06-01', true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_ADJ`, book, p1]
    );
    results.push({ label: "adjacent_interval_allowed", passed: true, detail: "inserted" });

    // Different fulfilment same window
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, installation_included,
         version_label, status, effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 130.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'SUPPLY_ONLY', false,
         'v2b', 'ACTIVE', TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2026-12-31', true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_FUL`, book, p1]
    );
    results.push({ label: "different_fulfilment_same_window", passed: true, detail: "inserted" });

    // Different tax basis same window
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 140.00, 'AUD',
         'GST_EXCLUSIVE', 'EXACT', 'INSTALLED', 'v2c', 'ACTIVE',
         TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2026-12-31', true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_TAX`, book, p1]
    );
    results.push({ label: "different_tax_same_window", passed: true, detail: "inserted" });

    // Open-ended NULL end then overlapping later must fail
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 150.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2d', 'ACTIVE',
         TIMESTAMPTZ '2028-01-01', NULL, true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_OPEN`, book, p1]
    );
    results.push(
      await expectFail("null_end_infinity_overlap", () =>
        client.query(
          `INSERT INTO pos2_product_prices (
             id, price_code, price_book_id, product_id, amount, currency_code,
             tax_basis, display_mode, fulfilment_mode, version_label, status,
             effective_from, effective_to, customer_visible, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 160.00, 'AUD',
             'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2e', 'ACTIVE',
             TIMESTAMPTZ '2030-01-01', TIMESTAMPTZ '2030-06-01', true, NOW()
           )`,
          [`${TEST_PREFIX}PRICE_OPEN2`, book, p1]
        )
      )
    );

    // DRAFT overlapping ACTIVE allowed
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 170.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2f', 'DRAFT',
         TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2026-12-31', true, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_DRAFT`, book, p1]
    );
    results.push({ label: "draft_overlap_allowed", passed: true, detail: "inserted" });

    // non-visible ACTIVE overlap allowed
    await client.query(
      `INSERT INTO pos2_product_prices (
         id, price_code, price_book_id, product_id, amount, currency_code,
         tax_basis, display_mode, fulfilment_mode, version_label, status,
         effective_from, effective_to, customer_visible, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, $3, 180.00, 'AUD',
         'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v2g', 'ACTIVE',
         TIMESTAMPTZ '2026-01-01', TIMESTAMPTZ '2026-12-31', false, NOW()
       )`,
      [`${TEST_PREFIX}PRICE_NV`, book, p1]
    );
    results.push({ label: "non_visible_overlap_allowed", passed: true, detail: "inserted" });


    results.push(
      await expectFail("effective_to_lte_from", () =>
        client.query(
          `INSERT INTO pos2_product_prices (
             id, price_code, price_book_id, product_id, amount, currency_code,
             tax_basis, display_mode, fulfilment_mode, version_label, status,
             effective_from, effective_to, customer_visible, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 50.00, 'AUD',
             'GST_INCLUSIVE', 'EXACT', 'INSTALLED', 'v3', 'ACTIVE',
             TIMESTAMPTZ '2027-01-01', TIMESTAMPTZ '2026-01-01', true, NOW()
           )`,
          [`${TEST_PREFIX}PRICE3`, book, p1]
        )
      )
    );

    results.push(
      await expectFail("contact_with_amount", () =>
        client.query(
          `INSERT INTO pos2_product_prices (
             id, price_code, price_book_id, product_id, amount, currency_code,
             tax_basis, display_mode, fulfilment_mode, version_label, status,
             effective_from, customer_visible, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 10.00, 'AUD',
             'GST_INCLUSIVE', 'CONTACT', 'INSTALLED', 'v4', 'ACTIVE',
             TIMESTAMPTZ '2028-01-01', true, NOW()
           )`,
          [`${TEST_PREFIX}PRICE4`, book, p1]
        )
      )
    );

    results.push(
      await expectFail("supply_only_with_install_true", () =>
        client.query(
          `INSERT INTO pos2_product_prices (
             id, price_code, price_book_id, product_id, amount, currency_code,
             tax_basis, display_mode, fulfilment_mode, installation_included,
             version_label, status, effective_from, customer_visible, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $3, 10.00, 'AUD',
             'GST_INCLUSIVE', 'EXACT', 'SUPPLY_ONLY', true,
             'v5', 'DRAFT', TIMESTAMPTZ '2029-01-01', true, NOW()
           )`,
          [`${TEST_PREFIX}PRICE5`, book, p1]
        )
      )
    );

    results.push(
      await expectFail("relationship_no_self", () =>
        client.query(
          `INSERT INTO pos2_product_relationships (
             id, relationship_code, from_product_id, to_product_id,
             relationship_type, status, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, $2, 'COMPATIBLE_EXPERIENCE', 'ACTIVE', NOW()
           )`,
          [`${TEST_PREFIX}REL_SELF`, p1]
        )
      )
    );

    const addon = (
      await client.query(
        `INSERT INTO pos2_products
           (id, product_code, canonical_name, product_kind, commercial_role, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'ADDON', 'STANDARD', 'DRAFT', NOW())
         RETURNING id`,
        [`${TEST_PREFIX}AO`, `${TEST_PREFIX} Addon`]
      )
    ).rows[0].id;
    const cap = (
      await client.query(
        `INSERT INTO pos2_capabilities
           (id, capability_code, name, status, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'ACTIVE', NOW())
         RETURNING id`,
        [`${TEST_PREFIX}CAP`, `${TEST_PREFIX} Cap`]
      )
    ).rows[0].id;

    results.push(
      await expectFail("addon_no_new_room", () =>
        client.query(
          `INSERT INTO pos2_addon_profiles (
             product_id, extends_capability_id, creates_new_room, creates_new_experience, updated_at
           ) VALUES ($1, $2, true, false, NOW())`,
          [addon, cap]
        )
      )
    );
    results.push(
      await expectFail("addon_no_new_experience", () =>
        client.query(
          `INSERT INTO pos2_addon_profiles (
             product_id, extends_capability_id, creates_new_room, creates_new_experience, updated_at
           ) VALUES ($1, $2, false, true, NOW())`,
          [addon, cap]
        )
      )
    );

    // CTA uniqueness: two ACTIVE PRESENTATION_CTA from same product with null to_product_id
    await client.query(
      `INSERT INTO pos2_product_relationships (
         id, relationship_code, from_product_id, to_product_id,
         relationship_type, status, updated_at
       ) VALUES (
         gen_random_uuid(), $1, $2, NULL, 'PRESENTATION_CTA', 'ACTIVE', NOW()
       )`,
      [`${TEST_PREFIX}CTA1`, p1]
    );
    results.push(
      await expectFail("cta_partial_unique", () =>
        client.query(
          `INSERT INTO pos2_product_relationships (
             id, relationship_code, from_product_id, to_product_id,
             relationship_type, status, updated_at
           ) VALUES (
             gen_random_uuid(), $1, $2, NULL, 'PRESENTATION_CTA', 'ACTIVE', NOW()
           )`,
          [`${TEST_PREFIX}CTA2`, p1]
        )
      )
    );

    await client.query("ROLLBACK");

    const residualProducts = (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM pos2_products WHERE product_code LIKE $1`,
        [`${TEST_PREFIX}%`]
      )
    ).rows[0].c;
    const residualPrices = (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM pos2_product_prices WHERE price_code LIKE $1`,
        [`${TEST_PREFIX}%`]
      )
    ).rows[0].c;
    const residualCaps = (
      await client.query(
        `SELECT COUNT(*)::int AS c FROM pos2_capabilities WHERE capability_code LIKE $1`,
        [`${TEST_PREFIX}%`]
      )
    ).rows[0].c;

    const summary = {
      phase: "3B.2a",
      constraintTests: results,
      allPassed: results.every((r) => r.passed),
      rolledBack: true,
      residualTestProducts: residualProducts,
      residualTestPrices: residualPrices,
      residualTestCapabilities: residualCaps,
      hostFingerprint: gate.hostFingerprint
    };
    assertOutputHasNoSecrets(JSON.stringify(summary), [url]);
    console.log(JSON.stringify(summary, null, 2));
    const ok =
      summary.allPassed &&
      residualProducts === 0 &&
      residualPrices === 0 &&
      residualCaps === 0;
    process.exit(ok ? 0 : 1);
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
