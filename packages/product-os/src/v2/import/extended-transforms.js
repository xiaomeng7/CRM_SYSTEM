/**
 * Extended sheet → ImportPlan entity transforms (Phase 4A.1).
 * Pure. Remaps product codes via DEC-013. Redacts internal unit costs from plan surface.
 * Does not invent Product Owner facts.
 */

const {
  mapWorkbookProductCode,
  normalizeProductCode,
  toCanonicalProductCode,
  resolveLegacyAlias
} = require("../legacy-crosswalk");
const { isValidStableCode, normalizeStableCode } = require("../stable-ids");
const { pick, asString } = require("./workbook-reader");
const { remapParentEligibility, remapProductCodeTokensInText } = require("./reference-remap");

function slugPart(text) {
  return String(text || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

function resolveProductCode(legacyCode, name = "") {
  const mapped = mapWorkbookProductCode(legacyCode, name);
  if (mapped.action === "ALIAS_TO_BENEFIT") {
    return { skip: true, reason: "INCLUDED_BENEFIT", legacyCode: normalizeProductCode(legacyCode) };
  }
  const productCode =
    mapped.action === "REMAP_PRODUCT"
      ? mapped.canonicalProductCode
      : mapped.canonicalProductCode || normalizeProductCode(legacyCode);
  return { skip: false, productCode, legacyCode: normalizeProductCode(legacyCode), mapped };
}

function sourceRef(sheet, rowIndex1Based, identity) {
  return {
    sheet,
    row: rowIndex1Based,
    identity: identity || null,
    system: "V2_07_WORKBOOK"
  };
}

function transformSettingsRows(rows) {
  return rows.map((row, i) => ({
    action: "UPSERT_COSTING_SETTING",
    parameter: asString(pick(row, ["parameter"])),
    value: pick(row, ["value"]),
    unit: asString(pick(row, ["unit"])),
    notes: asString(pick(row, ["notes"])),
    customerVisible: false,
    source: sourceRef("01_Settings", i + 2, asString(pick(row, ["parameter"])))
  }));
}

function transformLabourLibraryRows(rows) {
  return rows.map((row, i) => {
    const name = asString(pick(row, ["labour_item"]));
    return {
      action: "UPSERT_LABOUR_LIBRARY_ITEM",
      labourCode: `lab.${slugPart(name)}`,
      name,
      hours: pick(row, ["hours"]),
      category: asString(pick(row, ["category"])),
      notes: asString(pick(row, ["notes"])),
      customerVisible: false,
      source: sourceRef("02_Labour_Library", i + 2, name)
    };
  });
}

function transformSkuMasterRows(rows) {
  return rows.map((row, i) => {
    const sku = asString(pick(row, ["sku"]));
    return {
      action: "UPSERT_EQUIPMENT_SKU",
      skuCode: sku,
      canonicalName: asString(pick(row, ["product"])),
      capabilityCategory: asString(pick(row, ["capability_category"])),
      supplier: asString(pick(row, ["supplier"])),
      statusLabel: asString(pick(row, ["status"])),
      notes: asString(pick(row, ["notes"])),
      // Unit cost intentionally omitted from ImportPlan surface (internal)
      unitCostExGst: "REDACTED_INTERNAL",
      customerVisible: false,
      source: sourceRef("03_SKU_Master", i + 2, sku)
    };
  });
}

function transformExperienceRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const title = asString(pick(row, ["experience_title"]));
    // In the legacy workbook E-05 was Protection. DEC-008/DEC-013 make it an
    // included benefit, while canonical E-05 is CCTV. Never attach the old
    // Protection experience to the purchasable CCTV pack.
    if (legacy === "E-05") {
      skipped.push({
        sheet: "05_Product_Experiences",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${title}`,
        reasonCode: "LEGACY_PROTECTION_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Represented by benefit.protection_bonus and its unlock relationship"
      });
      continue;
    }
    if (resolved.skip) {
      skipped.push({
        sheet: "05_Product_Experiences",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${title}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Experience not attached to Protection product"
      });
      continue;
    }
    const seq = pick(row, ["sequence"]);
    const experienceCode = `exp.${slugPart(resolved.productCode)}.${slugPart(title) || `seq_${seq}`}`;
    out.push({
      action: "UPSERT_EXPERIENCE",
      experienceCode,
      productCode: resolved.productCode,
      legacyProductCode: resolved.legacyCode,
      sequence: seq,
      title,
      description: asString(pick(row, ["customer_facing_description", "description"])),
      statusLabel: asString(pick(row, ["status"])),
      presentationOnly: false,
      source: sourceRef("05_Product_Experiences", i + 2, experienceCode)
    });
  }
  return { experiences: out, skipped };
}

function transformCapabilityRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const capabilityName = asString(pick(row, ["capability"]));
    if (resolved.skip) {
      skipped.push({
        sheet: "06_Product_Capabilities",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${capabilityName}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Capability not on Protection product"
      });
      continue;
    }
    let displayName = capabilityName;
    let deltaApplied = null;
    if (resolved.productCode === "C-03" && /warm kickboard/i.test(capabilityName || "")) {
      displayName = "Warm Kickboard Ambient Zone";
      deltaApplied = "DELTA-C03-KICK";
    }
    const capabilityCode = `cap.${slugPart(resolved.productCode)}.${slugPart(displayName)}`;
    const notesRaw = asString(pick(row, ["notes"]));
    let notes = notesRaw;
    let contentQualifier = null;
    if (resolved.productCode === "C-05" && /6-circuit|circuit/i.test(capabilityName || "")) {
      contentQualifier =
        "Up to six compatible circuits (lighting / exhaust fan / heat lamp / compatible heating); not lighting-only";
      deltaApplied = deltaApplied || "DELTA-C05-CIRCUIT";
    }
    out.push({
      action: "UPSERT_CAPABILITY_INCLUSION",
      capabilityCode,
      productCode: resolved.productCode,
      legacyProductCode: resolved.legacyCode,
      capabilityName: displayName,
      includedQty: pick(row, ["included_qty"]),
      customerLayer: asString(pick(row, ["customer_layer"])),
      notes,
      contentQualifier,
      deltaApplied,
      source: sourceRef("06_Product_Capabilities", i + 2, capabilityCode)
    });
  }
  return { capabilities: out, skipped };
}

function transformBomRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const sku = asString(pick(row, ["sku"]));
    if (resolved.skip) {
      skipped.push({
        sheet: "07_Product_BOM",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${sku}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "BOM not on Protection product"
      });
      continue;
    }
    const qty = pick(row, ["qty"]);
    out.push({
      action: "UPSERT_BOM_ITEM",
      bomItemCode: `bom.${slugPart(resolved.productCode)}.${slugPart(sku)}`,
      productCode: resolved.productCode,
      legacyProductCode: resolved.legacyCode,
      skuCode: sku,
      qty,
      inclusionMode: asString(pick(row, ["included___add_on", "included_add_on"])),
      notes: asString(pick(row, ["notes"])),
      unitCostExGst: "REDACTED_INTERNAL",
      lineCost: "REDACTED_INTERNAL",
      source: sourceRef("07_Product_BOM", i + 2, `${resolved.productCode}:${sku}`)
    });
  }
  return { bomItems: out, skipped };
}

function transformLabourApplicationRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const labourItem = asString(pick(row, ["labour_item"]));
    if (resolved.skip) {
      skipped.push({
        sheet: "08_Product_Labour",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${labourItem}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Labour not on Protection product"
      });
      continue;
    }
    out.push({
      action: "UPSERT_PRODUCT_LABOUR",
      labourApplicationCode: `lab.app.${slugPart(resolved.productCode)}.${slugPart(labourItem)}`,
      productCode: resolved.productCode,
      labourItem,
      qty: pick(row, ["qty"]),
      hoursEach: pick(row, ["hours_each"]),
      totalHours: pick(row, ["total_hours"]),
      labourCost: "REDACTED_INTERNAL",
      notes: asString(pick(row, ["notes"])),
      customerVisible: false,
      source: sourceRef("08_Product_Labour", i + 2, labourItem)
    });
  }
  return { labourApplications: out, skipped };
}

function transformRuleRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const ruleKey = asString(pick(row, ["rule_key"]));
    if (resolved.skip) {
      skipped.push({
        sheet: "09_Product_Rules",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${ruleKey}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Rule not on Protection product"
      });
      continue;
    }
    const remappedValue = remapProductCodeTokensInText(asString(pick(row, ["rule_value"])));
    const remappedNotes = remapProductCodeTokensInText(asString(pick(row, ["notes"])));
    out.push({
      action: "UPSERT_RULE",
      ruleCode: `rule.${slugPart(resolved.productCode)}.${slugPart(ruleKey)}`,
      productCode: resolved.productCode,
      ruleKey,
      ruleValue: remappedValue.text,
      notes: remappedNotes.text,
      replacements: [...remappedValue.replacements, ...remappedNotes.replacements],
      source: sourceRef("09_Product_Rules", i + 2, ruleKey)
    });
  }
  return { rules: out, skipped };
}

function transformAutomationRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    const name = asString(pick(row, ["automation_name"]));
    if (resolved.skip) {
      skipped.push({
        sheet: "19_Automation_Library",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${name}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Automation not on Protection product"
      });
      continue;
    }
    out.push({
      action: "UPSERT_AUTOMATION",
      automationCode: `auto.${slugPart(resolved.productCode)}.${slugPart(name)}`,
      productCode: resolved.productCode,
      name,
      trigger: asString(pick(row, ["trigger"])),
      condition: asString(pick(row, ["condition"])),
      actionText: asString(pick(row, ["action"])),
      statusLabel: asString(pick(row, ["status"])),
      notes: asString(pick(row, ["notes"])),
      source: sourceRef("19_Automation_Library", i + 2, name)
    });
  }
  return { automations: out, skipped };
}

function transformContentRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const contentType = asString(pick(row, ["content_type"]));
    const contentKind = ({
      hero: "HERO",
      subtitle: "SUBTITLE",
      story: "STORY_BODY",
      footer: "FOOTER"
    })[(contentType || "").toLowerCase()] || null;
    const contentKey = asString(pick(row, ["content_key"]));
    const alias = resolveLegacyAlias(legacy);
    if (alias && alias.resolutionKind === "INCLUDED_BENEFIT") {
      skipped.push({
        sheet: "14_Content_Library",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${contentType}:${contentKey}`,
        reasonCode: "PROTECTION_CONTENT_NOT_PRODUCT_PAGE",
        downstreamImpact: "No independent Protection A4/product page content"
      });
      continue;
    }
    const resolved = resolveProductCode(legacy);
    if (resolved.skip) {
      skipped.push({
        sheet: "14_Content_Library",
        sourceRow: i + 2,
        stableSourceReference: `${legacy}:${contentType}`,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Skipped"
      });
      continue;
    }
    const contentCode = `cnt.${slugPart(resolved.productCode)}.${slugPart(contentType)}.${slugPart(contentKey) || "default"}`;
    out.push({
      action: "UPSERT_CONTENT_ENTRY",
      contentCode,
      productCode: resolved.productCode,
      legacyProductCode: resolved.legacyCode,
      contentType,
      contentKind,
      contentKey,
      sequence: pick(row, ["sequence"]),
      title: asString(pick(row, ["title"])),
      body: asString(pick(row, ["body"])),
      statusLabel: asString(pick(row, ["status"])),
      languageLayer: "CUSTOMER",
      locale: "en-AU",
      publishEligible: false, // DEC-012 A4 verbatim not fully present — gated
      source: sourceRef("14_Content_Library", i + 2, contentCode)
    });
  }
  return { contentEntries: out, skipped };
}

function transformThemeRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    if (resolved.skip) {
      skipped.push({
        sheet: "17_Theme_Library",
        sourceRow: i + 2,
        stableSourceReference: legacy,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "No Protection theme product page"
      });
      continue;
    }
    out.push({
      action: "UPSERT_THEME",
      themeCode: `theme.${slugPart(resolved.productCode)}`,
      productCode: resolved.productCode,
      accentColour: asString(pick(row, ["accent_colour"])),
      backgroundColour: asString(pick(row, ["background_colour"])),
      textColour: asString(pick(row, ["text_colour"])),
      themeName: asString(pick(row, ["theme_name"])),
      statusLabel: asString(pick(row, ["status"])),
      a4ChannelOverride: {
        enabled: true,
        decision: "DEC-006",
        note: "A4 uses channel green; does not overwrite product accent"
      },
      source: sourceRef("17_Theme_Library", i + 2, resolved.productCode)
    });
  }
  return { themes: out, skipped };
}

function transformImageRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const alias = resolveLegacyAlias(legacy);
    if (alias && alias.resolutionKind === "INCLUDED_BENEFIT") {
      skipped.push({
        sheet: "16_Image_Library",
        sourceRow: i + 2,
        stableSourceReference: legacy,
        reasonCode: "PROTECTION_NO_PRODUCT_ASSET",
        downstreamImpact: "No Protection hero asset"
      });
      continue;
    }
    const resolved = resolveProductCode(legacy);
    if (resolved.skip) continue;
    const filePath = asString(pick(row, ["file_path"]));
    const isPlaceholder = /\/assets\/products\/.*\/hero\.jpg$/i.test(filePath || "");
    out.push({
      action: "UPSERT_ASSET",
      assetCode: `asset.${slugPart(resolved.productCode)}.hero`,
      productCode: resolved.productCode,
      imageType: asString(pick(row, ["image_type"])),
      filePath,
      altText: asString(pick(row, ["alt_text"])),
      statusLabel: asString(pick(row, ["status"])),
      publishStatus: isPlaceholder ? "NOT_APPROVED_FOR_PUBLISH" : "NEEDS_REVIEW",
      placeholder: isPlaceholder,
      decision: "DEC-007",
      source: sourceRef("16_Image_Library", i + 2, filePath)
    });
  }
  return { assets: out, skipped };
}

function transformIconRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    if (resolved.skip) {
      skipped.push({
        sheet: "15_Icon_Library",
        sourceRow: i + 2,
        stableSourceReference: legacy,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "Icon skipped for Protection"
      });
      continue;
    }
    const key = asString(pick(row, ["content_key"]));
    out.push({
      action: "UPSERT_ICON_REF",
      iconCode: `asset.icon.${slugPart(resolved.productCode)}.${slugPart(key)}`,
      productCode: resolved.productCode,
      contentKey: key,
      lucideIconName: asString(pick(row, ["lucide_icon_name"])),
      iconPurpose: asString(pick(row, ["icon_purpose"])),
      statusLabel: asString(pick(row, ["status"])),
      requiredForA4: false,
      source: sourceRef("15_Icon_Library", i + 2, key)
    });
  }
  return { icons: out, skipped };
}

function transformLayoutRows(rows) {
  const out = [];
  const skipped = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const legacy = normalizeProductCode(pick(row, ["product_id"]));
    const resolved = resolveProductCode(legacy);
    if (resolved.skip) {
      skipped.push({
        sheet: "18_Layout_Config",
        sourceRow: i + 2,
        stableSourceReference: legacy,
        reasonCode: "HOST_IS_INCLUDED_BENEFIT",
        downstreamImpact: "No Protection layout"
      });
      continue;
    }
    out.push({
      action: "UPSERT_LAYOUT_POLICY",
      layoutCode: `map.layout.${slugPart(resolved.productCode)}`,
      productCode: resolved.productCode,
      template: asString(pick(row, ["template"])),
      frontMomentsCount: pick(row, ["front_moments_count"]),
      backExperiencesCount: pick(row, ["back_experiences_count"]),
      showPrice: pick(row, ["show_price"]),
      showIncluded: pick(row, ["show_included"]),
      showCompatibleExperiencePacks: pick(row, ["show_compatible_experience_packs"]),
      authority: "SUBORDINATE_TO_A4_PRESENTATION_MAP",
      decision: "DEC-009/ISSUE-018",
      source: sourceRef("18_Layout_Config", i + 2, resolved.productCode)
    });
  }
  return { layouts: out, skipped };
}

