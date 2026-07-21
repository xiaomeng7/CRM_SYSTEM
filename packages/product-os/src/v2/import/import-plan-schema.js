/**
 * Strict ImportPlan structural validation (Phase 4A.1).
 * Unknown top-level entity collections are flagged; required fields enforced.
 */

const { isValidStableCode } = require("../stable-ids");

const ALLOWED_TOP_LEVEL = new Set([
  "phase",
  "import_plan_version",
  "product_os_release",
  "a4_template_version_separate",
  "generated_at",
  "dbWrite",
  "neonConnection",
  "fingerprint",
  "sheetCheck",
  "sheetDisposition",
  "crosswalk",
  "approvedDeltas",
  "governance",
  "decisionDeltas",
  "products",
  "addons",
  "prices",
  "aliases",
  "includedBenefits",
  "settings",
  "labourLibrary",
  "skus",
  "experiences",
  "capabilities",
  "bomItems",
  "labourApplications",
  "rules",
  "automations",
  "contentEntries",
  "a4PresentationMappings",
  "a4ScopePresentation",
  "expandFurtherRelationships",
  "presentationCtas",
  "expandFurtherBonusNotes",
  "featuredAddons",
  "transformValidation",
  "themes",
  "assets",
  "icons",
  "layouts",
  "plannedActions",
  "skippedActions",
  "entityInventory",
  "emptyEntityExplanations",
  "integrity",
  "stats",
  "warnings",
  "nextPhaseGates",
  "deterministic_hash",
  "validation_summary",
  "issue_summary"
]);

function fail(errors, path, message) {
  errors.push({ path, message });
}

