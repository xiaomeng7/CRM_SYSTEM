/**
 * Workbook Master Type → Product OS dual-axis kind × role (DEC-008 / DEC-013).
 */

const TYPE_MAP = Object.freeze({
  infrastructure: { productKind: "FOUNDATION", commercialRole: "STANDARD" },
  collection: { productKind: "COLLECTION", commercialRole: "STANDARD" },
  experience_pack: { productKind: "EXPERIENCE", commercialRole: "STANDARD" },
  product_pack: { productKind: "EXPERIENCE", commercialRole: "PACK" },
  standalone_product: { productKind: "STANDALONE", commercialRole: "STANDARD" },
  standalone: { productKind: "STANDALONE", commercialRole: "STANDARD" },
  bonus: { productKind: null, commercialRole: null, rejectAsProduct: true },
  add_on: { productKind: "ADDON", commercialRole: "STANDARD" },
  addon: { productKind: "ADDON", commercialRole: "STANDARD" }
});

function normalizeTypeLabel(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

function mapWorkbookType(typeLabel) {
  const key = normalizeTypeLabel(typeLabel);
  const mapped = TYPE_MAP[key];
  if (!mapped) {
    return {
      ok: false,
      productKind: null,
      commercialRole: null,
      rejectAsProduct: false,
      reason: `UNKNOWN_WORKBOOK_TYPE:${typeLabel}`
    };
  }
  if (mapped.rejectAsProduct) {
    return {
      ok: true,
      productKind: null,
      commercialRole: null,
      rejectAsProduct: true,
      reason: "BONUS_IS_INCLUDED_BENEFIT"
    };
  }
  return {
    ok: true,
    productKind: mapped.productKind,
    commercialRole: mapped.commercialRole,
    rejectAsProduct: false,
    reason: null
  };
}

/**
 * Canonical classification overrides after DEC-013 remapping (by canonical product code).
 */
const CANONICAL_KIND_ROLE = Object.freeze({
  "F-01": { productKind: "FOUNDATION", commercialRole: "STANDARD" },
  "C-01": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "C-02": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "C-03": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "C-04": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "C-05": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "C-06": { productKind: "COLLECTION", commercialRole: "STANDARD" },
  "E-01": { productKind: "EXPERIENCE", commercialRole: "STANDARD" },
  "E-02": { productKind: "EXPERIENCE", commercialRole: "STANDARD" },
  "E-03": { productKind: "EXPERIENCE", commercialRole: "STANDARD" },
  "E-04": { productKind: "STANDALONE", commercialRole: "STANDARD" },
  "E-05": { productKind: "EXPERIENCE", commercialRole: "PACK" }, // CCTV
  "E-06": { productKind: "STANDALONE", commercialRole: "STANDARD" } // Smart Toilet
});

function kindRoleForCanonicalCode(code, workbookTypeLabel) {
  const fromCode = CANONICAL_KIND_ROLE[String(code || "").toUpperCase()];
  if (fromCode) return { ok: true, ...fromCode, source: "CANONICAL_TABLE" };
  const fromType = mapWorkbookType(workbookTypeLabel);
  return { ...fromType, source: "WORKBOOK_TYPE" };
}

module.exports = {
  TYPE_MAP,
  CANONICAL_KIND_ROLE,
  normalizeTypeLabel,
  mapWorkbookType,
  kindRoleForCanonicalCode
};