/** DEC-001 door contact overlay (not present in workbook C-01). */
function plannedDoorContactDelta() {
  return {
    action: "APPLY_DELTA",
    ref: "DELTA-C01-DOOR",
    decision: "DEC-001",
    productCode: "C-01",
    plannedObjects: [
      {
        type: "CAPABILITY",
        capabilityCode: "cap.c_01.wireless_zigbee_door_contact",
        capabilityName: "Wireless Zigbee Door Contact",
        includedQty: 1
      },
      {
        type: "BOM_ITEM",
        skuCode: "MAG-001",
        qty: 1,
        notes: "Main entry door-state awareness (DEC-001)"
      },
      {
        type: "EXPERIENCE_LINK",
        experienceTitle: "Door Awareness",
        requiresCapability: "cap.c_01.wireless_zigbee_door_contact"
      },
      {
        type: "INSTALLATION_ASSUMPTION",
        assumptionCode: "asm.c_01.door_contact_mount_zigbee",
        text: "Suitable mounting location and Zigbee connectivity for main entry door contact"
      }
    ]
  };
}

function plannedReturnRoutineDelta() {
  return {
    action: "APPLY_DELTA",
    ref: "DELTA-C06-RETURN",
    decision: "DEC-004",
    productCode: "C-06",
    plannedObjects: [
      {
        type: "AUTOMATION",
        automationCode: "auto.c06.return_routine",
        name: "Return Routine",
        boundaries: [
          "Restore purchased Collections only",
          "No new rooms",
          "No unpurchased capabilities",
          "No automatic garage open"
        ]
      }
    ]
  };
}