function validateImportPlanSchema(plan) {
  const errors = [];
  const warnings = [];

  if (!plan || typeof plan !== "object") {
    return { ok: false, errors: [{ path: "$", message: "Plan must be object" }], warnings };
  }

  for (const key of Object.keys(plan)) {
    if (!ALLOWED_TOP_LEVEL.has(key)) {
      fail(errors, key, `Unknown top-level field rejected: ${key}`);
    }
  }

  for (const req of [
    "import_plan_version",
    "product_os_release",
    "fingerprint",
    "products",
    "plannedActions",
    "skippedActions",
    "entityInventory"
  ]) {
    if (plan[req] == null) fail(errors, req, "required");
  }

  if (plan.dbWrite !== false) fail(errors, "dbWrite", "must be false in Phase 4A.1");
  if (plan.neonConnection !== false) fail(errors, "neonConnection", "must be false");

  if (plan.integrity?.hasProtectionProduct) {
    fail(errors, "integrity.hasProtectionProduct", "Protection must not be a product");
  }
  if (plan.integrity?.hasCanonicalE07) {
    fail(errors, "integrity.hasCanonicalE07", "Canonical E-07 forbidden");
  }

  const productCodes = new Set();
  for (const p of plan.products || []) {
    if (!p.productCode) fail(errors, "products.productCode", "missing");
    if (productCodes.has(p.productCode)) {
      fail(errors, `products.${p.productCode}`, "duplicate stable product code");
    }
    productCodes.add(p.productCode);
    if (p.productCode === "E-07") fail(errors, "products", "E-07 not allowed");
    if (!["FOUNDATION", "COLLECTION", "EXPERIENCE", "STANDALONE", "ADDON"].includes(p.productKind)) {
      fail(errors, `products.${p.productCode}.productKind`, `invalid kind ${p.productKind}`);
    }
    if (!["STANDARD", "PACK"].includes(p.commercialRole)) {
      fail(errors, `products.${p.productCode}.commercialRole`, `invalid role ${p.commercialRole}`);
    }
  }

  for (const a of plan.addons || []) {
    if (!a.productCode || !/^AO-\d+/i.test(a.productCode)) {
      fail(errors, "addons", `invalid addon code ${a.productCode}`);
    }
    if (!a.parentProductCodes || a.parentProductCodes.length === 0) {
      fail(errors, `addons.${a.productCode}`, "orphan addon — no parents");
    }
    if (a.createsNewRoomViolation) {
      fail(errors, `addons.${a.productCode}`, "creates-new-room violation");
    }
    if (a.eligibilityStatus === "ORPHAN") {
      fail(errors, `addons.${a.productCode}`, "orphan");
    }
  }

  for (const price of plan.prices || []) {
    if (price.customerPriceInclGst == null) {
      fail(errors, `prices.${price.productCode}`, "missing customer price");
    }
    if (price.customerPriceInclGst === 0) {
      fail(errors, `prices.${price.productCode}`, "zero-price placeholder forbidden");
    }
    if (price.currency && price.currency !== "AUD") {
      fail(errors, `prices.${price.productCode}`, "currency must be AUD");
    }
    if (typeof price.materialCostExGst === "number") {
      fail(errors, `prices.${price.productCode}`, "internal material cost must not appear on plan surface");
    }
  }

  for (const bom of plan.bomItems || []) {
    if (!(Number(bom.qty) > 0)) {
      fail(errors, `bomItems.${bom.bomItemCode}`, "qty must be > 0");
    }
  }

  for (const exp of plan.experiences || []) {
    if (!isValidStableCode("experience", exp.experienceCode)) {
      fail(errors, `experiences.${exp.experienceCode}`, "invalid experience stable code");
    }
  }

  const contentKinds = new Set([
    "HERO", "SUBTITLE", "STORY_TITLE", "STORY_BODY", "FRONT_MOMENT_TITLE",
    "FRONT_MOMENT_CAPTION", "PROBLEM", "BETTER_HOME_RESPONSE",
    "CUSTOMER_EXPERIENCE_COPY", "INSTALLATION_ASSUMPTION_CUSTOMER", "FOOTER",
    "ADDON_EXPERIENCE_PROMISE"
  ]);
  for (const c of plan.contentEntries || []) {
    if (!contentKinds.has(c.contentKind)) fail(errors, `contentEntries.${c.contentCode}`, `invalid content kind ${c.contentKind}`);
  }

  for (const r of plan.expandFurtherRelationships || []) {
    if (!productCodes.has(r.fromProductCode) || !productCodes.has(r.toProductCode)) {
      fail(errors, `expandFurtherRelationships.${r.relationshipCode}`, "unresolved product reference");
    }
    if (r.fromProductCode === r.toProductCode) fail(errors, `expandFurtherRelationships.${r.relationshipCode}`, "self relationship");
  }
  if ((plan.transformValidation?.expandFurtherUnresolved || []).length) fail(errors, "transformValidation.expandFurtherUnresolved", "must be empty");
  if ((plan.transformValidation?.expandFurtherDuplicates || []).length) fail(errors, "transformValidation.expandFurtherDuplicates", "must be empty");
  if ((plan.transformValidation?.duplicateA4ContentIds || []).length) fail(errors, "transformValidation.duplicateA4ContentIds", "must be empty");
  if (plan.transformValidation?.a4Verbatim?.ok !== true) fail(errors, "transformValidation.a4Verbatim", "must pass");

  for (const skip of plan.skippedActions || []) {
    if (!skip.reasonCode) fail(errors, "skippedActions", "skip without reasonCode");
    if (!skip.sheet) fail(errors, "skippedActions", "skip without sheet");
  }

  // Silent skip detector: UNKNOWN disposition
  const unknownSheets = (plan.sheetDisposition?.matrix || []).filter(
    (r) => r.importStatus === "UNKNOWN"
  );
  if (unknownSheets.length) {
    fail(errors, "sheetDisposition", `UNKNOWN sheets: ${unknownSheets.map((s) => s.sheet).join(",")}`);
  }

  return { ok: errors.length === 0, errors, warnings };
}

module.exports = {
  ALLOWED_TOP_LEVEL,
  validateImportPlanSchema
};
