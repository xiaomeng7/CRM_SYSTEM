/**
 * Product OS V2 structural validators (Phase 3A).
 * Pure functions — no database connection.
 * Returns machine-readable result objects.
 */

const {
  isValidStableCode,
  normalizeStableCode,
  normalizeProductCode,
  assertNoExcelRowIdentity
} = require("./stable-ids");

const VALID_KINDS = new Set([
  "FOUNDATION",
  "COLLECTION",
  "EXPERIENCE",
  "ADDON",
  "STANDALONE"
]);

const VALID_ROLES = new Set(["STANDARD", "PACK", "BONUS"]);

/** Approved kind × role combinations (DEC-008 / DEC-013). BONUS is not a product role. */
const ALLOWED_KIND_ROLE = new Set([
  "FOUNDATION:STANDARD",
  "COLLECTION:STANDARD",
  "EXPERIENCE:STANDARD",
  "EXPERIENCE:PACK",
  "ADDON:STANDARD",
  "STANDALONE:STANDARD"
]);

function result({
  ruleCode,
  severity,
  entityType,
  entityId = null,
  message,
  passed,
  provenance = null,
  payload = null
}) {
  return {
    ruleCode,
    severity,
    entityType,
    entityId,
    message,
    passed,
    provenance,
    payload
  };
}

function validateStableId(kind, code, entityType = kind, entityId = null) {
  const okFormat = isValidStableCode(kind, code);
  const okNotRow = assertNoExcelRowIdentity(code);
  const passed = Boolean(okFormat && okNotRow);
  return result({
    ruleCode: "V2_STABLE_ID_FORMAT",
    severity: passed ? "INFO" : "P0",
    entityType,
    entityId: entityId || code,
    message: passed
      ? `Stable code OK for ${kind}`
      : `Invalid or row-derived stable code for ${kind}: ${JSON.stringify(code)}`,
    passed,
    payload: { kind, code, okFormat, okNotRow }
  });
}

function validateProductKindRole(product) {
  const kind = product?.productKind;
  const role = product?.commercialRole;
  const pair = `${kind}:${role}`;
  const passed =
    VALID_KINDS.has(kind) &&
    VALID_ROLES.has(role) &&
    ALLOWED_KIND_ROLE.has(pair);
  return result({
    ruleCode: "V2_KIND_ROLE_COMBO",
    severity: passed ? "INFO" : "P0",
    entityType: "product",
    entityId: product?.productCode || product?.id || null,
    message: passed
      ? `Valid kind/role ${pair}`
      : `Disallowed product_kind/commercial_role combination: ${pair}`,
    passed,
    payload: { kind, role }
  });
}

function validateNoSelfRelationship(rel) {
  const fromId = rel?.fromProductId;
  const toId = rel?.toProductId;
  const passed = !toId || fromId !== toId;
  return result({
    ruleCode: "V2_REL_NO_SELF",
    severity: passed ? "INFO" : "P0",
    entityType: "product_relationship",
    entityId: rel?.relationshipCode || rel?.id || null,
    message: passed ? "Relationship is not self-referential" : "Self-relationship forbidden",
    passed
  });
}

function validateDuplicateActiveRelationships(relationships = []) {
  const seen = new Map();
  const findings = [];
  for (const rel of relationships) {
    if (rel.status && rel.status !== "ACTIVE") continue;
    const key = [
      rel.fromProductId,
      rel.toProductId ?? "__CTA__",
      rel.relationshipType
    ].join("|");
    if (seen.has(key)) {
      findings.push(
        result({
          ruleCode: "V2_REL_NO_DUP_ACTIVE",
          severity: "P1",
          entityType: "product_relationship",
          entityId: rel.relationshipCode || rel.id,
          message: "Duplicate active relationship for same from/to/type",
          passed: false,
          payload: { key, prior: seen.get(key) }
        })
      );
    } else {
      seen.set(key, rel.relationshipCode || rel.id);
    }
  }
  if (findings.length === 0) {
    findings.push(
      result({
        ruleCode: "V2_REL_NO_DUP_ACTIVE",
        severity: "INFO",
        entityType: "product_relationship",
        entityId: null,
        message: "No duplicate active relationships",
        passed: true
      })
    );
  }
  return findings;
}

/**
 * Protection-style AND prerequisite group:
 * required product codes must all be present in a single AND group on a BONUS_UNLOCK relationship.
 */