function plannedProtectionBenefit() {
  return {
    action: "UPSERT_INCLUDED_BENEFIT",
    ref: "DELTA-PROTECTION-BENEFIT",
    decision: "DEC-013",
    benefitCode: "benefit.protection_bonus",
    hostProductCode: "E-05",
    unlockLogic: "AND",
    unlockRequiredCodes: ["C-01", "C-06", "E-05"],
    purchasable: false,
    selectable: false,
    hasProductPage: false,
    hasIndependentA4: false,
    hasPrice: false,
    addToMyHomeButton: false,
    quoteDisplay: "INCLUDED_BONUS_NO_DUPLICATE_AMOUNT",
    configuratorDisplay: "UNLOCKED_BENEFIT_WHEN_PREREQS_MET",
    cctvPageNoteAllowed: true,
    forbidden: ["siren_product", "independent_security_package", "new_room_control"]
  };
}

function capabilityTypeHints(text) {
  const t = String(text || "").toLowerCase();
  const hints = [];
  if (/switch|circuit light/.test(t)) hints.push("switch", "circuit");
  if (/dimm/.test(t)) hints.push("dimm");
  if (/warm|kickboard|ambient|strip/.test(t)) hints.push("warm", "kickboard", "ambient", "strip");
  if (/curtain|track|motor/.test(t)) hints.push("curtain", "track", "motor");
  if (/occupancy|presence|pir|sensor/.test(t)) hints.push("occupancy", "sensor", "pir");
  if (/lock/.test(t)) hints.push("lock");
  if (/doorbell/.test(t)) hints.push("doorbell");
  if (/garage/.test(t)) hints.push("garage");
  if (/contact|door|window|mag/.test(t)) hints.push("contact", "door", "window");
  if (/camera|cctv|nvr/.test(t)) hints.push("camera", "cctv", "nvr");
  if (/toilet/.test(t)) hints.push("toilet");
  if (/plug|outlet|appliance/.test(t)) hints.push("outlet", "plug", "appliance");
  if (/display|screen/.test(t)) hints.push("display", "screen");
  if (/remote/.test(t)) hints.push("remote");
  if (/climate|ac |split/.test(t)) hints.push("climate", "ac", "split");
  if (/storage|hdd|surveillance|nvr|tb\b/.test(t)) hints.push("storage", "surveillance", "nvr");
  if (/irrigation|garden|relay|zone configuration/.test(t)) {
    hints.push("irrigation", "garden", "relay", "zone");
  }
  return hints;
}

