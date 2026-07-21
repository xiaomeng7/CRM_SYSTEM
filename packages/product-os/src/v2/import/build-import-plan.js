/**
 * Phase 4A / 4A.1 orchestrator: immutable sources → deterministic ImportPlan IR.
 * NEVER writes to Neon / Prisma / pos2_*. Fact import is Phase 4B+.
 */

const path = require("path");
const {
  verifyApprovedSources,
  SOURCE_DIR,
  APPROVED_SOURCES
} = require("./source-fingerprint");
const {
  loadWorkbook,
  assertExpectedSheets,
  readSheetRows,
  listSheets
} = require("./workbook-reader");
const {
  transformProductMasterRow,
  transformAddonRow,
  transformPricingSummaryRow
} = require("./product-transforms");
const { listApprovedDeltas } = require("./delta-overlays");
const {
  LEGACY_CROSSWALK,
  PROTECTION_UNLOCK_REQUIRED_CODES
} = require("../legacy-crosswalk");
const {
  SHEET_DISPOSITION,
  assertAllSheetsClassified,
  dispositionForSheet
} = require("./sheet-catalog");
const xt = require("./extended-transforms");
const { buildApprovedA4ContentPlan, assertVerbatim } = require("./a4-content-transform");
const { buildExpandFurtherPlan } = require("./expand-further-transform");

const PHASE = "4A.2";
const PLAN_VERSION = "1.2.0";
const PRODUCT_OS_RELEASE = "V2.07";
const A4_TEMPLATE_VERSION_SEPARATE = true;

function emptyStats() {
  return {
    masterRows: 0,
    upsertProducts: 0,
    skipToBenefit: 0,
    rejected: 0,
    addonRows: 0,
    priceRows: 0,
    skipPrices: 0,
    experiences: 0,
    capabilities: 0,
    bomItems: 0,
    rules: 0,
    automations: 0,
    contentEntries: 0,
    themes: 0,
    assets: 0,
    warnings: 0,
    intentionalSkips: 0
  };
}

function sheetDispositionMatrix(workbook, skippedActions) {
  const names = listSheets(workbook);
  const classification = assertAllSheetsClassified(names);
  const skipsBySheet = new Map();
  for (const s of skippedActions) {
    const list = skipsBySheet.get(s.sheet) || [];
    list.push(s);
    skipsBySheet.set(s.sheet, list);
  }

  const matrix = SHEET_DISPOSITION.map((d) => {
    const sheetExists = names.includes(d.sheet);
    let rowsRead = 0;
    let rowsPlanned = 0;
    let rowsSkipped = 0;
    if (sheetExists && d.importStatus === "LEGACY_SKIPPED") {
      const raw = workbook.Sheets[d.sheet];
      const XLSX = require("xlsx");
      rowsRead = XLSX.utils.sheet_to_json(raw, { defval: null }).length;
      rowsSkipped = rowsRead;
      rowsPlanned = 0;
    } else if (sheetExists && d.importStatus !== "INTENTIONALLY_SKIPPED" && d.importStatus !== "REFERENCE_ONLY") {
      const bundle = readSheetRows(workbook, d.sheet, { allowMissing: true });
      rowsRead = bundle.rows.length;
      const sheetSkips = skipsBySheet.get(d.sheet) || [];
      rowsSkipped = sheetSkips.length;
      // planned approximated later; placeholder filled by caller via counts
      rowsPlanned = Math.max(0, rowsRead - rowsSkipped);
    } else if (sheetExists) {
      const bundle = readSheetRows(workbook, d.sheet, { allowMissing: true });
      // REFERENCE / INTENTIONAL: count as read for audit, planned 0
      if (d.importStatus === "REFERENCE_ONLY" || d.importStatus === "INTENTIONALLY_SKIPPED") {
        const XLSX = require("xlsx");
        rowsRead = XLSX.utils.sheet_to_json(workbook.Sheets[d.sheet], { defval: null }).length;
        rowsPlanned = 0;
        rowsSkipped = d.importStatus === "INTENTIONALLY_SKIPPED" ? rowsRead : 0;
      } else {
        rowsRead = bundle.rows.length;
      }
    }
    return {
      sheet: d.sheet,
      authorityRole: d.authorityRole,
      importStatus: d.importStatus,
      targetContext: d.targetContext,
      rowsRead,
      rowsPlanned,
      rowsSkipped,
      reason: d.reason,
      sheetExists
    };
  });

  return { classification, matrix };
}