function validateBonusUnlockAndGroup({
  relationship,
  requirementGroups = [],
  requiredProductCodes = []
}) {
  const isBonusUnlock = relationship?.relationshipType === "BONUS_UNLOCK";
  if (!isBonusUnlock) {
    return result({
      ruleCode: "V2_BONUS_UNLOCK_AND_GROUP",
      severity: "INFO",
      entityType: "product_relationship",
      entityId: relationship?.relationshipCode || null,
      message: "Skipped — not BONUS_UNLOCK",
      passed: true
    });
  }

  const andGroups = requirementGroups.filter((g) => g.logic === "AND");
  if (andGroups.length === 0) {
    return result({
      ruleCode: "V2_BONUS_UNLOCK_AND_GROUP",
      severity: "P0",
      entityType: "product_relationship",
      entityId: relationship?.relationshipCode || null,
      message: "BONUS_UNLOCK requires at least one AND requirement group",
      passed: false
    });
  }

  const codes = new Set(
    andGroups
      .flatMap((g) => g.requirements || [])
      .map((r) => normalizeProductCode(r.requiredProductCode || r.productCode))
      .filter(Boolean)
  );
  const missing = requiredProductCodes
    .map(normalizeProductCode)
    .filter((c) => !codes.has(c));
  const passed = missing.length === 0;
  return result({
    ruleCode: "V2_BONUS_UNLOCK_AND_GROUP",
    severity: passed ? "INFO" : "P0",
    entityType: "product_relationship",
    entityId: relationship?.relationshipCode || null,
    message: passed
      ? "BONUS_UNLOCK AND prerequisites present"
      : `BONUS_UNLOCK missing required products: ${missing.join(", ")}`,
    passed,
    payload: { expected: requiredProductCodes, found: [...codes] }
  });
}

/**
 * Add-on may only extend a capability already on the parent.
 * @param {object} input
 * @param {object} input.addonProfile
 * @param {string} input.parentProductId
 * @param {Array<{productId:string,capabilityId:string}>} input.parentCapabilities
 */
function validateAddonParentCapability({ addonProfile, parentProductId, parentCapabilities = [] }) {
  const extendsId = addonProfile?.extendsCapabilityId;
  const present = parentCapabilities.some(
    (c) => c.productId === parentProductId && c.capabilityId === extendsId
  );
  return result({
    ruleCode: "V2_ADDON_PARENT_HAS_CAPABILITY",
    severity: present ? "INFO" : "P0",
    entityType: "addon_profile",
    entityId: addonProfile?.productId || null,
    message: present
      ? "Parent includes capability extended by Add-on"
      : "Add-on extends a capability not present on the selected parent",
    passed: present,
    payload: { parentProductId, extendsCapabilityId: extendsId }
  });
}

function validateAddonDoesNotCreateRoomOrExperience(addonProfile) {
  const ok =
    addonProfile?.createsNewRoom === false &&
    addonProfile?.createsNewExperience === false;
  return result({
    ruleCode: "V2_ADDON_NO_NEW_ROOM_OR_EXPERIENCE",
    severity: ok ? "INFO" : "P0",
    entityType: "addon_profile",
    entityId: addonProfile?.productId || null,
    message: ok
      ? "Add-on does not create room or Experience"
      : "Add-on must not create a new room or canonical Experience",
    passed: ok
  });
}

function validateContentReferencesProduct({ placement, knownProductIds = [] }) {
  const ok = knownProductIds.includes(placement?.productId);
  return result({
    ruleCode: "V2_CONTENT_PRODUCT_REF",
    severity: ok ? "INFO" : "P0",
    entityType: "content_placement",
    entityId: placement?.id || null,
    message: ok
      ? "Content placement references known product"
      : "Content placement references unknown product",
    passed: ok
  });
}

function validatePublishedPageAssets({ imageLinks = [], assetsById = {} }) {
  const findings = [];
  for (const link of imageLinks) {
    const asset = assetsById[link.assetId];
    const publishable = asset && asset.publishStatus === "APPROVED";
    findings.push(
      result({
        ruleCode: "V2_ASSET_PUBLISH_BLOCK",
        severity: publishable ? "INFO" : "P0",
        entityType: "product_image_link",
        entityId: link.id || link.assetId,
        message: publishable
          ? "Linked asset approved for publish"
          : `Customer-facing link blocked: asset publishStatus=${asset?.publishStatus || "MISSING"}`,
        passed: Boolean(publishable),
        payload: {
          assetCode: asset?.assetCode,
          publishStatus: asset?.publishStatus
        }
      })
    );
  }
  if (findings.length === 0) {
    findings.push(
      result({
        ruleCode: "V2_ASSET_PUBLISH_BLOCK",
        severity: "INFO",
        entityType: "product_image_link",
        entityId: null,
        message: "No image links to validate",
        passed: true
      })
    );
  }
  return findings;
}