function enrichAddonPlan(addonPlan, capabilityByProduct, bomSkuByProduct) {
  const parents = addonPlan.parentProductCodes || [];
  const defaultBasis = addonPlan.defaultSkuOrCapability;
  const basisSkus = String(defaultBasis || "")
    .split(/[+/,|]/)
    .map((s) => s.trim())
    .filter(Boolean);

  let basisOk = false;
  const evidence = [];
  const hints = capabilityTypeHints(
    `${addonPlan.canonicalName || ""} ${addonPlan.standardScopeUnit || ""} ${defaultBasis || ""}`
  );

  for (const parent of parents) {
    const skus = bomSkuByProduct.get(parent) || new Set();
    const caps = [...(capabilityByProduct.get(parent) || new Set())].map((c) => String(c).toLowerCase());
    for (const b of basisSkus) {
      const hitSku = [...skus].some((s) => s.toUpperCase() === b.toUpperCase());
      const hitCap = caps.some((c) => c.includes(slugPart(b)) || c.includes(b.toLowerCase()));
      if (hitSku || hitCap) {
        basisOk = true;
        evidence.push({ parent, basis: b, hitSku, hitCap });
      }
    }
    if (!basisOk && hints.length) {
      const matchedCapabilityCode = [...(capabilityByProduct.get(parent) || new Set())]
        .find((code) => hints.some((h) => String(code).toLowerCase().includes(h)));
      if (matchedCapabilityCode) {
        basisOk = true;
        evidence.push({
          parent,
          basis: "capability_type_hint",
          hints,
          hitCap: true,
          matchedCapabilityCode
        });
      }
    }
    if (!basisOk && basisSkus.length === 0) {
      evidence.push({ parent, basis: null, note: "NO_DEFAULT_SKU_CAPABILITY" });
    }
  }

  const createsNewRoom = /create[s]?\s+(another|a\s+new)\s+room/i.test(
    `${addonPlan.installationAssumptions || ""} ${addonPlan.experiencePromise || ""}`
  );
  const declaresNoNewRoom = /does not create (another|a new) room/i.test(
    addonPlan.installationAssumptions || ""
  );

  return {
    ...addonPlan,
    createsNewRoom: false,
    createsNewExperience: false,
    createsNewRoomViolation: createsNewRoom && !declaresNoNewRoom,
    declaresNoNewRoom,
    capabilityBomBasisStatus: basisOk ? "PROVEN" : basisSkus.length ? "UNPROVEN" : "MISSING_BASIS",
    capabilityBomEvidence: evidence,
    eligibilityStatus:
      parents.length === 0
        ? "ORPHAN"
        : basisOk
          ? "ELIGIBLE"
          : "BLOCKED_UNPROVEN_BASIS"
  };
}

module.exports = {
  slugPart,
  resolveProductCode,
  sourceRef,
  transformSettingsRows,
  transformLabourLibraryRows,
  transformSkuMasterRows,
  transformExperienceRows,
  transformCapabilityRows,
  transformBomRows,
  transformLabourApplicationRows,
  transformRuleRows,
  transformAutomationRows,
  transformContentRows,
  transformThemeRows,
  transformImageRows,
  transformIconRows,
  transformLayoutRows,
  plannedDoorContactDelta,
  plannedReturnRoutineDelta,
  plannedProtectionBenefit,
  enrichAddonPlan,
  remapParentEligibility,
  toCanonicalProductCode,
  isValidStableCode,
  normalizeStableCode
};
