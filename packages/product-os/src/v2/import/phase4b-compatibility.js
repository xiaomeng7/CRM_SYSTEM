/** Convert a validated ImportPlan into explicit database dispositions. */

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function skuCodesFromAddon(addon, knownSkus) {
  return unique(
    (addon.capabilityBomEvidence || [])
      .filter((e) => e.hitSku && knownSkus.has(e.basis))
      .map((e) => e.basis)
  );
}

function capabilityCodesFromAddon(addon, knownCapabilities) {
  return unique(
    (addon.capabilityBomEvidence || [])
      .filter((e) => e.hitCap && knownCapabilities.has(e.matchedCapabilityCode))
      .map((e) => e.matchedCapabilityCode)
  );
}

function buildPhase4BCompatibility(plan) {
  const blockers = [];
  const knownSkus = new Set((plan.skus || []).map((x) => x.skuCode));
  const knownCapabilities = new Set((plan.capabilities || []).map((x) => x.capabilityCode));

  const addonBases = (plan.addons || []).map((addon) => {
    const skuCodes = skuCodesFromAddon(addon, knownSkus);
    const capabilityCodes = capabilityCodesFromAddon(addon, knownCapabilities);
    if (!skuCodes.length && !capabilityCodes.length) {
      blockers.push({ code: "PH4B_ADDON_BASIS_UNRESOLVED", productCode: addon.productCode });
    }
    return { productCode: addon.productCode, skuCodes, capabilityCodes };
  });

  const experienceMappings = (plan.a4PresentationMappings || []).filter((x) => x.experienceCode);
  const presentationOnlyMappings = (plan.a4PresentationMappings || []).filter((x) => !x.experienceCode);

  // These are deliberately stored as approved content + placements. They are
  // not Experience facts and therefore must not be forced into an FK table.
  for (const mapping of presentationOnlyMappings) {
    if (mapping.createsExperienceFact !== false) {
      blockers.push({ code: "PH4B_PRESENTATION_FACT_AMBIGUOUS", mappingCode: mapping.mappingCode });
    }
  }

  return {
    ok: blockers.length === 0,
    blockers,
    addonBases,
    experienceMappings,
    presentationOnlyMappings,
    scopeDisposition: {
      mode: "CONTENT_PLACEMENT",
      groups: (plan.a4ScopePresentation || []).length,
      reason: "A4 scope wording is presentation; capabilities and BOM remain fact authority"
    }
  };
}

module.exports = { buildPhase4BCompatibility };