function validatePriceAmountDisplayMode(price) {
  const mode = price?.displayMode;
  const amount = price?.amount;
  let passed = true;
  let message = "Price display mode consistent with amount";
  if (mode === "CONTACT" && amount != null) {
    passed = false;
    message = "CONTACT display mode must not carry a numeric amount";
  } else if ((mode === "EXACT" || mode === "FROM") && (amount == null || Number(amount) < 0)) {
    passed = false;
    message = `${mode} display mode requires non-null non-negative amount`;
  }
  return result({
    ruleCode: "V2_PRICE_DISPLAY_AMOUNT",
    severity: passed ? "INFO" : "P0",
    entityType: "product_price",
    entityId: price?.priceCode || price?.id || null,
    message,
    passed,
    payload: { mode, amount }
  });
}

function validatePriceFulfilmentInstallConsistency(price) {
  const fulfilment = price?.fulfilmentMode;
  const installed = price?.installationIncluded;
  if (fulfilment === "SUPPLY_ONLY" && installed !== false) {
    return result({
      ruleCode: "V2_PRICE_FULFILMENT_INSTALL",
      severity: "P0",
      entityType: "product_price",
      entityId: price?.priceCode || price?.id || null,
      message: "SUPPLY_ONLY prices must set installationIncluded=false",
      passed: false,
      payload: { fulfilment, installationIncluded: installed }
    });
  }
  if (fulfilment === "INSTALLED" && installed !== true) {
    const reason =
      price?.exceptionMeta?.installationExceptionReason ||
      price?.commercialNotes;
    const passed = Boolean(reason && String(reason).trim());
    return result({
      ruleCode: "V2_PRICE_FULFILMENT_INSTALL",
      severity: passed ? "INFO" : "P1",
      entityType: "product_price",
      entityId: price?.priceCode || price?.id || null,
      message: passed
        ? "INSTALLED with installationIncluded=false allowed via explicit exception reason"
        : "INSTALLED prices should normally set installationIncluded=true (exception requires structured reason)",
      passed,
      payload: { fulfilment, installationIncluded: installed, reason: reason || null }
    });
  }
  return result({
    ruleCode: "V2_PRICE_FULFILMENT_INSTALL",
    severity: "INFO",
    entityType: "product_price",
    entityId: price?.priceCode || price?.id || null,
    message: "Fulfilment and installationIncluded consistent",
    passed: true,
    payload: { fulfilment, installationIncluded: installed }
  });
}

function toEpochBound(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return value.getTime();
  const t = Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

/** Half-open style: adjacent periods (a.to === b.from) do not overlap. */
function pricePeriodsOverlap(a, b) {
  const aFrom = toEpochBound(a.effectiveFrom) ?? Number.NEGATIVE_INFINITY;
  const aTo = toEpochBound(a.effectiveTo) ?? Number.POSITIVE_INFINITY;
  const bFrom = toEpochBound(b.effectiveFrom) ?? Number.NEGATIVE_INFINITY;
  const bTo = toEpochBound(b.effectiveTo) ?? Number.POSITIVE_INFINITY;
  return aFrom < bTo && bFrom < aTo;
}

function validatePriceEffectiveOrder(price) {
  const from = toEpochBound(price?.effectiveFrom);
  const to = toEpochBound(price?.effectiveTo);
  let passed = true;
  let message = "Price effective period order OK";
  if (from != null && to != null && !(to > from)) {
    passed = false;
    message = "effective_to must be greater than effective_from when both are set";
  }
  return result({
    ruleCode: "V2_PRICE_EFFECTIVE_ORDER",
    severity: passed ? "INFO" : "P0",
    entityType: "product_price",
    entityId: price?.priceCode || price?.id || null,
    message,
    passed,
    payload: { effectiveFrom: price?.effectiveFrom, effectiveTo: price?.effectiveTo }
  });
}

function commercialKey(price) {
  return [
    price.priceBookId,
    price.productId,
    price.currencyCode,
    price.fulfilmentMode,
    price.taxBasis,
    price.customerVisible === false ? "hidden" : "visible"
  ].join("|");
}

function validateActivePriceNoOverlap(prices = []) {
  const active = prices.filter((p) => p.status === "ACTIVE");
  const byKey = new Map();
  for (const p of active) {
    const key = commercialKey(p);
    const list = byKey.get(key) || [];
    list.push(p);
    byKey.set(key, list);
  }
  const findings = [];
  for (const [key, list] of byKey) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (pricePeriodsOverlap(list[i], list[j])) {
          findings.push(
            result({
              ruleCode: "V2_PRICE_NO_OVERLAP_ACTIVE",
              severity: "P0",
              entityType: "product_price",
              entityId: list[i].priceCode || list[i].id,
              message: "ACTIVE price effective periods overlap for the same commercial key",
              passed: false,
              payload: {
                key,
                a: list[i].priceCode || list[i].id,
                b: list[j].priceCode || list[j].id
              }
            })
          );
        }
      }
    }
  }
  if (findings.length === 0) {
    findings.push(
      result({
        ruleCode: "V2_PRICE_NO_OVERLAP_ACTIVE",
        severity: "INFO",
        entityType: "product_price",
        entityId: null,
        message: "No ACTIVE price effective-period overlaps detected",
        passed: true
      })
    );
  }
  return findings;
}

