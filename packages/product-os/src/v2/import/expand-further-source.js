/**
 * Approved Expand Further relationship rows (DEC-010).
 * Authority: A4_Content_Mapping_Review_V1.md + Better_Home_Collections_A4_Review_Set_V1.pdf
 * (immutable sources; lists not invented).
 *
 * Pos2RelationshipType mapping (no new enum synonyms):
 * - Collection → Collection  → RECOMMENDED_NEXT_PRODUCT
 * - Collection → Experience/Pack → COMPATIBLE_EXPERIENCE
 * - “Add-ons” label → PRESENTATION_CTA (no product target)
 * - Protection Bonus → not a product target; BONUS_UNLOCK via included benefit
 */

const EXPAND_FURTHER_SOURCE = Object.freeze({
  mappingReview: "docs/product-os/source/A4_Content_Mapping_Review_V1.md",
  mappingReviewSha256: "a68587aadff15df830b570ee5d83a30db7c3e1b398623980455e217c663b77a8",
  a4Pdf: "docs/product-os/source/Better_Home_Collections_A4_Review_Set_V1.pdf",
  a4PdfSha256: "f16c53443b49d71478732fb94dbb0bcc85a5968e645f286167e918f47123fff8",
  decision: "DEC-010"
});

/**
 * One row per Expand Further slot from approved A4 lists.
 * sourceProduct = Collection showing the section.
 */
const EXPAND_FURTHER_ROWS = Object.freeze([
  // C-01 Entry — Away; CCTV; Protection Bonus
  {
    sourceProductCode: "C-01",
    sourceLabel: "AWAY",
    originalTarget: "Away",
    sortOrder: 1,
    mappingSection: "B1 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "C-06",
    relationshipType: "RECOMMENDED_NEXT_PRODUCT",
    customerCopy: "Give departure and return one clear rhythm."
  },
  {
    sourceProductCode: "C-01",
    sourceLabel: "CCTV",
    originalTarget: "CCTV",
    sortOrder: 2,
    mappingSection: "B1 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-05", // remapped from Legacy E-06
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Add professional local visibility."
  },
  {
    sourceProductCode: "C-01",
    sourceLabel: "PROTECTION BONUS",
    originalTarget: "Protection Bonus",
    sortOrder: 3,
    mappingSection: "B1 Expand Further",
    kind: "BONUS_NOTE",
    benefitCode: "benefit.protection_bonus",
    relationshipType: null,
    customerCopy: "Visible response when Entry, Away and CCTV meet."
  },

  // C-02 Living — Mood Lighting; Climate; Healthy Air
  {
    sourceProductCode: "C-02",
    sourceLabel: "MOOD LIGHTING",
    originalTarget: "Mood Lighting",
    sortOrder: 1,
    mappingSection: "B2 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-01",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Give ordinary nights more depth and atmosphere."
  },
  {
    sourceProductCode: "C-02",
    sourceLabel: "CLIMATE",
    originalTarget: "Climate",
    sortOrder: 2,
    mappingSection: "B2 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-02",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Let whole-home comfort follow the rhythm of life."
  },
  {
    sourceProductCode: "C-02",
    sourceLabel: "HEALTHY AIR",
    originalTarget: "Healthy Air",
    sortOrder: 3,
    mappingSection: "B2 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-03",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Help the room quietly restore its freshness."
  },

  // C-03 Kitchen — Mood Lighting; Healthy Air; Add-ons CTA
  {
    sourceProductCode: "C-03",
    sourceLabel: "MOOD LIGHTING",
    originalTarget: "Mood Lighting",
    sortOrder: 1,
    mappingSection: "B3 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-01",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Give evening meals more depth and atmosphere."
  },
  {
    sourceProductCode: "C-03",
    sourceLabel: "HEALTHY AIR",
    originalTarget: "Healthy Air",
    sortOrder: 2,
    mappingSection: "B3 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-03",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Help the kitchen recover freshness after use."
  },
  {
    sourceProductCode: "C-03",
    sourceLabel: "ADD-ONS",
    originalTarget: "Add-ons",
    sortOrder: 3,
    mappingSection: "B3 Expand Further",
    kind: "PRESENTATION_CTA",
    targetProductCode: null,
    relationshipType: "PRESENTATION_CTA",
    customerCopy: "Extend the same kitchen without creating another room."
  },

  // C-04 Bedroom — Mood Lighting; Climate; Healthy Air
  {
    sourceProductCode: "C-04",
    sourceLabel: "MOOD LIGHTING",
    originalTarget: "Mood Lighting",
    sortOrder: 1,
    mappingSection: "B4 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-01",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Use colour as atmosphere - or a quiet sense of the hour."
  },
  {
    sourceProductCode: "C-04",
    sourceLabel: "CLIMATE",
    originalTarget: "Climate",
    sortOrder: 2,
    mappingSection: "B4 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-02",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Let whole-home comfort follow sleep and waking."
  },
  {
    sourceProductCode: "C-04",
    sourceLabel: "HEALTHY AIR",
    originalTarget: "Healthy Air",
    sortOrder: 3,
    mappingSection: "B4 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-03",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Help the room restore freshness through the night."
  },

  // C-05 Bathroom — Mood Lighting; Healthy Air; Add-ons CTA
  {
    sourceProductCode: "C-05",
    sourceLabel: "MOOD LIGHTING",
    originalTarget: "Mood Lighting",
    sortOrder: 1,
    mappingSection: "B5 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-01",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Turn bathing into a more atmospheric ritual."
  },
  {
    sourceProductCode: "C-05",
    sourceLabel: "HEALTHY AIR",
    originalTarget: "Healthy Air",
    sortOrder: 2,
    mappingSection: "B5 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-03",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Help the room recover freshness and humidity."
  },
  {
    sourceProductCode: "C-05",
    sourceLabel: "ADD-ONS",
    originalTarget: "Add-ons",
    sortOrder: 3,
    mappingSection: "B5 Expand Further",
    kind: "PRESENTATION_CTA",
    targetProductCode: null,
    relationshipType: "PRESENTATION_CTA",
    customerCopy: "Extend the same bathroom where capability already exists."
  },

  // C-06 Away — Entry; CCTV; Protection Bonus
  {
    sourceProductCode: "C-06",
    sourceLabel: "ENTRY",
    originalTarget: "Entry",
    sortOrder: 1,
    mappingSection: "B6 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "C-01",
    relationshipType: "RECOMMENDED_NEXT_PRODUCT",
    customerCopy: "Make arrival and departure feel connected."
  },
  {
    sourceProductCode: "C-06",
    sourceLabel: "CCTV",
    originalTarget: "CCTV",
    sortOrder: 2,
    mappingSection: "B6 Expand Further",
    kind: "PRODUCT",
    targetProductCode: "E-05",
    relationshipType: "COMPATIBLE_EXPERIENCE",
    customerCopy: "Add professional local visibility."
  },
  {
    sourceProductCode: "C-06",
    sourceLabel: "PROTECTION BONUS",
    originalTarget: "Protection Bonus",
    sortOrder: 3,
    mappingSection: "B6 Expand Further",
    kind: "BONUS_NOTE",
    benefitCode: "benefit.protection_bonus",
    relationshipType: null,
    customerCopy: "Visible response when Entry, Away and CCTV meet."
  }
]);

