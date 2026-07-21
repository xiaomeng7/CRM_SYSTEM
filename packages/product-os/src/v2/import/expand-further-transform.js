/**
 * DEC-010 Expand Further → Pos2 relationship / CTA / bonus-note plan rows.
 */

const {
  EXPAND_FURTHER_SOURCE,
  EXPAND_FURTHER_ROWS,
  FEATURED_ADDON_ROWS
} = require("./expand-further-source");
const { slugPart } = require("./extended-transforms");

function buildExpandFurtherPlan(canonicalProductCodes) {
  const codeSet = new Set(canonicalProductCodes);
  const relationships = [];
  const presentationCtas = [];
  const bonusNotes = [];
  const unresolved = [];
  const skipped = [];

  for (const row of EXPAND_FURTHER_ROWS) {
    const sourceRef = {
      system: "A4_EXPAND_FURTHER",
      mappingReview: EXPAND_FURTHER_SOURCE.mappingReview,
      mappingReviewSha256: EXPAND_FURTHER_SOURCE.mappingReviewSha256,
      a4PdfSha256: EXPAND_FURTHER_SOURCE.a4PdfSha256,
      section: row.mappingSection,
      sourceProductCode: row.sourceProductCode,
      originalTarget: row.originalTarget,
      decision: EXPAND_FURTHER_SOURCE.decision
    };

    if (!codeSet.has(row.sourceProductCode)) {
      unresolved.push({
        reason: "SOURCE_PRODUCT_MISSING",
        row
      });
      continue;
    }

    if (row.kind === "BONUS_NOTE") {
      bonusNotes.push({
        action: "UPSERT_EXPAND_BONUS_NOTE",
        noteCode: `rel.note.${slugPart(row.sourceProductCode)}.protection_bonus`,
        sourceProductCode: row.sourceProductCode,
        benefitCode: row.benefitCode,
        sortOrder: row.sortOrder,
        customerVisible: true,
        customerCopy: row.customerCopy,
        createsProduct: false,
        createsPrice: false,
        createsIndependentA4: false,
        addToMyHome: false,
        source: sourceRef
      });
      continue;
    }

    if (row.kind === "PRESENTATION_CTA") {
      presentationCtas.push({
        action: "UPSERT_PRESENTATION_CTA",
        relationshipCode: `rel.cta.${slugPart(row.sourceProductCode)}.addons`,
        fromProductCode: row.sourceProductCode,
        toProductCode: null,
        relationshipType: "PRESENTATION_CTA",
        status: "ACTIVE",
        sortOrder: row.sortOrder,
        customerVisible: true,
        presentationEligible: true,
        customerCopy: row.customerCopy,
        source: sourceRef
      });
      continue;
    }

    // PRODUCT relationship
    if (!row.targetProductCode) {
      unresolved.push({ reason: "TARGET_MISSING", row });
      continue;
    }
    if (row.targetProductCode === "E-07") {
      unresolved.push({ reason: "FORBIDDEN_E07", row });
      continue;
    }
    if (!codeSet.has(row.targetProductCode)) {
      unresolved.push({ reason: "TARGET_PRODUCT_MISSING", row });
      continue;
    }
    if (row.targetProductCode === row.sourceProductCode) {
      unresolved.push({ reason: "SELF_RELATIONSHIP", row });
      continue;
    }

    const relationshipCode = `rel.xf.${slugPart(row.sourceProductCode)}.${slugPart(row.targetProductCode)}.${slugPart(row.relationshipType)}`;

    relationships.push({
      action: "UPSERT_RELATIONSHIP",
      relationshipCode,
      fromProductCode: row.sourceProductCode,
      toProductCode: row.targetProductCode,
      relationshipType: row.relationshipType,
      status: "ACTIVE",
      sortOrder: row.sortOrder,
      customerVisible: true,
      presentationEligible: true,
      expandFurther: true,
      isDependency: false,
      customerCopy: row.customerCopy,
      sourceLabel: row.sourceLabel,
      originalTarget: row.originalTarget,
      source: sourceRef
    });
  }

  // Duplicate check
  const seen = new Set();
  const duplicates = [];
  for (const r of relationships) {
    const key = `${r.fromProductCode}|${r.toProductCode}|${r.relationshipType}`;
    if (seen.has(key)) duplicates.push(key);
    seen.add(key);
  }

  const featuredAddons = [];
  for (const block of FEATURED_ADDON_ROWS) {
    for (const item of block.items) {
      featuredAddons.push({
        action: "UPSERT_FEATURED_ADDON",
        mappingCode: `map.featured.${slugPart(block.productCode)}.${item.sortOrder}`,
        parentProductCode: block.productCode,
        displayName: item.name,
        matchHint: item.matchHint,
        sortOrder: item.sortOrder,
        presentationOnly: true,
        doesNotExpandEligibility: true,
        source: {
          system: "A4_AVAILABLE_ADDONS",
          decision: "DEC-010",
          a4PdfSha256: EXPAND_FURTHER_SOURCE.a4PdfSha256
        }
      });
    }
  }

  return {
    relationships,
    presentationCtas,
    bonusNotes,
    featuredAddons,
    unresolved,
    duplicates,
    skipped,
    stats: {
      expandFurtherProductRelationships: relationships.length,
      presentationCtas: presentationCtas.length,
      bonusNotes: bonusNotes.length,
      featuredAddons: featuredAddons.length,
      unresolved: unresolved.length,
      duplicates: duplicates.length
    },
    source: EXPAND_FURTHER_SOURCE
  };
}

module.exports = {
  buildExpandFurtherPlan
};