function validatePriceCurrencyMatchesBook(price, priceBook) {
  const passed =
    priceBook &&
    price &&
    String(price.currencyCode) === String(priceBook.currencyCode);
  return result({
    ruleCode: "V2_PRICE_CURRENCY_MATCH_BOOK",
    severity: passed ? "INFO" : "P0",
    entityType: "product_price",
    entityId: price?.priceCode || price?.id || null,
    message: passed
      ? "Product price currency matches price book"
      : "Product price currency must match its price book (multi-currency not supported)",
    passed: Boolean(passed),
    payload: {
      priceCurrency: price?.currencyCode,
      bookCurrency: priceBook?.currencyCode
    }
  });
}

function validatePolymorphicReference({
  entityType,
  entityId,
  kindField,
  kindValue,
  refId,
  allowedKinds = [],
  knownIdsByKind = {}
}) {
  if (!kindValue && !refId) {
    return result({
      ruleCode: "V2_POLYMORPHIC_REF",
      severity: "INFO",
      entityType,
      entityId,
      message: "No polymorphic reference set",
      passed: true
    });
  }
  if (!allowedKinds.includes(kindValue)) {
    return result({
      ruleCode: "V2_POLYMORPHIC_REF",
      severity: "P0",
      entityType,
      entityId,
      message: `Invalid ${kindField}=${kindValue}`,
      passed: false,
      payload: { kindField, kindValue, allowedKinds }
    });
  }
  const known = knownIdsByKind[kindValue] || [];
  const passed = Boolean(refId && known.includes(refId));
  return result({
    ruleCode: "V2_POLYMORPHIC_REF",
    severity: passed ? "INFO" : "P0",
    entityType,
    entityId,
    message: passed
      ? "Polymorphic reference resolves"
      : `Polymorphic ${kindValue} id not found in known set`,
    passed,
    payload: { kindValue, refId }
  });
}

function validateActiveCtaNoDuplicates(relationships = []) {
  const seen = new Map();
  const findings = [];
  for (const rel of relationships) {
    if (rel.relationshipType !== "PRESENTATION_CTA") continue;
    if (rel.status && rel.status !== "ACTIVE") continue;
    if (rel.toProductId != null) continue;
    const key = `${rel.fromProductId}|PRESENTATION_CTA`;
    if (seen.has(key)) {
      findings.push(
        result({
          ruleCode: "V2_CTA_NO_DUP_ACTIVE",
          severity: "P1",
          entityType: "product_relationship",
          entityId: rel.relationshipCode || rel.id,
          message: "Duplicate ACTIVE presentation CTA for same from product",
          passed: false,
          payload: { key, prior: seen.get(key) }
        })
      );
    } else {
      seen.set(key, rel.relationshipCode || rel.id);
    }
  }
  if (findings.length === 0) {
    findings.push(
      result({
        ruleCode: "V2_CTA_NO_DUP_ACTIVE",
        severity: "INFO",
        entityType: "product_relationship",
        entityId: null,
        message: "No duplicate ACTIVE CTA rows",
        passed: true
      })
    );
  }
  return findings;
}

