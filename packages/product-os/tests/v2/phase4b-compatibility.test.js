const test = require("node:test");
const assert = require("node:assert/strict");
const plan = require("../../generated/import-plan-v2.07.json");
const { buildPhase4BCompatibility } = require("../../src/v2/import/phase4b-compatibility");

test("Phase 4B compatibility resolves every Add-on to approved capability or SKU facts", () => {
  const result = buildPhase4BCompatibility(plan);
  assert.equal(result.ok, true, JSON.stringify(result.blockers));
  assert.equal(result.addonBases.length, 32);
  assert.equal(result.addonBases.filter((x) => x.skuCodes.length || x.capabilityCodes.length).length, 32);
});

test("presentation-only A4 copy is not invented as an Experience fact", () => {
  const result = buildPhase4BCompatibility(plan);
  assert.equal(result.experienceMappings.length, 10);
  assert.equal(result.presentationOnlyMappings.length, 55);
  assert.ok(result.presentationOnlyMappings.every((x) => x.createsExperienceFact === false));
  assert.equal(result.scopeDisposition.mode, "CONTENT_PLACEMENT");
});

test("every approved Add-on carries a customer price for the shared price book", () => {
  assert.equal(plan.addons.length, 32);
  assert.ok(plan.addons.every((x) => Number(x.customerPriceInclGst) > 0));
});
