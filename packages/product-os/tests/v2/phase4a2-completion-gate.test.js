const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const {
  buildImportPlan,
  phase4a1Audit,
  importPlanSchema
} = require("../../src/v2/import");

describe("Phase 4A.2 completion gate", () => {
  it("integrates approved Expand Further and A4 content into the ImportPlan", () => {
    const plan = buildImportPlan.buildImportPlanFromApprovedSources();
    assert.equal(plan.phase, "4A.2");
    assert.equal(plan.import_plan_version, "1.2.0");
    assert.equal(plan.expandFurtherRelationships.length, 14);
    assert.equal(plan.presentationCtas.length, 2);
    assert.equal(plan.expandFurtherBonusNotes.length, 2);
    assert.equal(plan.featuredAddons.length, 16);
    assert.equal(plan.a4PresentationMappings.length, 35);
    assert.equal(plan.a4ScopePresentation.length, 35);
    assert.ok(plan.contentEntries.some((entry) => entry.productCode === "F-01" && entry.contentKind === "HERO"));
    assert.equal(plan.transformValidation.a4Verbatim.ok, true);
    assert.deepEqual(plan.transformValidation.expandFurtherUnresolved, []);
    assert.deepEqual(plan.transformValidation.expandFurtherDuplicates, []);
    assert.equal(plan.integrity.hasCanonicalE07, false);
    assert.equal(plan.integrity.hasProtectionProduct, false);
    assert.equal(importPlanSchema.validateImportPlanSchema(plan).ok, true);
  });

  it("clears P0 while retaining the approved-asset publish gate", () => {
    const { validationReport } = phase4a1Audit.runPhase4A1Gate();
    assert.equal(validationReport.issueCounts.P0, 0);
    assert.equal(validationReport.issueCounts.P1, 1);
    assert.equal(validationReport.readyForPhase4B, true);
    assert.equal(validationReport.gateDecision, "Phase 4B CONDITIONALLY ELIGIBLE");
    for (const decision of ["DEC-009", "DEC-010", "DEC-012"]) {
      assert.equal(validationReport.decisions.find((d) => d.decision === decision).status, "APPLIED");
    }
  });
});
