/**
 * Legacy → canonical Product OS identity crosswalk (DEC-013 / ADR-012).
 * Synthetic-safe pure functions. Does not rewrite historical records.
 */

const LEGACY_SYSTEM = "V2_07_WORKBOOK";

/** Authoritative import transforms (planned; applied at Phase 4/5 import only). */
const LEGACY_CROSSWALK = Object.freeze([
  {
    legacyCode: "E-05",
    legacyLabel: "Protection Bonus",
    resolutionKind: "INCLUDED_BENEFIT",
    canonicalProductCode: null,
    includedBenefitCode: "benefit.protection_bonus",
    hostProductCode: "E-05", // after remapping: CCTV is canonical E-05
    notes: "Legacy Protection Bonus product ID withdrawn; benefit hosted on CCTV"
  },
  {
    legacyCode: "E-06",
    legacyLabel: "CCTV",
    resolutionKind: "PRODUCT",
    canonicalProductCode: "E-05",
    includedBenefitCode: null,
    hostProductCode: null,
    notes: "Legacy E-06 CCTV → canonical E-05"
  },
  {
    legacyCode: "E-07",
    legacyLabel: "Smart Toilet",
    resolutionKind: "PRODUCT",
    canonicalProductCode: "E-06",
    includedBenefitCode: null,
    hostProductCode: null,
    notes: "Legacy E-07 Smart Toilet → canonical E-06"
  }
]);

const CANONICAL_CLASSIFICATION = Object.freeze({
  "E-05": { canonicalName: "CCTV", productKind: "EXPERIENCE", commercialRole: "PACK" },
  "E-06": { canonicalName: "Smart Toilet", productKind: "STANDALONE", commercialRole: "STANDARD" }
});

/** Protection unlock prerequisites after renumbering (Entry ∧ Away ∧ CCTV). */
const PROTECTION_UNLOCK_REQUIRED_CODES = Object.freeze(["C-01", "C-06", "E-05"]);

function normalizeProductCode(code) {
  return code == null ? null : String(code).trim().toUpperCase();
}

function resolveLegacyAlias(legacyCode) {
  const code = normalizeProductCode(legacyCode);
  return LEGACY_CROSSWALK.find((row) => row.legacyCode === code) || null;
}

function toCanonicalProductCode(sourceCode) {
  const code = normalizeProductCode(sourceCode);
  if (!code) return null;
  // Workbook Legacy codes always take precedence (E-05=Protection benefit, E-06→CCTV, E-07→Toilet).
  // Canonical CCTV/Toilet codes appear as *outputs* of PRODUCT remaps, not as Legacy E-05/E-06 inputs.
  const row = resolveLegacyAlias(code);
  if (!row) return code;
  if (row.resolutionKind === "PRODUCT") return row.canonicalProductCode;
  return null; // INCLUDED_BENEFIT / WITHDRAWN — no product code
}

function isCanonicalProductCodeAllowed(code) {
  const c = normalizeProductCode(code);
  if (!c) return false;
  if (c === "E-07") return false; // no canonical E-07
  // Protection must never be imported as a product under any code
  return true;
}

function assertNoProtectionProductRecord(product) {
  const name = String(product?.canonicalName || "").toLowerCase();
  const code = normalizeProductCode(product?.productCode);
  const isProtectionName = name.includes("protection") && name.includes("bonus");
  const isLegacyProtectionCode = code === "E-05" && isProtectionName;
  // After renumber, E-05 is CCTV — reject Protection product by name/role
  if (isProtectionName) return false;
  if (product?.commercialRole === "BONUS") return false;
  if (isLegacyProtectionCode) return false;
  return true;
}

function mapWorkbookProductCode(workbookCode, workbookName = "") {
  const code = normalizeProductCode(workbookCode);
  const name = String(workbookName || "").toLowerCase();
  if (code === "E-05" && name.includes("protection")) {
    return {
      action: "ALIAS_TO_BENEFIT",
      ...resolveLegacyAlias("E-05")
    };
  }
  if (code === "E-06" && (name.includes("cctv") || !name)) {
    return {
      action: "REMAP_PRODUCT",
      ...resolveLegacyAlias("E-06")
    };
  }
  if (code === "E-07") {
    return {
      action: "REMAP_PRODUCT",
      ...resolveLegacyAlias("E-07")
    };
  }
  // Workbook may already use old labels with codes — also remap by code alone for E-06/E-07
  if (code === "E-06") return { action: "REMAP_PRODUCT", ...resolveLegacyAlias("E-06") };
  if (code === "E-07") return { action: "REMAP_PRODUCT", ...resolveLegacyAlias("E-07") };
  return { action: "KEEP", legacyCode: code, canonicalProductCode: code };
}

function protectionUnlockSatisfied(selectedProductCodes = []) {
  const set = new Set(selectedProductCodes.map(normalizeProductCode));
  return PROTECTION_UNLOCK_REQUIRED_CODES.every((c) => set.has(c));
}

module.exports = {
  LEGACY_SYSTEM,
  LEGACY_CROSSWALK,
  CANONICAL_CLASSIFICATION,
  PROTECTION_UNLOCK_REQUIRED_CODES,
  normalizeProductCode,
  resolveLegacyAlias,
  toCanonicalProductCode,
  isCanonicalProductCodeAllowed,
  assertNoProtectionProductRecord,
  mapWorkbookProductCode,
  protectionUnlockSatisfied
};
