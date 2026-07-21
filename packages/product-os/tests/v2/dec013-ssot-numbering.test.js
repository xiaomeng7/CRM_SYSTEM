/**
 * DEC-013 / ADR-012 — numbering, Protection benefit, shared read model tests.
 * Synthetic fixtures only. No database.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  legacyCrosswalk,
  productReadModel,
  structuralValidators
} = require("../../src/v2");

describe("DEC-013 canonical numbering", () => {
  it("maps Legacy E-06 CCTV → canonical E-05", () => {
    assert.equal(legacyCrosswalk.toCanonicalProductCode("E-06"), "E-05");
    assert.equal(legacyCrosswalk.CANONICAL_CLASSIFICATION["E-05"].canonicalName, "CCTV");
  });

  it("maps Legacy E-07 Smart Toilet → canonical E-06", () => {
    assert.equal(legacyCrosswalk.toCanonicalProductCode("E-07"), "E-06");
    assert.equal(legacyCrosswalk.CANONICAL_CLASSIFICATION["E-06"].canonicalName, "Smart Toilet");
  });

  it("does not allow canonical E-07 product code", () => {
    assert.equal(legacyCrosswalk.isCanonicalProductCodeAllowed("E-07"), false);
  });

  it("maps Legacy E-05 Protection to included benefit, not a product", () => {
    const row = legacyCrosswalk.resolveLegacyAlias("E-05");
    assert.equal(row.resolutionKind, "INCLUDED_BENEFIT");
    assert.equal(row.canonicalProductCode, null);
    assert.equal(row.includedBenefitCode, "benefit.protection_bonus");
    assert.equal(legacyCrosswalk.toCanonicalProductCode("E-05"), null);
  });

  it("rejects Protection as a standalone product record", () => {
    assert.equal(
      legacyCrosswalk.assertNoProtectionProductRecord({
        productCode: "E-99",
        canonicalName: "Protection Bonus",
        commercialRole: "BONUS"
      }),
      false
    );
    assert.equal(
      structuralValidators.validateProductKindRole({
        productCode: "X",
        productKind: "EXPERIENCE",
        commercialRole: "BONUS"
      }).passed,
      false
    );
  });
});

describe("Protection unlock", () => {
  it("requires Entry AND Away AND CCTV (E-05)", () => {
    assert.equal(
      legacyCrosswalk.protectionUnlockSatisfied(["C-01", "C-06"]),
      false
    );
    assert.equal(
      legacyCrosswalk.protectionUnlockSatisfied(["C-01", "C-06", "E-05"]),
      true
    );
    assert.deepEqual(
      [...legacyCrosswalk.PROTECTION_UNLOCK_REQUIRED_CODES],
      ["C-01", "C-06", "E-05"]
    );
  });
});

describe("Add-ons under eligible parents only", () => {
  it("returns Add-ons only for eligible parent", () => {
    const addons = [
      { productCode: "AO-001", canonicalName: "Test Add-on A" },
      { productCode: "AO-002", canonicalName: "Test Add-on B" }
    ];
    const eligibility = [
      { parentProductCode: "C-01", addonProductCode: "AO-001" },
      { parentProductCode: "C-02", addonProductCode: "AO-002" }
    ];
    const forC01 = productReadModel.permittedAddonsForParent(addons, "C-01", eligibility);
    assert.deepEqual(
      forC01.map((a) => a.productCode),
      ["AO-001"]
    );
  });
});

describe("Standalone bypasses Foundation", () => {
  it("does not require Foundation for STANDALONE", () => {
    assert.equal(
      productReadModel.foundationRequiredForSelection({
        productKind: "STANDALONE",
        productCode: "E-06",
        standalone: true
      }),
      false
    );
    assert.equal(
      productReadModel.foundationRequiredForSelection({
        productKind: "COLLECTION",
        productCode: "C-01",
        requiresFoundation: true
      }),
      true
    );
  });
});

describe("Shared read model for Website and Print", () => {
  it("Print Product Sheet uses the same approved Product read model", () => {
    const model = productReadModel.emptyReadModel({
      productId: "uuid-cctv",
      productCode: "E-05",
      canonicalName: "CCTV",
      productKind: "EXPERIENCE",
      commercialRole: "PACK",
      printEligible: true,
      activePrice: { amount: 1, currencyCode: "AUD" },
      taxBasis: "GST_INCLUSIVE",
      fulfilmentMode: "INSTALLED"
    });
    const withBenefit = productReadModel.applyProtectionBenefit(model, [
      "C-01",
      "C-06",
      "E-05"
    ]);
    const sheet = productReadModel.toPrintProductSheet(withBenefit);
    assert.equal(sheet.source, "product_os_shared_read_model");
    assert.equal(sheet.product, withBenefit);
    assert.equal(sheet.product.productCode, "E-05");
    assert.ok(
      sheet.product.includedBenefits.some((b) => b.benefitCode === "benefit.protection_bonus")
    );
  });
});

describe("Schema supports aliases (unapplied migration)", () => {
  it("migration SQL includes alias and included-benefit tables", () => {
    const sql = fs.readFileSync(
      path.join(
        __dirname,
        "../../prisma/migrations/20260718120000_add_product_os_v2_schema/migration.sql"
      ),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE "pos2_product_aliases"/);
    assert.match(sql, /CREATE TABLE "pos2_included_benefits"/);
    assert.match(sql, /Pos2AliasResolutionKind/);
    assert.match(sql, /commercial_role" IN \('STANDARD', 'PACK'\)/);
    assert.doesNotMatch(sql, /EXPERIENCE' AND "commercial_role" IN \('STANDARD', 'PACK', 'BONUS'\)/);
  });
});