/**
 * Build ImportPlan from an already-loaded workbook object (for tests / offline).
 */
function buildImportPlanFromWorkbook(workbook, options = {}) {
  const fingerprint = options.fingerprint || { skipped: true, reason: "IN_MEMORY_WORKBOOK" };
  const sheetCheck = assertExpectedSheets(workbook);
  const warnings = [];
  const stats = emptyStats();
  const skippedActions = [];
  const plannedActions = [];

  if (!sheetCheck.ok) {
    warnings.push(`Missing sheets: ${sheetCheck.missing.join(", ")}`);
  }

  const master = readSheetRows(workbook, "04_Product_Master");
  const addons = readSheetRows(workbook, "11_Add_Ons");
  const pricing = readSheetRows(workbook, "10_Pricing_Summary");
  const cardContent = readSheetRows(workbook, "12_Product_Card_Content");

  if (cardContent.skippedReason) {
    const XLSX = require("xlsx");
    const legacyRows = XLSX.utils.sheet_to_json(workbook.Sheets["12_Product_Card_Content"] || {}, {
      defval: null
    });
    for (let i = 0; i < legacyRows.length; i += 1) {
      skippedActions.push({
        sheet: "12_Product_Card_Content",
        sourceRow: i + 2,
        stableSourceReference: `legacy_card_row_${i + 2}`,
        reasonCode: "LEGACY_NON_AUTHORITATIVE",
        downstreamImpact: "Customer copy must come from 14_Content_Library / A4 migrate (DEC-012)"
      });
      stats.intentionalSkips += 1;
    }
    warnings.push(
      `Sheet 12_Product_Card_Content skipped: LEGACY_NON_AUTHORITATIVE (use 14_Content_Library)`
    );
  }

  // Roadmap intentional skip
  {
    const XLSX = require("xlsx");
    const roadmapRows = XLSX.utils.sheet_to_json(workbook.Sheets["13_Roadmap"] || {}, { defval: null });
    for (let i = 0; i < roadmapRows.length; i += 1) {
      skippedActions.push({
        sheet: "13_Roadmap",
        sourceRow: i + 2,
        stableSourceReference: `roadmap_${i + 2}`,
        reasonCode: "INTENTIONALLY_SKIPPED_ROADMAP",
        downstreamImpact: "Not part of V2.07 catalogue import"
      });
      stats.intentionalSkips += 1;
    }
  }

  const products = [];
  const aliases = [];
  const includedBenefits = [];
  const prices = [];
  let addonPlans = [];

  for (const row of master.rows) {
    stats.masterRows += 1;
    const plan = transformProductMasterRow(row);
    if (plan.action === "UPSERT_PRODUCT") {
      stats.upsertProducts += 1;
      products.push(plan);
      plannedActions.push({ type: "UPSERT_PRODUCT", productCode: plan.productCode });
      if (plan.identityRemap) {
        aliases.push({
          legacySystem: "V2_07_WORKBOOK",
          legacyCode: plan.legacyCode,
          canonicalProductCode: plan.productCode,
          resolutionKind: "PRODUCT"
        });
      }
    } else if (plan.action === "SKIP_TO_BENEFIT") {
      stats.skipToBenefit += 1;
      skippedActions.push({
        sheet: "04_Product_Master",
        sourceRow: null,
        stableSourceReference: plan.legacyCode,
        reasonCode: "SKIP_TO_INCLUDED_BENEFIT",
        downstreamImpact: "Protection is benefit.protection_bonus on CCTV E-05"
      });
      includedBenefits.push({
        benefitCode: plan.includedBenefitCode,
        hostProductCode: plan.hostProductCode,
        unlockRequiredCodes: [...PROTECTION_UNLOCK_REQUIRED_CODES],
        legacyCode: plan.legacyCode,
        purchasable: false,
        selectable: false,
        hasProductPage: false,
        hasPrice: false
      });
      aliases.push({
        legacySystem: "V2_07_WORKBOOK",
        legacyCode: plan.legacyCode,
        canonicalProductCode: null,
        includedBenefitCode: plan.includedBenefitCode,
        resolutionKind: "INCLUDED_BENEFIT"
      });
    } else {
      stats.rejected += 1;
      warnings.push(`Rejected master row ${plan.legacyCode}: ${plan.reason}`);
    }
    stats.warnings += (plan.warnings || []).length;
    warnings.push(...(plan.warnings || []));
  }

  const settings = xt.transformSettingsRows(readSheetRows(workbook, "01_Settings").rows);
  const labourLibrary = xt.transformLabourLibraryRows(readSheetRows(workbook, "02_Labour_Library").rows);
  const skus = xt.transformSkuMasterRows(readSheetRows(workbook, "03_SKU_Master").rows);

  const expBundle = xt.transformExperienceRows(readSheetRows(workbook, "05_Product_Experiences").rows);
  const capBundle = xt.transformCapabilityRows(readSheetRows(workbook, "06_Product_Capabilities").rows);
  const bomBundle = xt.transformBomRows(readSheetRows(workbook, "07_Product_BOM").rows);
  const labBundle = xt.transformLabourApplicationRows(readSheetRows(workbook, "08_Product_Labour").rows);
  const ruleBundle = xt.transformRuleRows(readSheetRows(workbook, "09_Product_Rules").rows);
  const autoBundle = xt.transformAutomationRows(readSheetRows(workbook, "19_Automation_Library").rows);
  const contentBundle = xt.transformContentRows(readSheetRows(workbook, "14_Content_Library").rows);
  const themeBundle = xt.transformThemeRows(readSheetRows(workbook, "17_Theme_Library").rows);
  const imageBundle = xt.transformImageRows(readSheetRows(workbook, "16_Image_Library").rows);
  const iconBundle = xt.transformIconRows(readSheetRows(workbook, "15_Icon_Library").rows);
  const layoutBundle = xt.transformLayoutRows(readSheetRows(workbook, "18_Layout_Config").rows);

  for (const bundle of [
    expBundle,
    capBundle,
    bomBundle,
    labBundle,
    ruleBundle,
    autoBundle,
    contentBundle,
    themeBundle,
    imageBundle,
    iconBundle,
    layoutBundle
  ]) {
    skippedActions.push(...(bundle.skipped || []));
  }

  stats.experiences = expBundle.experiences.length;
  stats.capabilities = capBundle.capabilities.length;
  stats.bomItems = bomBundle.bomItems.length;
  stats.rules = ruleBundle.rules.length;
  stats.automations = autoBundle.automations.length;
  stats.contentEntries = contentBundle.contentEntries.length;
  stats.themes = themeBundle.themes.length;
  stats.assets = imageBundle.assets.length;

  // Indexes for Add-on basis
  const bomSkuByProduct = new Map();
  for (const item of bomBundle.bomItems) {
    const set = bomSkuByProduct.get(item.productCode) || new Set();
    set.add(item.skuCode);
    bomSkuByProduct.set(item.productCode, set);
  }
  // Include DEC-001 planned MAG-001 on C-01 for eligibility proofs that depend on door contact add-ons
  {
    const set = bomSkuByProduct.get("C-01") || new Set();
    set.add("MAG-001");
    bomSkuByProduct.set("C-01", set);
  }
  // C-06 already has contacts
  const capabilityByProduct = new Map();
  for (const cap of capBundle.capabilities) {
    const set = capabilityByProduct.get(cap.productCode) || new Set();
    set.add(cap.capabilityCode);
    set.add((cap.capabilityName || "").toLowerCase());
    capabilityByProduct.set(cap.productCode, set);
  }

  for (const row of addons.rows) {
    stats.addonRows += 1;
    const plan = transformAddonRow(row);
    // Fix default sku field from normalized header
    if (!plan.defaultSkuOrCapability) {
      plan.defaultSkuOrCapability =
        row.default_sku___capability || row.default_sku_capability || null;
    }
    const enriched = xt.enrichAddonPlan(plan, capabilityByProduct, bomSkuByProduct);
    addonPlans.push(enriched);
    stats.warnings += (enriched.warnings || []).length;
    warnings.push(...(enriched.warnings || []));
  }

  for (const row of pricing.rows) {
    stats.priceRows += 1;
    const plan = transformPricingSummaryRow(row);
    if (plan.action === "SKIP_PRICE") {
      stats.skipPrices += 1;
      skippedActions.push({
        sheet: "10_Pricing_Summary",
        sourceRow: null,
        stableSourceReference: plan.legacyCode,
        reasonCode: "PROTECTION_NOT_PRICED",
        downstreamImpact: "No product_prices for Protection Bonus"
      });
      warnings.push(...(plan.warnings || []));
    } else {
      // Redact internal costing from plan surface
      prices.push({
        action: plan.action,
        legacyCode: plan.legacyCode,
        productCode: plan.productCode,
        customerPriceInclGst: plan.customerPriceInclGst,
        currency: "AUD",
        taxBasis: "GST_INCLUSIVE",
        fulfillmentMode:
          plan.productCode === "E-06" ? "SUPPLY_ONLY" : "INSTALLED",
        installationIncluded: plan.productCode === "E-06" ? false : true,
        displayMode: plan.productCode === "E-05" ? "FROM" : "EXACT", // CCTV review says From
        priceDisplayModeStatus: "NEEDS_SOURCE_STRUCTURE", // ISSUE-012 partial
        customerVisible: true,
        internalCosting: "REDACTED",
        decisionHints: plan.productCode === "E-06" ? ["DEC-011"] : ["DEC-011"],
        warnings: plan.warnings || []
      });
    }
    stats.warnings += (plan.warnings || []).length;
  }

  // CCTV From: review notes say "From price" for CCTV — mark E-05
  for (const p of prices) {
    if (p.productCode === "E-05") {
      p.displayMode = "FROM";
      p.fulfillmentMode = "INSTALLED";
    }
  }

  const decisionDeltas = [
    xt.plannedDoorContactDelta(),
    {
      action: "APPLY_DELTA",
      ref: "DELTA-C03-KICK",
      decision: "DEC-002",
      productCode: "C-03",
      plannedObjects: [{ type: "CAPABILITY_RENAME", to: "Warm Kickboard Ambient Zone" }]
    },
    {
      action: "APPLY_DELTA",
      ref: "DELTA-C05-CIRCUIT",
      decision: "DEC-003",
      productCode: "C-05",
      plannedObjects: [{ type: "CONTENT_QUALIFIER", text: "six compatible circuits (not lighting-only)" }]
    },
    xt.plannedReturnRoutineDelta(),
    xt.plannedProtectionBenefit(),
    {
      action: "APPLY_DELTA",
      ref: "DELTA-RENUMBER-E",
      decision: "DEC-013",
      plannedObjects: [
        { type: "ALIAS", from: "E-06", to: "E-05", label: "CCTV" },
        { type: "ALIAS", from: "E-07", to: "E-06", label: "Smart Toilet" },
        { type: "BENEFIT", from: "E-05", to: "benefit.protection_bonus" }
      ]
    }
  ];

  const governance = {
    import_plan_version: PLAN_VERSION,
    product_os_release: PRODUCT_OS_RELEASE,
    a4_template_version_separate: A4_TEMPLATE_VERSION_SEPARATE,
    phase: PHASE,
    decision_manifest: listApprovedDeltas().map((d) => ({
      ref: d.ref,
      authority: d.authority,
      status: d.status
    })),
    source_manifest: fingerprint
  };

  const codes = new Set(products.map((p) => p.productCode));
  const a4Plan = buildApprovedA4ContentPlan(expBundle.experiences);
  const expandPlan = buildExpandFurtherPlan([...codes]);
  const verbatim = assertVerbatim(a4Plan.contentEntries, a4Plan.verbatimChecks);
  if (!verbatim.ok) warnings.push(`A4 verbatim failures: ${verbatim.failures.length}`);
  const integrity = {
    hasProtectionProduct: products.some(
      (p) =>
        String(p.canonicalName || "")
          .toLowerCase()
          .includes("protection") && String(p.canonicalName || "").toLowerCase().includes("bonus")
    ),
    hasCanonicalE07: codes.has("E-07"),
    hasCctvAsE05: products.some((p) => p.productCode === "E-05" && /cctv/i.test(p.canonicalName || "")),
    hasToiletAsE06: products.some(
      (p) => p.productCode === "E-06" && /toilet/i.test(p.canonicalName || "")
    ),
    productCodeCount: codes.size,
    duplicateProductCodes: codes.size !== products.length
  };

  if (integrity.hasProtectionProduct) warnings.push("INTEGRITY: Protection product present");
  if (integrity.hasCanonicalE07) warnings.push("INTEGRITY: Canonical E-07 present");
  if (integrity.duplicateProductCodes) warnings.push("INTEGRITY: Duplicate product codes");

  const disposition = sheetDispositionMatrix(workbook, skippedActions);

  // Fix matrix planned counts with actual entity counts where possible
  const plannedBySheet = {
    "01_Settings": settings.length,
    "02_Labour_Library": labourLibrary.length,
    "03_SKU_Master": skus.length,
    "04_Product_Master": products.length + includedBenefits.length,
    "05_Product_Experiences": expBundle.experiences.length,
    "06_Product_Capabilities": capBundle.capabilities.length,
    "07_Product_BOM": bomBundle.bomItems.length,
    "08_Product_Labour": labBundle.labourApplications.length,
    "09_Product_Rules": ruleBundle.rules.length,
    "10_Pricing_Summary": prices.length,
    "11_Add_Ons": addonPlans.length,
    "14_Content_Library": contentBundle.contentEntries.length,
    "15_Icon_Library": iconBundle.icons.length,
    "16_Image_Library": imageBundle.assets.length,
    "17_Theme_Library": themeBundle.themes.length,
    "18_Layout_Config": layoutBundle.layouts.length,
    "19_Automation_Library": autoBundle.automations.length
  };
  for (const row of disposition.matrix) {
    if (plannedBySheet[row.sheet] != null) row.rowsPlanned = plannedBySheet[row.sheet];
  }

  const entityInventory = {
    products: products.length,
    productVersions: products.length, // one version label each from master
    aliases: aliases.length,
    includedBenefits: includedBenefits.length,
    experiences: expBundle.experiences.length,
    capabilities: capBundle.capabilities.length,
    bomItems: bomBundle.bomItems.length,
    labourLibrary: labourLibrary.length,
    labourApplications: labBundle.labourApplications.length,
    equipmentSkus: skus.length,
    rules: ruleBundle.rules.length,
    automations: autoBundle.automations.length + 1, // + Return Routine delta
    addons: addonPlans.length,
    prices: prices.length,
    contentEntries: contentBundle.contentEntries.length + a4Plan.contentEntries.length,
    themes: themeBundle.themes.length,
    assets: imageBundle.assets.length,
    icons: iconBundle.icons.length,
    layouts: layoutBundle.layouts.length,
    costingSettings: settings.length,
    relationshipsExpandFurther: expandPlan.relationships.length,
    featuredAddonOrders: expandPlan.featuredAddons.length,
    a4PresentationMappings: a4Plan.presentationMappings.length,
    a4ScopePresentationGroups: a4Plan.scopePresentation.length,
    decisionDeltaOverlays: decisionDeltas.length
  };

  const emptyEntityExplanations = {
    productRelationshipsOther: "deferred — beyond Expand Further until A4 extraction",
    priceDisplayModeRecords: "deferred — DEC-011 policy applied as fields on price rows; structured enum NEEDS_SOURCE"
  };

  return {
    phase: PHASE,
    import_plan_version: PLAN_VERSION,
    product_os_release: PRODUCT_OS_RELEASE,
    a4_template_version_separate: A4_TEMPLATE_VERSION_SEPARATE,
    // generated_at excluded from deterministic hash by serializer
    generated_at: new Date().toISOString(),
    dbWrite: false,
    neonConnection: false,
    fingerprint,
    sheetCheck,
    sheetDisposition: disposition,
    crosswalk: LEGACY_CROSSWALK.map((r) => ({ ...r })),
    approvedDeltas: listApprovedDeltas(),
    governance,
    decisionDeltas,
    products,
    addons: addonPlans,
    prices,
    aliases,
    includedBenefits,
    settings,
    labourLibrary,
    skus,
    experiences: expBundle.experiences,
    capabilities: capBundle.capabilities,
    bomItems: bomBundle.bomItems,
    labourApplications: labBundle.labourApplications,
    rules: ruleBundle.rules,
    automations: autoBundle.automations,
    contentEntries: [...contentBundle.contentEntries, ...a4Plan.contentEntries],
    a4PresentationMappings: a4Plan.presentationMappings,
    a4ScopePresentation: a4Plan.scopePresentation,
    expandFurtherRelationships: expandPlan.relationships,
    presentationCtas: expandPlan.presentationCtas,
    expandFurtherBonusNotes: expandPlan.bonusNotes,
    featuredAddons: expandPlan.featuredAddons,
    transformValidation: {
      a4Verbatim: verbatim,
      a4Coverage: a4Plan.coverage,
      duplicateA4ContentIds: a4Plan.duplicateContentIds,
      expandFurtherUnresolved: expandPlan.unresolved,
      expandFurtherDuplicates: expandPlan.duplicates
    },
    themes: themeBundle.themes,
    assets: imageBundle.assets,
    icons: iconBundle.icons,
    layouts: layoutBundle.layouts,
    plannedActions: [
      ...plannedActions,
      ...decisionDeltas.map((d) => ({ type: d.action, ref: d.ref || d.benefitCode }))
    ],
    skippedActions,
    entityInventory,
    emptyEntityExplanations,
    integrity,
    stats,
    warnings: [...new Set(warnings)],
    nextPhaseGates: {
      phase4B: "Requires Phase 4A.1 gate pass + explicit approval to write ImportPlan into Neon DEV pos2_*",
      phase5: "Publish / assets / ISSUE-007 still NEEDS_SOURCE",
      production: "Forbidden without separate approval"
    }
  };
}

