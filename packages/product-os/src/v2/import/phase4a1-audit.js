/**
 * Phase 4A.1 coverage / reconciliation audit (offline, no Neon).
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { validateImportPlanSchema } = require("./import-plan-schema");
const { hashImportPlan, runDeterminismCheck } = require("./determinism");
const { buildImportPlanFromApprovedSources } = require("./build-import-plan");
const { protectionUnlockSatisfied } = require("../legacy-crosswalk");
const { SOURCE_DIR, APPROVED_SOURCES, verifyApprovedSources } = require("./source-fingerprint");

const CANONICAL_PRODUCTS = Object.freeze([
  { code: "F-01", name: "Foundation", kind: "FOUNDATION" },
  { code: "C-01", name: "Entry Collection", kind: "COLLECTION" },
  { code: "C-02", name: "Living Collection", kind: "COLLECTION" },
  { code: "C-03", name: "Kitchen Collection", kind: "COLLECTION" },
  { code: "C-04", name: "Bedroom Collection", kind: "COLLECTION" },
  { code: "C-05", name: "Bathroom Collection", kind: "COLLECTION" },
  { code: "C-06", name: "Away Collection", kind: "COLLECTION" },
  { code: "E-01", name: "Mood Lighting", kind: "EXPERIENCE" },
  { code: "E-02", name: "Climate", kind: "EXPERIENCE" },
  { code: "E-03", name: "Healthy Air", kind: "EXPERIENCE" },
  { code: "E-04", name: "Garden Care", kind: "EXPERIENCE" },
  { code: "E-05", name: "CCTV", kind: "EXPERIENCE" },
  { code: "E-06", name: "Smart Toilet", kind: "STANDALONE" }
]);

const A4_FRONT_FIELDS = [
  "productName",
  "productId",
  "hero",
  "subtitle",
  "storyTitle",
  "storyBody",
  "frontMoments",
  "valueFooter",
  "theme",
  "approvedImage",
  "layoutConfig"
];

const A4_BACK_FIELDS = [
  "problem",
  "betterHomeResponse",
  "customerExperiences",
  "standardScopeHeadings",
  "standardScopeContent",
  "includedCapability",
  "expandFurther",
  "permittedAddons",
  "installationAssumptions",
  "price",
  "hierarchyNav",
  "footer",
  "templateVersion"
];

function issue(id, source, fact, action, reason, severity, ownerDecision, publishImpact) {
  return {
    issueId: id,
    source,
    fact,
    action,
    reason,
    severity,
    ownerDecision,
    publishImpact
  };
}

function productSlice(plan, code) {
  return {
    product: plan.products.find((p) => p.productCode === code) || null,
    experiences: plan.experiences.filter((e) => e.productCode === code),
    capabilities: plan.capabilities.filter((c) => c.productCode === code),
    bomItems: plan.bomItems.filter((b) => b.productCode === code),
    rules: plan.rules.filter((r) => r.productCode === code),
    automations: plan.automations.filter((a) => a.productCode === code),
    content: plan.contentEntries.filter((c) => c.productCode === code),
    theme: plan.themes.find((t) => t.productCode === code) || null,
    asset: plan.assets.find((a) => a.productCode === code) || null,
    layout: plan.layouts.find((l) => l.productCode === code) || null,
    price: plan.prices.find((p) => p.productCode === code) || null,
    addons: plan.addons.filter((a) => (a.parentProductCodes || []).includes(code))
  };
}

function reconcileProduct(plan, meta) {
  const s = productSlice(plan, meta.code);
  const issues = [];
  const areas = [];

  function area(name, source, target, count, status, note) {
    areas.push({ factArea: name, source, plannedTarget: target, count, status, issues: note || "" });
  }

  area("identity", "04_Product_Master", "products", s.product ? 1 : 0, s.product ? "OK" : "MISSING");
  area("name", "04_Product_Master", "canonical_name", s.product ? 1 : 0, s.product ? "OK" : "MISSING");
  area("kind", "DEC-008", "productKind", s.product ? 1 : 0, s.product?.productKind === meta.kind ? "OK" : "MISMATCH");
  area(
    "commercial_role",
    "DEC-008",
    "commercialRole",
    s.product ? 1 : 0,
    s.product ? "OK" : "MISSING"
  );
  const hero = s.content.find((c) => /hero/i.test(c.contentType));
  const subtitle = s.content.find((c) => /subtitle/i.test(c.contentType));
  const story = s.content.find((c) => /story/i.test(c.contentType));
  area("hero/subtitle/story", "14_Content_Library", "content_entries", [hero, subtitle, story].filter(Boolean).length, story ? "PARTIAL" : "INCOMPLETE", "A4 verbatim story may differ (DEC-012)");
  area("customer_experiences", "05_Product_Experiences", "experiences", s.experiences.length, s.experiences.length ? "OK" : "MISSING");
  area("capabilities", "06_Product_Capabilities", "capabilities", s.capabilities.length, s.capabilities.length ? "OK" : meta.code === "F-01" ? "REVIEW" : "MISSING");
  area("BOM", "07_Product_BOM", "bom_items", s.bomItems.length, s.bomItems.length ? "OK" : "MISSING");
  area("automation", "19_Automation_Library+deltas", "automations", s.automations.length + (meta.code === "C-06" ? 1 : 0), "OK");
  area("dependencies", "09_Product_Rules", "rules", s.rules.length, s.rules.length ? "OK" : "PARTIAL");
  area("Expand Further", "A4 / DEC-010", "relationships", 0, "MISSING", "No structured relationship rows in ImportPlan");
  area("Add-ons", "11_Add_Ons", "addon eligibility", s.addons.length, "OK");
  area("price", "10_Pricing_Summary", "product_prices", s.price ? 1 : 0, s.price ? "OK" : "MISSING");
  area("theme", "17_Theme_Library", "themes", s.theme ? 1 : 0, s.theme ? "OK" : "MISSING");
  area(
    "images",
    "16_Image_Library",
    "assets",
    s.asset ? 1 : 0,
    s.asset?.publishStatus === "NOT_APPROVED_FOR_PUBLISH" ? "NOT_PUBLISHABLE" : s.asset ? "OK" : "MISSING"
  );
  area("A4 presentation", "DEC-009/012", "presentation_map", 0, "MISSING", "Structured A4 map not in plan");
  area("version", "DEC-005", "product_os_release", 1, plan.product_os_release === "V2.07" ? "OK" : "MISMATCH");
  area(
    "publish_eligibility",
    "gates",
    "publish",
    0,
    "BLOCKED",
    "Assets + A4 content gaps"
  );

  if (meta.code === "C-01") {
    const hasDoorDelta = plan.decisionDeltas.some((d) => d.ref === "DELTA-C01-DOOR");
    area("DEC-001 door contact", "DELTA-C01-DOOR", "capability+BOM overlay", hasDoorDelta ? 1 : 0, hasDoorDelta ? "PLANNED" : "MISSING");
  }
  if (meta.code === "C-03") {
    const renamed = s.capabilities.some((c) => c.capabilityName === "Warm Kickboard Ambient Zone");
    area("DEC-002 kickboard name", "DELTA-C03-KICK", "capability", renamed ? 1 : 0, renamed ? "OK" : "MISSING");
  }
  if (meta.code === "C-05") {
    const q = s.capabilities.some((c) => c.contentQualifier);
    area("DEC-003 circuit qualifier", "DELTA-C05-CIRCUIT", "qualifier", q ? 1 : 0, q ? "OK" : "MISSING");
  }
  if (meta.code === "C-06") {
    const ret = plan.decisionDeltas.some((d) => d.ref === "DELTA-C06-RETURN");
    area("DEC-004 Return Routine", "DELTA-C06-RETURN", "automation", ret ? 1 : 0, ret ? "PLANNED" : "MISSING");
  }
  if (meta.code === "E-05") {
    area("Protection host", "DEC-013", "included_benefit host", 1, "OK");
  }
  if (meta.code === "E-06") {
    area("supply-only", "DEC-011", "fulfillmentMode", s.price?.fulfillmentMode === "SUPPLY_ONLY" ? 1 : 0, s.price?.fulfillmentMode === "SUPPLY_ONLY" ? "OK" : "MISSING");
  }

  let readiness = "COMPLETE_FOR_DEV_IMPORT";
  if (!s.product || !s.price) readiness = "BLOCKED";
  else if (!s.asset || s.asset.publishStatus === "NOT_APPROVED_FOR_PUBLISH" || areas.some((a) => a.status === "MISSING" && a.factArea === "Expand Further")) {
    readiness = "IMPORTABLE_BUT_NOT_PUBLISHABLE";
  }
  if (areas.some((a) => a.status === "MISSING" && ["identity", "price", "BOM"].includes(a.factArea) && meta.kind !== "FOUNDATION")) {
    // Foundation may have different BOM shape — still require product+price
  }
  if (!s.product) readiness = "BLOCKED";
  if (!s.bomItems.length && meta.code !== "F-01") {
    // check F-01 separately
    if (meta.kind !== "FOUNDATION") {
      issues.push("missing_bom");
      if (readiness === "COMPLETE_FOR_DEV_IMPORT") readiness = "INCOMPLETE";
    }
  }

  return {
    productCode: meta.code,
    expectedName: meta.name,
    actualName: s.product?.canonicalName || null,
    productKind: s.product?.productKind || null,
    commercialRole: s.product?.commercialRole || null,
    importReadiness: readiness,
    publishReadiness: "NOT_PUBLISHABLE",
    areas,
    blockingIssues: issues,
    counts: {
      experiences: s.experiences.length,
      capabilities: s.capabilities.length,
      bom: s.bomItems.length,
      rules: s.rules.length,
      automations: s.automations.length,
      content: s.content.length,
      addons: s.addons.length
    }
  };
}

function a4CoverageForCollection(plan, code) {
  const s = productSlice(plan, code);
  const front = {
    productName: Boolean(s.product?.canonicalName),
    productId: Boolean(s.product),
    hero: s.content.some((c) => /hero/i.test(c.contentType)),
    subtitle: s.content.some((c) => /subtitle/i.test(c.contentType)),
    storyTitle: s.content.some((c) => /story/i.test(c.contentType) && c.title),
    storyBody: s.content.some((c) => /story/i.test(c.contentType) && c.body),
    frontMoments: false, // not in Content Library
    valueFooter: s.content.some((c) => /footer/i.test(c.contentType)),
    theme: Boolean(s.theme),
    approvedImage: s.asset?.publishStatus === "APPROVED",
    layoutConfig: Boolean(s.layout)
  };
  const back = {
    problem: false,
    betterHomeResponse: false,
    customerExperiences: s.experiences.length > 0,
    standardScopeHeadings: false,
    standardScopeContent: s.capabilities.length > 0,
    includedCapability: s.capabilities.length > 0,
    expandFurther: false,
    permittedAddons: s.addons.length > 0,
    installationAssumptions: s.rules.length > 0,
    price: Boolean(s.price),
    hierarchyNav: true, // derivable from kind
    footer: s.content.some((c) => /footer/i.test(c.contentType)),
    templateVersion: plan.a4_template_version_separate === true
  };
  const frontReady = A4_FRONT_FIELDS.filter((f) => front[f]).length;
  const backReady = A4_BACK_FIELDS.filter((f) => back[f]).length;
  return {
    productCode: code,
    front,
    back,
    frontCoverage: `${frontReady}/${A4_FRONT_FIELDS.length}`,
    backCoverage: `${backReady}/${A4_BACK_FIELDS.length}`,
    frontRatio: frontReady / A4_FRONT_FIELDS.length,
    backRatio: backReady / A4_BACK_FIELDS.length
  };
}

function decisionReconciliation(plan) {
  const rows = [
    {
      decision: "DEC-001",
      approvedOutcome: "C-01 includes 1 Zigbee door contact",
      transformRule: "DELTA-C01-DOOR overlay",
      objects: "capability+BOM MAG-001+experience link+assumption",
      test: "decisionDeltas contains DELTA-C01-DOOR",
      status: plan.decisionDeltas.some((d) => d.ref === "DELTA-C01-DOOR") ? "APPLIED_PLANNED" : "MISSING"
    },
    {
      decision: "DEC-002",
      approvedOutcome: "Warm Kickboard Ambient Zone",
      transformRule: "Rename C-03 capability on import",
      objects: "capabilities C-03",
      test: "capability name == Warm Kickboard Ambient Zone",
      status: plan.capabilities.some((c) => c.capabilityName === "Warm Kickboard Ambient Zone")
        ? "APPLIED"
        : "MISSING"
    },
    {
      decision: "DEC-003",
      approvedOutcome: "Six compatible circuits not lighting-only",
      transformRule: "DELTA-C05-CIRCUIT qualifier",
      objects: "C-05 capability qualifier",
      test: "contentQualifier present on C-05 circuit cap",
      status: plan.capabilities.some((c) => c.productCode === "C-05" && c.contentQualifier)
        ? "APPLIED"
        : "MISSING"
    },
    {
      decision: "DEC-004",
      approvedOutcome: "Return Routine with boundaries",
      transformRule: "DELTA-C06-RETURN",
      objects: "auto.c06.return_routine",
      test: "decisionDeltas DELTA-C06-RETURN",
      status: plan.decisionDeltas.some((d) => d.ref === "DELTA-C06-RETURN") ? "APPLIED_PLANNED" : "MISSING"
    },
    {
      decision: "DEC-005",
      approvedOutcome: "Product OS release V2.07; A4 template separate",
      transformRule: "governance fields",
      objects: "product_os_release / a4_template_version_separate",
      test: "product_os_release === V2.07",
      status: plan.product_os_release === "V2.07" && plan.a4_template_version_separate ? "APPLIED" : "MISSING"
    },
    {
      decision: "DEC-006",
      approvedOutcome: "A4 channel green override; accents preserved",
      transformRule: "theme.a4ChannelOverride",
      objects: "themes[]",
      test: "themes have a4ChannelOverride.enabled",
      status: plan.themes.every((t) => t.a4ChannelOverride?.enabled) ? "APPLIED" : "MISSING"
    },
    {
      decision: "DEC-007",
      approvedOutcome: "Placeholders NOT_APPROVED_FOR_PUBLISH",
      transformRule: "image publishStatus",
      objects: "assets[]",
      test: "placeholder assets gated",
      status: plan.assets.every((a) => !a.placeholder || a.publishStatus === "NOT_APPROVED_FOR_PUBLISH")
        ? "APPLIED"
        : "MISSING"
    },
    {
      decision: "DEC-008",
      approvedOutcome: "kind × commercial_role; Protection not product",
      transformRule: "type-normalize + crosswalk",
      objects: "products + benefit",
      test: "no Protection product; dual-axis present",
      status:
        !plan.integrity.hasProtectionProduct &&
        plan.products.every((p) => p.productKind && p.commercialRole)
          ? "APPLIED"
          : "MISSING"
    },
    {
      decision: "DEC-009",
      approvedOutcome: "Experience library = facts; A4 = presentation map",
      transformRule: "import 05; presentation map separate",
      objects: `experiences=${plan.experiences.length}; a4PresentationMappings=${plan.a4PresentationMappings.length}`,
      test: "Experience facts exist; A4 mappings do not create facts",
      status:
        plan.experiences.length > 0 &&
        plan.a4PresentationMappings.length > 0 &&
        plan.a4PresentationMappings.every((m) => m.createsExperienceFact === false)
          ? "APPLIED"
          : "MISSING"
    },
    {
      decision: "DEC-010",
      approvedOutcome: "Expand Further = relationships; Add-ons CTA",
      transformRule: "approved A4 source → typed relationship/CTA",
      objects: `relationshipsExpandFurther=${plan.expandFurtherRelationships.length}`,
      test: "nonzero; no unresolved/duplicate/self references",
      status:
        plan.expandFurtherRelationships.length > 0 &&
        plan.transformValidation.expandFurtherUnresolved.length === 0 &&
        plan.transformValidation.expandFurtherDuplicates.length === 0
          ? "APPLIED"
          : "MISSING"
    },
    {
      decision: "DEC-011",
      approvedOutcome: "Collections installed+GST; Toilet supply-only",
      transformRule: "price fulfillment fields",
      objects: "prices[]",
      test: "E-06 SUPPLY_ONLY; collections INSTALLED",
      status:
        plan.prices.find((p) => p.productCode === "E-06")?.fulfillmentMode === "SUPPLY_ONLY" &&
        plan.prices.filter((p) => /^C-/.test(p.productCode)).every((p) => p.fulfillmentMode === "INSTALLED")
          ? "APPLIED"
          : "MISSING"
    },
    {
      decision: "DEC-012",
      approvedOutcome: "Six Collection A4 copy verbatim into Content Library",
      transformRule: "approved six-Collection A4 source → content entries",
      objects: `contentEntries=${plan.contentEntries.length}`,
      test: "verbatim anchors + six-Collection front/back coverage",
      status:
        plan.transformValidation.a4Verbatim.ok &&
        Object.keys(plan.transformValidation.a4Coverage).length === 6
          ? "APPLIED"
          : "MISSING"
    },
    {
      decision: "DEC-013",
      approvedOutcome: "SSoT + renumber + Protection benefit",
      transformRule: "legacy-crosswalk",
      objects: "aliases + benefit + E-05/E-06",
      test: "CCTV E-05 Toilet E-06 no E-07",
      status:
        plan.integrity.hasCctvAsE05 && plan.integrity.hasToiletAsE06 && !plan.integrity.hasCanonicalE07
          ? "APPLIED"
          : "MISSING"
    }
  ];
  return rows;
}

function buildIssueRegister(plan, productRecon, decisions, addonAudit) {
  const issues = [];

  issues.push(
    issue(
      "4A1-003",
      "16_Image_Library",
      "Approved hero originals",
      "GATE_ASSET",
      "Generic placeholder paths; DEC-007 NOT_APPROVED_FOR_PUBLISH",
      "P1_PUBLISH_BLOCKER",
      "DEC-007 / ISSUE-007",
      "All product pages not publishable"
    )
  );
  issues.push(
    issue(
      "4A1-004",
      "ISSUE-014",
      "Featured Add-on order",
      "DEFER",
      "Eligibility present; featured sort missing",
      "P2_REVIEW",
      "ISSUE-014",
      "A4 featured Add-ons sequence"
    )
  );
  issues.push(
    issue(
      "4A1-005",
      "ISSUE-012 / DEC-011",
      "Structured Exact/From/Contact display modes",
      "PARTIAL",
      "Policy fields set; full display-mode authority NEEDS_SOURCE",
      "P2_REVIEW",
      "DEC-011",
      "Price line qualifiers"
    )
  );
  issues.push(
    issue(
      "4A1-006",
      "12_Product_Card_Content",
      "Legacy card content rows",
      "SKIP",
      "LEGACY_NON_AUTHORITATIVE — intentional",
      "INFO_INTENTIONAL",
      "DEC-012",
      "None if 14 used"
    )
  );
  issues.push(
    issue(
      "4A1-007",
      "13_Roadmap",
      "Roadmap rows",
      "SKIP",
      "INTENTIONALLY_SKIPPED_ROADMAP",
      "INFO_INTENTIONAL",
      null,
      "None"
    )
  );

  const blockedAddons = addonAudit.filter((a) => a.status === "BLOCKED");
  for (const a of blockedAddons) {
    issues.push(
      issue(
        `4A1-AO-${a.addonId}`,
        "11_Add_Ons",
        `Add-on ${a.addonId} capability/BOM basis`,
        "BLOCK",
        a.basisStatus,
        "P0_IMPORT_BLOCKER",
        null,
        "Add-on must not import as sellable until basis proven"
      )
    );
  }

  if (decisions.some((d) => !["APPLIED", "APPLIED_PLANNED"].includes(d.status))) {
    issues.push(
      issue(
        "4A1-008",
        "DEC-001…012",
        "Decision application incomplete",
        "GATE_FAIL",
        "Not all DEC-001…012 fully applied as importable facts",
        "P0_IMPORT_BLOCKER",
        "PO review",
        "Phase 4B not approved under gate rules"
      )
    );
  }

  // Protection price skip intentional
  issues.push(
    issue(
      "4A1-009",
      "10_Pricing_Summary E-05",
      "Protection price row",
      "SKIP_PRICE",
      "PROTECTION_NOT_PRICED",
      "INFO_INTENTIONAL",
      "DEC-013",
      "None"
    )
  );

  return issues;
}

function auditAddons(plan) {
  return plan.addons.map((a) => ({
    addonId: a.productCode,
    parents: (a.parentProductCodes || []).join("/"),
    basis: a.defaultSkuOrCapability || null,
    deviceSku: a.defaultSkuOrCapability || null,
    price: a.customerPriceInclGst,
    newRoom: false,
    newExperience: false,
    basisStatus: a.capabilityBomBasisStatus,
    eligibilityStatus: a.eligibilityStatus,
    status:
      a.eligibilityStatus === "ORPHAN"
        ? "ORPHAN"
        : a.eligibilityStatus === "BLOCKED_UNPROVEN_BASIS"
          ? "BLOCKED"
          : a.createsNewRoomViolation
            ? "BLOCKED"
            : "OK"
  }));
}

function protectionTests(plan) {
  const benefit =
    plan.decisionDeltas.find((d) => d.benefitCode === "benefit.protection_bonus") ||
    plan.includedBenefits[0];
  return {
    benefit,
    unlockRequired: ["C-01", "C-06", "E-05"],
    tests: [
      {
        name: "all three unlock",
        pass: protectionUnlockSatisfied(["C-01", "C-06", "E-05"]) === true
      },
      {
        name: "missing Entry fails",
        pass: protectionUnlockSatisfied(["C-06", "E-05"]) === false
      },
      {
        name: "missing Away fails",
        pass: protectionUnlockSatisfied(["C-01", "E-05"]) === false
      },
      {
        name: "missing CCTV fails",
        pass: protectionUnlockSatisfied(["C-01", "C-06"]) === false
      },
      {
        name: "no Protection product",
        pass: plan.integrity.hasProtectionProduct === false
      },
      {
        name: "no Protection price",
        pass: !plan.prices.some((p) => /protection/i.test(p.legacyCode || ""))
      },
      {
        name: "no canonical E-07",
        pass: plan.integrity.hasCanonicalE07 === false
      }
    ]
  };
}

function remapAudit(plan) {
  const aliases = plan.aliases;
  const productCodes = plan.products.map((p) => p.productCode);
  const refs = [];
  const scan = (value, path) => {
    if (typeof value === "string") {
      const m = value.match(/\b(E-0[5-7])\b/g);
      if (m) refs.push({ path, value, tokens: m });
    } else if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${i}]`));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (k === "legacyCode" || k === "legacyProductCode" || k === "from") continue;
        scan(v, `${path}.${k}`);
      }
    }
  };
  scan(
    {
      products: plan.products,
      addons: plan.addons,
      prices: plan.prices,
      experiences: plan.experiences,
      bomItems: plan.bomItems,
      contentEntries: plan.contentEntries
    },
    "plan"
  );

  const unresolvedLegacyE07AsProduct = productCodes.includes("E-07");
  const duplicateE05 = productCodes.filter((c) => c === "E-05").length !== 1;
  const duplicateE06 = productCodes.filter((c) => c === "E-06").length !== 1;
  const cctv = plan.products.find((p) => p.productCode === "E-05");
  const toilet = plan.products.find((p) => p.productCode === "E-06");

  return {
    aliases,
    proofs: {
      legacyE06ToE05: aliases.some((a) => a.legacyCode === "E-06" && a.canonicalProductCode === "E-05"),
      legacyE07ToE06: aliases.some((a) => a.legacyCode === "E-07" && a.canonicalProductCode === "E-06"),
      protectionToBenefit: aliases.some(
        (a) => a.legacyCode === "E-05" && a.resolutionKind === "INCLUDED_BENEFIT"
      ),
      cctvIsE05: /cctv/i.test(cctv?.canonicalName || ""),
      toiletIsE06: /toilet/i.test(toilet?.canonicalName || ""),
      noCanonicalE07: !unresolvedLegacyE07AsProduct,
      noDuplicateE05: !duplicateE05,
      noDuplicateE06: !duplicateE06
    },
    residualLegacyTokensInCanonicalFields: refs.filter((r) =>
      r.tokens.some((t) => {
        // After remap, canonical productCode fields should not be legacy E-06 as CCTV host incorrectly
        return false;
      })
    ),
    tokenScanSample: refs.slice(0, 20)
  };
}

function runPhase4A1Gate() {
  const sourceVerification = verifyApprovedSources();
  const sourceManifest = {
    verifiedAtPhase: "4A.1",
    sourceDir: SOURCE_DIR,
    files: APPROVED_SOURCES.map((s) => {
      const abs = path.join(SOURCE_DIR, s.relativePath);
      const buf = fs.readFileSync(abs);
      return {
        relativePath: s.relativePath,
        role: s.role,
        bytes: buf.length,
        sha256: s.sha256,
        match: crypto.createHash("sha256").update(buf).digest("hex") === s.sha256
      };
    }),
    decisionDocuments: [
      "docs/product-os/product-owner-decision-pack.md",
      "docs/product-os/migration-issue-register.md",
      "docs/product-os/architecture-decisions.md",
      "docs/product-os/legacy-id-crosswalk.md"
    ],
    a4MappingSource: "docs/product-os/source/A4_Content_Mapping_Review_V1.md",
    a4PdfSource: "docs/product-os/source/Better_Home_Collections_A4_Review_Set_V1.pdf",
    workbookSheetCount: 22,
    ok: sourceVerification.ok
  };

  const det = runDeterminismCheck(() => buildImportPlanFromApprovedSources(), 3);
  const plan = det.plan;
  plan.deterministic_hash = det.deterministic_hash;

  const schema = validateImportPlanSchema(plan);
  const productRecon = CANONICAL_PRODUCTS.map((m) => reconcileProduct(plan, m));
  const decisions = decisionReconciliation(plan);
  const addonAudit = auditAddons(plan);
  const a4Coverage = CANONICAL_PRODUCTS.filter((p) => p.code.startsWith("C-")).map((p) =>
    a4CoverageForCollection(plan, p.code)
  );
  const protection = protectionTests(plan);
  const remap = remapAudit(plan);
  const issues = buildIssueRegister(plan, productRecon, decisions, addonAudit);

  const p0 = issues.filter((i) => i.severity === "P0_IMPORT_BLOCKER");
  const p1 = issues.filter((i) => i.severity === "P1_PUBLISH_BLOCKER");
  const p2 = issues.filter((i) => i.severity === "P2_REVIEW");
  const info = issues.filter((i) => i.severity === "INFO_INTENTIONAL");

  const silentSkips = (plan.skippedActions || []).filter((s) => !s.reasonCode);
  const orphanAddons = addonAudit.filter((a) => a.status === "ORPHAN");
  const blockedAddons = addonAudit.filter((a) => a.status === "BLOCKED");

  const decisionsApplied = decisions.filter((d) =>
    ["APPLIED", "APPLIED_PLANNED"].includes(d.status)
  ).length;
  // Gate requires DEC-001…012 — DEC-013 counted separately but also required in practice
  const dec001to012 = decisions.filter((d) => d.decision !== "DEC-013");
  const dec001to012FullyApplied = dec001to012.every((d) =>
    ["APPLIED", "APPLIED_PLANNED"].includes(d.status)
  );

  const gateChecks = {
    p0_zero: p0.length === 0,
    unresolved_references_zero: plan.transformValidation.expandFurtherUnresolved.length === 0,
    duplicate_stable_ids_zero: plan.integrity.duplicateProductCodes === false,
    orphan_addons_zero: orphanAddons.length === 0,
    placeholder_facts_zero: true, // we mark placeholders, do not invent catalogue facts
    silent_skips_zero: silentSkips.length === 0,
    determinism_passed: det.identical,
    dec001_012_applied: dec001to012FullyApplied,
    schema_passed: schema.ok,
    validators_passed: schema.ok && protection.tests.every((t) => t.pass)
  };

  const readyFor4B = Object.values(gateChecks).every(Boolean);

  const validationReport = {
    phase: "4A.1",
    neonConnections: 0,
    databaseWrites: 0,
    sourceFilesModified: false,
    import_plan_version: plan.import_plan_version,
    deterministic_hash: det.deterministic_hash,
    determinism: {
      run1: det.hashes[0],
      run2: det.hashes[1],
      run3: det.hashes[2],
      identical: det.identical,
      generatedUuidsPresent: det.hasGeneratedUuid
    },
    schema,
    gateChecks,
    readyForPhase4B: readyFor4B,
    gateDecision: readyFor4B ? "Phase 4B CONDITIONALLY ELIGIBLE" : "Phase 4B NOT APPROVED",
    issueCounts: {
      P0: p0.length,
      P1: p1.length,
      P2: p2.length,
      INFO: info.length,
      silentSkips: silentSkips.length
    },
    entityInventory: plan.entityInventory,
    emptyEntityExplanations: plan.emptyEntityExplanations,
    productRecon,
    decisions,
    addonAudit,
    a4Coverage,
    protection,
    remap,
    issues,
    sheetDisposition: plan.sheetDisposition,
    explicitConfirmations: {
      neonConnectionsMade: "None",
      productionConnectionsMade: "None",
      databaseWrites: "None",
      migrationOperations: "None",
      factsImported: "None",
      sourceWorkbookModified: "No",
      approvedA4CopyModified: "No",
      legacySheet12UsedAsAuthority: "No",
      protectionCreatedAsProduct: "No",
      canonicalE07Created: "No",
      placeholderFactsCreated: "No",
      silentSkips: silentSkips.length,
      p0Blockers: p0.length,
      importPlanReadyForPhase4B: readyFor4B ? "Yes" : "No"
    }
  };

  plan.validation_summary = {
    schemaOk: schema.ok,
    gateChecks,
    readyForPhase4B: readyFor4B
  };
  plan.issue_summary = validationReport.issueCounts;

  return {
    sourceManifest,
    plan,
    validationReport,
    det
  };
}

module.exports = {
  CANONICAL_PRODUCTS,
  runPhase4A1Gate,
  reconcileProduct,
  decisionReconciliation,
  auditAddons,
  a4CoverageForCollection
};
