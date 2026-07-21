/**
 * V2.07 sheet disposition catalog (Phase 4A.1).
 * Every sheet must have an explicit Import status — no silent unknowns.
 */

const IMPORT_STATUSES = Object.freeze([
  "AUTHORITATIVE_IMPORTED",
  "AUTHORITATIVE_DERIVED",
  "REFERENCE_ONLY",
  "LEGACY_SKIPPED",
  "INTENTIONALLY_SKIPPED",
  "BLOCKED_CONFLICT",
  "EMPTY",
  "UNKNOWN"
]);

/** @type {ReadonlyArray<{sheet:string, authorityRole:string, importStatus:string, targetContext:string, reason:string}>} */
const SHEET_DISPOSITION = Object.freeze([
  {
    sheet: "00_ReadMe",
    authorityRole: "DOCUMENTATION",
    importStatus: "REFERENCE_ONLY",
    targetContext: "Governance notes",
    reason: "Human readme; no catalogue facts"
  },
  {
    sheet: "01_Settings",
    authorityRole: "COSTING_SETTINGS",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "costing_settings (internal); GST reference",
    reason: "Loaded labour / GST reference; costs never customer-facing"
  },
  {
    sheet: "02_Labour_Library",
    authorityRole: "LABOUR_LIBRARY",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "labour_library",
    reason: "Technical labour catalogue"
  },
  {
    sheet: "03_SKU_Master",
    authorityRole: "EQUIPMENT_SKU",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "equipment_skus",
    reason: "SKU identity + supplier; unit cost internal-only"
  },
  {
    sheet: "04_Product_Master",
    authorityRole: "PRODUCT_IDENTITY",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "products / versions / aliases / benefits",
    reason: "Identity + kind×role; hero/price/accent non-authoritative cache"
  },
  {
    sheet: "05_Product_Experiences",
    authorityRole: "EXPERIENCE_FACTS",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "product_experiences",
    reason: "Canonical experience inventory (DEC-009); A4 map separate"
  },
  {
    sheet: "06_Product_Capabilities",
    authorityRole: "CAPABILITY_SCOPE",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "capabilities + inclusions",
    reason: "Included scope facts; DEC overlays may rename/qualify"
  },
  {
    sheet: "07_Product_BOM",
    authorityRole: "BOM_TECHNICAL",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "bom_versions + bom_items",
    reason: "Technical quantities; never drives customer wording"
  },
  {
    sheet: "08_Product_Labour",
    authorityRole: "LABOUR_APPLICATION",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "labour_versions + items",
    reason: "Internal labour application; costing redacted in artifacts"
  },
  {
    sheet: "09_Product_Rules",
    authorityRole: "PRODUCT_RULES",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "rule_definitions",
    reason: "Boundary rules; free-form keys normalized to stable codes"
  },
  {
    sheet: "10_Pricing_Summary",
    authorityRole: "CUSTOMER_PRICE",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "product_prices",
    reason: "Customer price authority; Protection SKIP_PRICE; costing internal"
  },
  {
    sheet: "11_Add_Ons",
    authorityRole: "ADDON_CATALOGUE",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "addon products + eligibility + prices",
    reason: "Add-on products; parent eligibility remapped"
  },
  {
    sheet: "12_Product_Card_Content",
    authorityRole: "LEGACY_CONTENT",
    importStatus: "LEGACY_SKIPPED",
    targetContext: "none (audit archive only)",
    reason: "DEC-012 / ISSUE-017 — non-authoritative; use 14_Content_Library"
  },
  {
    sheet: "13_Roadmap",
    authorityRole: "ROADMAP",
    importStatus: "INTENTIONALLY_SKIPPED",
    targetContext: "none",
    reason: "Future roadmap; not catalogue facts for V2.07 release"
  },
  {
    sheet: "14_Content_Library",
    authorityRole: "CUSTOMER_CONTENT",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "content_entries",
    reason: "Customer content authority for present rows; A4 verbatim gap = issue"
  },
  {
    sheet: "15_Icon_Library",
    authorityRole: "ICON_ASSETS",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "asset metadata (icons)",
    reason: "Optional visual metadata; not A4 content dependency"
  },
  {
    sheet: "16_Image_Library",
    authorityRole: "IMAGE_ASSETS",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "assets (publish-gated)",
    reason: "Paths imported as NOT_APPROVED_FOR_PUBLISH until originals registered (DEC-007)"
  },
  {
    sheet: "17_Theme_Library",
    authorityRole: "THEME",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "theme_tokens + channel override plan",
    reason: "Product accents; A4 green is channel override (DEC-006)"
  },
  {
    sheet: "18_Layout_Config",
    authorityRole: "LAYOUT_POLICY",
    importStatus: "AUTHORITATIVE_DERIVED",
    targetContext: "layout policy (subordinate to presentation map)",
    reason: "Imported as reference; A4 presentation map wins on drift (ISSUE-018)"
  },
  {
    sheet: "19_Automation_Library",
    authorityRole: "AUTOMATION",
    importStatus: "AUTHORITATIVE_IMPORTED",
    targetContext: "automation_definitions",
    reason: "Technical automation; DEC-004 Return Routine overlay planned"
  },
  {
    sheet: "20_Product_Review",
    authorityRole: "GOVERNANCE_QA",
    importStatus: "REFERENCE_ONLY",
    targetContext: "release gate notes",
    reason: "QA/review notes; commercial exceptions inform DEC-011 fields"
  },
  {
    sheet: "CHANGELOG",
    authorityRole: "CHANGELOG",
    importStatus: "REFERENCE_ONLY",
    targetContext: "governance",
    reason: "Version history reference; Product OS release = V2.07 (DEC-005)"
  }
]);

function dispositionForSheet(sheetName) {
  return SHEET_DISPOSITION.find((s) => s.sheet === sheetName) || null;
}

function assertAllSheetsClassified(sheetNames) {
  const unknown = [];
  const missing = [];
  for (const name of sheetNames) {
    const d = dispositionForSheet(name);
    if (!d) unknown.push(name);
    else if (d.importStatus === "UNKNOWN") unknown.push(name);
  }
  for (const d of SHEET_DISPOSITION) {
    if (!sheetNames.includes(d.sheet)) missing.push(d.sheet);
  }
  return { ok: unknown.length === 0 && missing.length === 0, unknown, missing };
}

module.exports = {
  IMPORT_STATUSES,
  SHEET_DISPOSITION,
  dispositionForSheet,
  assertAllSheetsClassified
};