function buildImportPlanFromApprovedSources(options = {}) {
  const sourceDir = options.sourceDir || SOURCE_DIR;
  const verification = verifyApprovedSources({ sourceDir });
  if (!verification.ok) {
    const failed = verification.results.filter((r) => !r.match);
    const err = new Error(
      `Immutable source fingerprint mismatch: ${failed.map((f) => f.relativePath).join(", ")}`
    );
    err.code = "PRODUCT_OS_SOURCE_FINGERPRINT";
    err.details = verification;
    throw err;
  }

  const workbookEntry = verification.results.find((r) => r.role === "workbook_facts");
  const workbook = loadWorkbook(workbookEntry.absolutePath);
  return buildImportPlanFromWorkbook(workbook, {
    fingerprint: {
      ok: true,
      sourceDir,
      sources: verification.results.map((r) => ({
        relativePath: r.relativePath,
        sha256: r.sha256,
        role: r.role,
        match: r.match
      }))
    }
  });
}

function defaultWorkbookPath() {
  return path.join(SOURCE_DIR, APPROVED_SOURCES[0].relativePath);
}

module.exports = {
  PHASE,
  PLAN_VERSION,
  PRODUCT_OS_RELEASE,
  buildImportPlanFromWorkbook,
  buildImportPlanFromApprovedSources,
  defaultWorkbookPath,
  emptyStats,
  dispositionForSheet
};
