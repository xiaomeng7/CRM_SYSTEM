/**
 * Phase 4A.1 coverage gate tests — offline, no Neon.
 */

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  phase4a1Audit,
  determinism,
  importPlanSchema,
  buildImportPlan,
  sheetCatalog
} = require("../../src/v2/import");

describe("Phase 4A.1 sheet disposition", () => {
  it("classifies all 22 workbook sheets without UNKNOWN", () => {
    const plan = buildImportPlan.buildImportPlanFromApprovedSources();
    assert.equal(plan.sheetDisposition.classification.ok, true);
    assert.equal(plan.sheetDisposition.matrix.length, 22);
    assert.ok(plan.sheetDisposition.matrix.every((r) => r.importStatus !== "UNKNOWN"));
    const s12 = plan.sheetDisposition.matrix.find((r) => r.sheet === "12_Product_Card_Content");
    assert.equal(s12.importStatus, "LEGACY_SKIPPED");
    const s14 = plan.sheetDisposition.matrix.find((r) => r.sheet === "14_Content_Library");
    assert.equal(s14.importStatus, "AUTHORITATIVE_IMPORTED");
    const s10 = plan.sheetDisposition.matrix.find((r) => r.sheet === "10_Pricing_Summary");
    assert.equal(s10.importStatus, "AUTHORITATIVE_IMPORTED");
  });
});

describe("Phase 4A.1 determinism", () => {
  it("produces identical hashes across 3 runs", () => {
    const det = determinism.runDeterminismCheck(
      () => buildImportPlan.buildImportPlanFromApprovedSources(),
      3
    );
    assert.equal(det.identical, true);
    assert.equal(det.hashes[0], det.hashes[1]);
    assert.equal(det.hashes[1], det.hashes[2]);
    assert.equal(det.hasGeneratedUuid, false);
    assert.match(det.deterministic_hash, /^[a-f0-9]{64}$/);
  });
});

describe("Phase 4A.1 schema + integrity", () => {
  it("rejects Protection product and E-07; schema validates core rules", () => {
    const plan = buildImportPlan.buildImportPlanFromApprovedSources();
    const schema = importPlanSchema.validateImportPlanSchema(plan);
    if (!schema.ok) {
      console.error(schema.errors.slice(0, 15));
    }
    assert.equal(schema.ok, true);
    assert.equal(plan.integrity.hasProtectionProduct, false);
    assert.equal(plan.integrity.hasCanonicalE07, false);
    assert.equal(plan.integrity.hasCctvAsE05, true);
    assert.equal(plan.integrity.hasToiletAsE06, true);
    assert.equal(plan.entityInventory.products, 13);
    assert.ok(plan.entityInventory.experiences > 0);
    assert.ok(plan.entityInventory.bomItems > 0);
    assert.ok(plan.skippedActions.every((s) => s.reasonCode));
  });
});

describe("Phase 4A.1 gate report", () => {
  it("runs full gate and clears import P0 after approved 4A.2 transforms", () => {
    const { validationReport, det } = phase4a1Audit.runPhase4A1Gate();
    assert.equal(validationReport.determinism.identical, true);
    assert.equal(validationReport.explicitConfirmations.neonConnectionsMade, "None");
    assert.equal(validationReport.explicitConfirmations.databaseWrites, "None");
    assert.equal(validationReport.explicitConfirmations.protectionCreatedAsProduct, "No");
    assert.equal(validationReport.explicitConfirmations.canonicalE07Created, "No");
    assert.equal(validationReport.gateDecision, "Phase 4B CONDITIONALLY ELIGIBLE");
    assert.equal(validationReport.issueCounts.P0, 0);
    assert.ok(validationReport.entityInventory.relationshipsExpandFurther > 0);
    assert.equal(validationReport.decisions.find((d) => d.decision === "DEC-009").status, "APPLIED");
    assert.equal(validationReport.decisions.find((d) => d.decision === "DEC-010").status, "APPLIED");
    assert.equal(validationReport.decisions.find((d) => d.decision === "DEC-012").status, "APPLIED");
    assert.equal(det.identical, true);
    assert.equal(validationReport.protection.tests.every((t) => t.pass), true);
    assert.equal(validationReport.remap.proofs.legacyE06ToE05, true);
    assert.equal(validationReport.remap.proofs.legacyE07ToE06, true);
    assert.equal(validationReport.remap.proofs.protectionToBenefit, true);
  });
});

describe("Phase 4A.1 sheet catalog completeness", () => {
  it("has disposition for every expected sheet", () => {
    assert.equal(sheetCatalog.SHEET_DISPOSITION.length, 22);
    for (const status of sheetCatalog.SHEET_DISPOSITION.map((s) => s.importStatus)) {
      assert.ok(sheetCatalog.IMPORT_STATUSES.includes(status));
    }
  });
});
