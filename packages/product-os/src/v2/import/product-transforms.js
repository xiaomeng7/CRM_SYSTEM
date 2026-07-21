/**
 * Product Master + Add-Ons → ImportPlan product rows (Phase 4A).
 * Pure transforms. No database I/O.
 */

const {
  mapWorkbookProductCode,
  normalizeProductCode,
  CANONICAL_CLASSIFICATION,
  assertNoProtectionProductRecord
} = require("../legacy-crosswalk");
const { kindRoleForCanonicalCode } = require("./type-normalize");
const { pick, asString } = require("./workbook-reader");
const { remapParentEligibility } = require("./reference-remap");
const { deltasForProduct } = require("./delta-overlays");

function parseMoneyish(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function transformProductMasterRow(row) {
  const legacyCode = normalizeProductCode(pick(row, ["product_id", "code"]));
  const name = asString(pick(row, ["name"]));
  const workbookType = asString(pick(row, ["type"]));
  const mapped = mapWorkbookProductCode(legacyCode, name || "");

  if (mapped.action === "ALIAS_TO_BENEFIT") {
    return {
      action: "SKIP_TO_BENEFIT",
      legacyCode,
      legacyName: name,
      workbookType,
      includedBenefitCode: mapped.includedBenefitCode,
      hostProductCode: mapped.hostProductCode,
      priceFromMaster: parseMoneyish(pick(row, ["final_customer_price_incl_gst"])),
      priceImport: "REJECT", // Protection has no sellable price
      deltas: deltasForProduct(null).filter((d) => d.ref === "DELTA-PROTECTION-BENEFIT"),
      warnings: [
        "Legacy E-05 Protection Bonus must not create a pos2 product row",
        "Price on Protection Master row must not import as product_prices"
      ]
    };
  }

  const canonicalCode =
    mapped.action === "REMAP_PRODUCT"
      ? mapped.canonicalProductCode
      : mapped.canonicalProductCode || legacyCode;

  const classFromCanon = CANONICAL_CLASSIFICATION[canonicalCode];
  const kindRole = kindRoleForCanonicalCode(canonicalCode, workbookType);
  const canonicalName = classFromCanon?.canonicalName || name;

  const candidate = {
    productCode: canonicalCode,
    canonicalName,
    productKind: kindRole.productKind,
    commercialRole: kindRole.commercialRole
  };

  if (!assertNoProtectionProductRecord(candidate)) {
    return {
      action: "REJECT",
      legacyCode,
      reason: "PROTECTION_MUST_NOT_BE_PRODUCT",
      warnings: ["Protection Bonus cannot be imported as a catalogue product"]
    };
  }

  if (canonicalCode === "E-07") {
    return {
      action: "REJECT",
      legacyCode,
      reason: "NO_CANONICAL_E07",
      warnings: ["Canonical E-07 does not exist"]
    };
  }

  return {
    action: "UPSERT_PRODUCT",
    legacyCode,
    productCode: canonicalCode,
    canonicalName,
    productKind: kindRole.productKind,
    commercialRole: kindRole.commercialRole,
    kindRoleSource: kindRole.source,
    workbookType,
    versionLabel: asString(pick(row, ["version"])),
    statusLabel: asString(pick(row, ["status"])),
    coverage: asString(pick(row, ["coverage"])),
    coreValue: asString(pick(row, ["core_value"])),
    primaryEmotion: asString(pick(row, ["primary_emotion"])),
    // Master hero/subtitle/accent are NON-authoritative (ISSUE-013 / ISSUE-006)
    masterHeroCacheOnly: asString(pick(row, ["hero_statement"])),
    masterSubtitleCacheOnly: asString(pick(row, ["subtitle"])),
    masterAccentCacheOnly: asString(pick(row, ["accent_colour"])),
    masterPriceCacheOnly: parseMoneyish(pick(row, ["final_customer_price_incl_gst"])),
    priceAuthoritySheet: "10_Pricing_Summary",
    contentAuthoritySheet: "14_Content_Library",
    themeAuthoritySheet: "17_Theme_Library",
    identityRemap: mapped.action === "REMAP_PRODUCT" ? mapped : null,
    deltas: deltasForProduct(canonicalCode),
    warnings: []
  };
}

function transformAddonRow(row) {
  const addonCode = normalizeProductCode(pick(row, ["add_on_id", "addon_id"]));
  const name = asString(pick(row, ["canonical_product_name", "name"]));
  const parentsRaw = pick(row, ["parent_product_id", "parent_product_ids"]);
  const parents = remapParentEligibility(parentsRaw);

  return {
    action: "UPSERT_ADDON",
    productCode: addonCode,
    canonicalName: name,
    productKind: "ADDON",
    commercialRole: "STANDARD",
    experiencePromise: asString(pick(row, ["experience_promise"])),
    parentProductCodes: parents.codes,
    parentDropped: parents.dropped,
    standardScopeUnit: asString(pick(row, ["standard_scope_unit"])),
    defaultSkuOrCapability: asString(
      pick(row, [
        "default_sku_capability",
        "default_sku___capability",
        "default_sku_/_capability"
      ])
    ),
    customerPriceInclGst: parseMoneyish(pick(row, ["customer_price_incl_gst"])),
    installationAssumptions: asString(pick(row, ["installation_assumptions"])),
    statusLabel: asString(pick(row, ["status"])),
    warnings: parents.warnings
  };
}

function transformPricingSummaryRow(row) {
  const legacyCode = normalizeProductCode(pick(row, ["product_id"]));
  const name = asString(pick(row, ["name"]));
  const mapped = mapWorkbookProductCode(legacyCode, name || "");

  if (mapped.action === "ALIAS_TO_BENEFIT") {
    return {
      action: "SKIP_PRICE",
      legacyCode,
      reason: "PROTECTION_NOT_PRICED",
      warnings: ["Protection Bonus pricing row must not create product_prices"]
    };
  }

  const productCode =
    mapped.action === "REMAP_PRODUCT"
      ? mapped.canonicalProductCode
      : mapped.canonicalProductCode || legacyCode;

  return {
    action: "UPSERT_PRICE",
    legacyCode,
    productCode,
    customerPriceInclGst: parseMoneyish(pick(row, ["customer_price_incl_gst"])),
    materialCostExGst: parseMoneyish(pick(row, ["material_cost_ex_gst"])),
    labourCostExGst: parseMoneyish(pick(row, ["labour_cost_ex_gst"])),
    directCostExGst: parseMoneyish(pick(row, ["direct_cost_ex_gst"])),
    grossProfitExGst: parseMoneyish(pick(row, ["gross_profit_ex_gst"])),
    // Customer-facing: only customerPriceInclGst is authoritative for A4
    costingFields: "INTERNAL_ONLY",
    fulfillmentModeDefault: productCode === "E-06" ? "NEEDS_SOURCE" : "INSTALLED",
    priceDisplayMode: "NEEDS_SOURCE", // ISSUE-012
    warnings: []
  };
}

module.exports = {
  parseMoneyish,
  transformProductMasterRow,
  transformAddonRow,
  transformPricingSummaryRow
};
