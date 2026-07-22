/**
 * Phase 4A — Source → V2 ImportPlan transforms.
 * Uses immutable workbook (fingerprint-verified). No Neon / DB writes.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const importLayer = require("../../src/v2/import");
const {
  sourceFingerprint,
  workbookReader,
  typeNormalize,
  referenceRemap,
  productTransforms,
  buildImportPlan,
  deltaOverlays
} = importLayer;

describe("Phase 4A source fingerprints", () => {
  it("verifies approved immutable sources", () => {
    const v = sourceFingerprint.verifyApprovedSources();
    assert.equal(v.ok, true);
    assert.equal(v.results.length, 3);
    for (const r of v.results) {
      assert.equal(r.match, true, r.relativePath);
    }
  });
});

describe("Phase 4A type normalize", () => {
  it("maps workbook types to kind × role", () => {
    assert.deepEqual(typeNormalize.mapWorkbookType("Collection"), {
      ok: true,
      productKind: "COLLECTION",
      commercialRole: "STANDARD",
      rejectAsProduct: false,
      reason: null
    });
    assert.equal(typeNormalize.mapWorkbookType("Bonus").rejectAsProduct, true);
    assert.equal(typeNormalize.kindRoleForCanonicalCode("E-05").productKind, "EXPERIENCE");
    assert.equal(typeNormalize.kindRoleForCanonicalCode("E-05").commercialRole, "PACK");
    assert.equal(typeNormalize.kindRoleForCanonicalCode("E-06").productKind, "STANDALONE");
  });
});

describe("Phase 4A reference remap", () => {
  it("remaps parent eligibility E-06→E-05 and drops Protection", () => {
    const r = referenceRemap.remapParentEligibility("C-01/E-06/E-05");
    assert.deepEqual(r.codes, ["C-01", "E-05"]);
    assert.equal(r.dropped.length, 1);
    assert.equal(r.dropped[0].reason, "INCLUDED_BENEFIT");
  });

  it("rewrites tokens in text", () => {
    const r = referenceRemap.remapProductCodeTokensInText("See E-06 and E-07");
    assert.match(r.text, /E-05/);
    assert.match(r.text, /E-06/);
    assert.ok(r.replacements.some((x) => x.from === "E-06" && x.to === "E-05"));
    assert.ok(r.replacements.some((x) => x.from === "E-07" && x.to === "E-06"));
  });
});

describe("Phase 4A product transforms (synthetic)", () => {
  it("skips Protection Bonus to included benefit", () => {
    const plan = productTransforms.transformProductMasterRow({
      product_id: "E-05",
      name: "Protection Bonus",
      type: "Bonus",
      final_customer_price_incl_gst: "$0.00"
    });
    assert.equal(plan.action, "SKIP_TO_BENEFIT");
    assert.equal(plan.includedBenefitCode, "benefit.protection_bonus");
    assert.equal(plan.priceImport, "REJECT");
  });

  it("remaps CCTV E-06 → E-05 PACK", () => {
    const plan = productTransforms.transformProductMasterRow({
      product_id: "E-06",
      name: "CCTV",
      type: "Product Pack",
      status: "Frozen",
      version: "2.06"
    });
    assert.equal(plan.action, "UPSERT_PRODUCT");
    assert.equal(plan.productCode, "E-05");
    assert.equal(plan.canonicalName, "CCTV");
    assert.equal(plan.productKind, "EXPERIENCE");
    assert.equal(plan.commercialRole, "PACK");
  });

  it("remaps Smart Toilet E-07 → E-06 STANDALONE", () => {
    const plan = productTransforms.transformProductMasterRow({
      product_id: "E-07",
      name: "Smart Toilet",
      type: "Standalone Product"
    });
    assert.equal(plan.action, "UPSERT_PRODUCT");
    assert.equal(plan.productCode, "E-06");
    assert.equal(plan.productKind, "STANDALONE");
  });

  it("skips Protection pricing row", () => {
    const plan = productTransforms.transformPricingSummaryRow({
      product_id: "E-05",
      name: "Protection Bonus",
      customer_price_incl_gst: 0
    });
    assert.equal(plan.action, "SKIP_PRICE");
  });
});

describe("Phase 4A ImportPlan from approved workbook", () => {
  it("builds plan with DEC-013 integrity and no DB write flags", () => {
    const plan = buildImportPlan.buildImportPlanFromApprovedSources();
    assert.equal(plan.phase, "4A.2");
    assert.equal(plan.import_plan_version, "1.2.0");
    assert.equal(plan.dbWrite, false);
    assert.equal(plan.neonConnection, false);
    assert.equal(plan.fingerprint.ok, true);

    assert.equal(plan.stats.masterRows, 14);
    assert.equal(plan.stats.upsertProducts, 13); // 14 - Protection
    assert.equal(plan.stats.skipToBenefit, 1);
    assert.equal(plan.stats.rejected, 0);
    assert.equal(plan.stats.addonRows, 32);
    assert.equal(plan.stats.skipPrices, 1);

    assert.equal(plan.integrity.hasProtectionProduct, false);
    assert.equal(plan.integrity.hasCanonicalE07, false);
    assert.equal(plan.integrity.hasCctvAsE05, true);
    assert.equal(plan.integrity.hasToiletAsE06, true);

    const codes = plan.products.map((p) => p.productCode).sort();
    assert.deepEqual(codes, [
      "C-01",
      "C-02",
      "C-03",
      "C-04",
      "C-05",
      "C-06",
      "E-01",
      "E-02",
      "E-03",
      "E-04",
      "E-05",
      "E-06",
      "F-01"
    ]);

    assert.equal(plan.includedBenefits.length, 1);
    assert.equal(plan.includedBenefits[0].benefitCode, "benefit.protection_bonus");
    assert.deepEqual(plan.includedBenefits[0].unlockRequiredCodes, ["C-01", "C-06", "E-05"]);

    assert.equal(deltaOverlays.listApprovedDeltas().length, 8);
    assert.ok(plan.approvedDeltas.some((d) => d.ref === "DELTA-C01-DOOR"));

    // Sheet 12 must be non-authoritative
    assert.ok(plan.warnings.some((w) => w.includes("12_Product_Card_Content")));
  });

  it("does not import Master price as authority", () => {
    const plan = buildImportPlan.buildImportPlanFromApprovedSources();
    const entry = plan.products.find((p) => p.productCode === "C-01");
    assert.equal(entry.priceAuthoritySheet, "10_Pricing_Summary");
    assert.equal(entry.contentAuthoritySheet, "14_Content_Library");
    const price = plan.prices.find((p) => p.productCode === "C-01");
    assert.equal(price.action, "UPSERT_PRICE");
    assert.ok(typeof price.customerPriceInclGst === "number");
  });
});

describe("Phase 4A workbook sheet contract", () => {
  it("loads expected sheets from immutable path", () => {
    const wbPath = path.join(
      sourceFingerprint.SOURCE_DIR,
      "Better_Home_Product_Database_V2.07.xlsx"
    );
    const wb = workbookReader.loadWorkbook(wbPath);
    const check = workbookReader.assertExpectedSheets(wb);
    assert.equal(check.ok, true);
    const legacy = workbookReader.readSheetRows(wb, "12_Product_Card_Content");
    assert.equal(legacy.authoritative, false);
    assert.equal(legacy.skippedReason, "LEGACY_NON_AUTHORITATIVE");
  });
});