/** Featured Add-ons from A4 AVAILABLE ADD-ONS (presentation only; eligibility from sheet 11). */
const FEATURED_ADDON_ROWS = Object.freeze([
  {
    productCode: "C-01",
    items: [
      { name: "ADDITIONAL SMART LOCK", matchHint: "Smart Lock", sortOrder: 1 },
      { name: "ADDITIONAL WIRELESS VIDEO DOORBELL", matchHint: "Video Doorbell", sortOrder: 2 },
      { name: "ADDITIONAL GARAGE DOOR CONTROL", matchHint: "Garage", sortOrder: 3 }
    ]
  },
  {
    productCode: "C-02",
    items: [
      { name: "ADDITIONAL AUTOMATED CURTAIN", matchHint: "Curtain", sortOrder: 1 },
      { name: "ADDITIONAL WARM AMBIENT ZONE", matchHint: "Warm Ambient", sortOrder: 2 },
      { name: "ADDITIONAL COMPATIBLE SPLIT-SYSTEM CONTROL", matchHint: "Split-System", sortOrder: 3 }
    ]
  },
  {
    productCode: "C-03",
    items: [
      { name: "ADDITIONAL WARM AMBIENT ZONE", matchHint: "Warm Ambient", sortOrder: 1 },
      { name: "ADDITIONAL SMART DISPLAY", matchHint: "Smart Display", sortOrder: 2 },
      { name: "ADDITIONAL SMART APPLIANCE OUTLET", matchHint: "Appliance Outlet", sortOrder: 3 }
    ]
  },
  {
    productCode: "C-04",
    items: [
      { name: "ADDITIONAL AUTOMATED CURTAIN", matchHint: "Curtain", sortOrder: 1 },
      { name: "ADDITIONAL BEDSIDE SCENE REMOTE", matchHint: "Bedside", sortOrder: 2 },
      { name: "ADDITIONAL COMPATIBLE SPLIT-SYSTEM CONTROL", matchHint: "Split-System", sortOrder: 3 }
    ]
  },
  {
    productCode: "C-05",
    items: [
      { name: "ADDITIONAL WARM AMBIENT ZONE", matchHint: "Warm Ambient", sortOrder: 1 },
      { name: "ADDITIONAL ROOM OCCUPANCY SENSOR", matchHint: "Occupancy", sortOrder: 2 },
      { name: "ADDITIONAL EXHAUST FAN CONTROL", matchHint: "Exhaust Fan", sortOrder: 3 }
    ]
  },
  {
    productCode: "C-06",
    items: [
      { name: "ADDITIONAL DOOR / WINDOW CONTACT", matchHint: "Door / Window Contact", sortOrder: 1 }
    ]
  }
]);

module.exports = {
  EXPAND_FURTHER_SOURCE,
  EXPAND_FURTHER_ROWS,
  FEATURED_ADDON_ROWS
};
