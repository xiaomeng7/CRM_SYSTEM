/**
 * Shared Product Page read-model contract (ADR-012).
 * Pure helpers for Website, Configurator, Quote, and A4 Print — same shape.
 * Phase: design + unit tests only; no DB / no fact import.
 */

const {
  protectionUnlockSatisfied,
  PROTECTION_UNLOCK_REQUIRED_CODES,
  assertNoProtectionProductRecord,
  toCanonicalProductCode
} = require("./legacy-crosswalk");

/**
 * @typedef {object} ProductPageReadModel
 * Fields required by ADR-012 shared read model.
 */

const READ_MODEL_REQUIRED_KEYS = Object.freeze([
  "productId",
  "productCode",
  "canonicalName",
  "productKind",
  "commercialRole",
  "hierarchy",
  "hero",
  "customerContent",
  "customerExperiences",
  "standardScope",
  "includedCapabilities",
  "compatibleExperiences",
  "permittedAddons",
  "featuredAddons",
  "dependencyState",
  "installationAssumptions",
  "activePrice",
  "taxBasis",
  "fulfilmentMode",
  "approvedImage",
  "themeLayout",
  "printEligible",
  "standalone",
  "quantityRules",
  "releaseVersion",
  "includedBenefits"
]);

function emptyReadModel(partial = {}) {
  return {
    productId: null,
    productCode: null,
    canonicalName: null,
    productKind: null,
    commercialRole: "STANDARD",
    hierarchy: { requiresFoundation: true, parentProductCode: null },
    hero: null,
    customerContent: {},
    customerExperiences: [],
    standardScope: [],
    includedCapabilities: [],
    compatibleExperiences: [],
    permittedAddons: [],
    featuredAddons: [],
    dependencyState: { satisfied: true, missing: [] },
    installationAssumptions: [],
    activePrice: null,
    taxBasis: null,
    fulfilmentMode: null,
    approvedImage: null,
    themeLayout: null,
    printEligible: true,
    standalone: false,
    quantityRules: { min: 1, max: null, allowsQuantity: true },
    releaseVersion: null,
    includedBenefits: [],
    ...partial
  };
}

function assertReadModelShape(model) {
  const missing = READ_MODEL_REQUIRED_KEYS.filter((k) => !(k in (model || {})));
  return { ok: missing.length === 0, missing };
}

/**
 * Filter Add-ons to those eligible for the given parent product code.
 */
function permittedAddonsForParent(allAddons = [], parentProductCode, eligibilityRows = []) {
  const parent = String(parentProductCode || "").toUpperCase();
  const eligibleIds = new Set(
    eligibilityRows
      .filter((r) => String(r.parentProductCode || "").toUpperCase() === parent)
      .map((r) => String(r.addonProductCode || "").toUpperCase())
  );
  return allAddons.filter((a) => eligibleIds.has(String(a.productCode || "").toUpperCase()));
}

/**
 * Experiences visible only when dependencies satisfied.
 */
function experiencesWithDependencies(experiences = [], selectedProductCodes = []) {
  const selected = new Set(selectedProductCodes.map((c) => String(c).toUpperCase()));
  return experiences
    .map((exp) => {
      const deps = (exp.dependsOnProductCodes || []).map((c) => String(c).toUpperCase());
      const missing = deps.filter((d) => !selected.has(d));
      return {
        ...exp,
        dependencyState: { satisfied: missing.length === 0, missing },
        visible: missing.length === 0
      };
    })
    .filter((e) => e.visible);
}

function applyProtectionBenefit(readModel, selectedProductCodes = []) {
  const unlocked = protectionUnlockSatisfied(selectedProductCodes);
  const benefits = [...(readModel.includedBenefits || [])];
  if (unlocked && String(readModel.productCode).toUpperCase() === "E-05") {
    const already = benefits.some((b) => b.benefitCode === "benefit.protection_bonus");
    if (!already) {
      benefits.push({
        benefitCode: "benefit.protection_bonus",
        displayName: "Protection Bonus Included",
        quoteValue: 0,
        unlocked: true
      });
    } else {
      benefits.forEach((b) => {
        if (b.benefitCode === "benefit.protection_bonus") b.unlocked = true;
      });
    }
  }
  return { ...readModel, includedBenefits: benefits };
}

/**
 * Build a print sheet payload from the same approved read model as the website.
 */
function toPrintProductSheet(readModel) {
  const shape = assertReadModelShape(readModel);
  if (!shape.ok) {
    const err = new Error(`Print sheet requires complete Product read model. Missing: ${shape.missing.join(",")}`);
    err.code = "PRODUCT_OS_READ_MODEL_INCOMPLETE";
    throw err;
  }
  if (!readModel.printEligible) {
    const err = new Error("Product is not print-eligible");
    err.code = "PRODUCT_OS_PRINT_NOT_ELIGIBLE";
    throw err;
  }
  // Same object identity contract — print consumes the shared model, not a fork.
  return {
    surface: "a4_print",
    source: "product_os_shared_read_model",
    product: readModel
  };
}

function foundationRequiredForSelection(product) {
  if (!product) return true;
  if (product.productKind === "STANDALONE" || product.standalone === true) return false;
  if (product.requiresFoundation === false) return false;
  return true;
}

module.exports = {
  READ_MODEL_REQUIRED_KEYS,
  emptyReadModel,
  assertReadModelShape,
  permittedAddonsForParent,
  experiencesWithDependencies,
  applyProtectionBenefit,
  toPrintProductSheet,
  foundationRequiredForSelection,
  PROTECTION_UNLOCK_REQUIRED_CODES,
  assertNoProtectionProductRecord,
  toCanonicalProductCode
};