function validateReleaseReferences({ release, componentIds = [], knownApprovedIds = [] }) {
  const missing = componentIds.filter((id) => !knownApprovedIds.includes(id));
  const passed = missing.length === 0;
  return result({
    ruleCode: "V2_RELEASE_COMPONENT_REF",
    severity: passed ? "INFO" : "P0",
    entityType: "release",
    entityId: release?.releaseCode || release?.id || null,
    message: passed
      ? "Release components reference approved versions"
      : `Release references unknown/unapproved components: ${missing.join(", ")}`,
    passed,
    payload: { missing }
  });
}

function validateBomQtyPositive(bomItem) {
  const qty = Number(bomItem?.qty);
  const passed = Number.isFinite(qty) && qty > 0;
  return result({
    ruleCode: "V2_BOM_QTY_POSITIVE",
    severity: passed ? "INFO" : "P0",
    entityType: "bom_item",
    entityId: bomItem?.id || null,
    message: passed ? "BOM qty positive" : "BOM qty must be > 0",
    passed,
    payload: { qty: bomItem?.qty }
  });
}

function validatePresentationMappingHasExperience({ mapping, knownExperienceIds = [] }) {
  const ok = knownExperienceIds.includes(mapping?.experienceId);
  return result({
    ruleCode: "V2_PRESENTATION_HAS_EXPERIENCE",
    severity: ok ? "INFO" : "P0",
    entityType: "experience_presentation_mapping",
    entityId: mapping?.mappingCode || mapping?.id || null,
    message: ok
      ? "Presentation mapping linked to canonical experience"
      : "Orphan presentation mapping — missing canonical experience",
    passed: ok
  });
}

function validateLegacyNotCanonical({ sourceKind, treatedAsCanonical }) {
  const isLegacy = String(sourceKind || "").toUpperCase().includes("LEGACY") ||
    String(sourceKind || "") === "12_PRODUCT_CARD_CONTENT";
  const passed = !(isLegacy && treatedAsCanonical);
  return result({
    ruleCode: "V2_LEGACY_NOT_CANONICAL",
    severity: passed ? "INFO" : "P0",
    entityType: "source",
    entityId: sourceKind || null,
    message: passed
      ? "Legacy source not treated as canonical"
      : "Legacy source must not be treated as canonical authority",
    passed,
    payload: { sourceKind, treatedAsCanonical }
  });
}

function validateMasterMarketingNotContentAuthority({ fieldOwner }) {
  const passed = fieldOwner === "content_entries" || fieldOwner === "pos2_content_entries";
  return result({
    ruleCode: "V2_CONTENT_OWNERSHIP",
    severity: passed ? "INFO" : "P1",
    entityType: "content",
    entityId: null,
    message: passed
      ? "Customer hero/content owned by content library"
      : "Product Master marketing fields must not be content authority",
    passed,
    payload: { fieldOwner }
  });
}

function validateFeaturedAddonSort({ featuredRows = [] }) {
  const byKey = new Map();
  const findings = [];
  for (const row of featuredRows) {
    const key = `${row.parentProductId}|${row.channel}|${row.surface}`;
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }
  for (const [key, rows] of byKey) {
    const orders = rows.map((r) => r.sortOrder);
    const unique = new Set(orders);
    const ok = unique.size === orders.length;
    findings.push(
      result({
        ruleCode: "V2_FEATURED_ADDON_SORT",
        severity: ok ? "INFO" : "P1",
        entityType: "featured_addon",
        entityId: key,
        message: ok
          ? "Featured Add-on sort orders unique per parent/channel/surface"
          : "Duplicate featured Add-on sortOrder in channel/surface",
        passed: ok,
        payload: { orders }
      })
    );
  }
  if (findings.length === 0) {
    findings.push(
      result({
        ruleCode: "V2_FEATURED_ADDON_SORT",
        severity: "INFO",
        entityType: "featured_addon",
        entityId: null,
        message: "No featured Add-on rows",
        passed: true
      })
    );
  }
  return findings;
}

function validateReleaseTemplateSeparation({ footerConfig }) {
  const hasRelease = Boolean(footerConfig?.productOsReleaseCode);
  const hasTemplate =
    footerConfig?.documentTemplateVersionId != null ||
    footerConfig?.documentTemplateVersionLabel != null;
  const conflated =
    hasRelease &&
    footerConfig?.documentTemplateVersionLabel &&
    normalizeStableCode(footerConfig.productOsReleaseCode) ===
      normalizeStableCode(footerConfig.documentTemplateVersionLabel);
  const passed = hasRelease && !conflated;
  return result({
    ruleCode: "V2_RELEASE_TEMPLATE_SEPARATION",
    severity: passed ? "INFO" : "P1",
    entityType: "footer_config",
    entityId: footerConfig?.id || null,
    message: passed
      ? "Product OS release distinct from document template version"
      : "Product OS release and document template version must be stored separately",
    passed,
    payload: {
      productOsReleaseCode: footerConfig?.productOsReleaseCode,
      documentTemplateVersionLabel: footerConfig?.documentTemplateVersionLabel,
      hasTemplate
    }
  });
}

function runStructuralSuite(fixture) {
  const out = [];
  if (fixture.stableIds) {
    for (const row of fixture.stableIds) {
      out.push(validateStableId(row.kind, row.code, row.entityType, row.entityId));
    }
  }
  if (fixture.products) {
    for (const p of fixture.products) out.push(validateProductKindRole(p));
  }
  if (fixture.relationships) {
    for (const r of fixture.relationships) out.push(validateNoSelfRelationship(r));
    out.push(...validateDuplicateActiveRelationships(fixture.relationships));
    out.push(...validateActiveCtaNoDuplicates(fixture.relationships));
  }
  if (fixture.bonusUnlock) {
    out.push(validateBonusUnlockAndGroup(fixture.bonusUnlock));
  }
  if (fixture.addon) {
    out.push(validateAddonParentCapability(fixture.addon));
    out.push(validateAddonDoesNotCreateRoomOrExperience(fixture.addon.addonProfile));
  }
  if (fixture.contentPlacement) {
    out.push(
      validateContentReferencesProduct({
        placement: fixture.contentPlacement,
        knownProductIds: fixture.knownProductIds || []
      })
    );
  }
  if (fixture.imageLinks) {
    out.push(
      ...validatePublishedPageAssets({
        imageLinks: fixture.imageLinks,
        assetsById: fixture.assetsById || {}
      })
    );
  }
  if (fixture.prices) {
    for (const price of fixture.prices) {
      out.push(validatePriceAmountDisplayMode(price));
      out.push(validatePriceFulfilmentInstallConsistency(price));
      out.push(validatePriceEffectiveOrder(price));
      if (fixture.priceBooksById && price.priceBookId) {
        out.push(
          validatePriceCurrencyMatchesBook(price, fixture.priceBooksById[price.priceBookId])
        );
      }
    }
    out.push(...validateActivePriceNoOverlap(fixture.prices));
  }
  if (fixture.polymorphicRefs) {
    for (const ref of fixture.polymorphicRefs) {
      out.push(validatePolymorphicReference(ref));
    }
  }
  if (fixture.release) {
    out.push(validateReleaseReferences(fixture.release));
  }
  if (fixture.bomItems) {
    for (const item of fixture.bomItems) out.push(validateBomQtyPositive(item));
  }
  if (fixture.presentationMappings) {
    for (const mapping of fixture.presentationMappings) {
      out.push(
        validatePresentationMappingHasExperience({
          mapping,
          knownExperienceIds: fixture.knownExperienceIds || []
        })
      );
    }
  }
  if (fixture.legacyCheck) {
    out.push(validateLegacyNotCanonical(fixture.legacyCheck));
  }
  if (fixture.contentOwnership) {
    out.push(validateMasterMarketingNotContentAuthority(fixture.contentOwnership));
  }
  if (fixture.featuredAddons) {
    out.push(...validateFeaturedAddonSort({ featuredRows: fixture.featuredAddons }));
  }
  if (fixture.footerConfig) {
    out.push(validateReleaseTemplateSeparation({ footerConfig: fixture.footerConfig }));
  }
  return out;
}

module.exports = {
  ALLOWED_KIND_ROLE,
  result,
  validateStableId,
  validateProductKindRole,
  validateNoSelfRelationship,
  validateDuplicateActiveRelationships,
  validateBonusUnlockAndGroup,
  validateAddonParentCapability,
  validateAddonDoesNotCreateRoomOrExperience,
  validateContentReferencesProduct,
  validatePublishedPageAssets,
  validatePriceAmountDisplayMode,
  validatePriceFulfilmentInstallConsistency,
  validatePriceEffectiveOrder,
  validateActivePriceNoOverlap,
  validatePriceCurrencyMatchesBook,
  pricePeriodsOverlap,
  validatePolymorphicReference,
  validateActiveCtaNoDuplicates,
  validateReleaseReferences,
  validateBomQtyPositive,
  validatePresentationMappingHasExperience,
  validateLegacyNotCanonical,
  validateMasterMarketingNotContentAuthority,
  validateFeaturedAddonSort,
  validateReleaseTemplateSeparation,
  runStructuralSuite
};
