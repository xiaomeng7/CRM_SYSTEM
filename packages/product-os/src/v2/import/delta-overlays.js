/**
 * Approved Phase 2A / DEC fact deltas applied as import overlays (Phase 4A).
 * These do NOT invent facts — they encode Product Owner decisions as structured transforms.
 * Execution against Neon is Phase 4B/5; here we only emit plan entries.
 */

const APPROVED_DELTAS = Object.freeze([
  {
    ref: "DELTA-C01-DOOR",
    authority: "DEC-001",
    productCode: "C-01",
    kind: "CAPABILITY_BOM_LINK",
    summary:
      "Add Zigbee door-contact capability qty 1; BOM SKU qty 1; link Door Awareness; install assumption",
    status: "PLANNED"
  },
  {
    ref: "DELTA-C03-KICK",
    authority: "DEC-002",
    productCode: "C-03",
    kind: "CAPABILITY_RENAME_SCOPE",
    summary:
      "Canonical capability Warm Kickboard Ambient Zone; WORKTOP must not imply included strip under worktop",
    status: "PLANNED"
  },
  {
    ref: "DELTA-C05-CIRCUIT",
    authority: "DEC-003",
    productCode: "C-05",
    kind: "CONTENT_QUALIFIER",
    summary:
      "Up to six compatible circuits (lighting/fan/heat lamp/heating); not lighting-only",
    status: "PLANNED"
  },
  {
    ref: "DELTA-C06-RETURN",
    authority: "DEC-004",
    productCode: "C-06",
    kind: "AUTOMATION_CREATE",
    summary:
      "Create Return Routine automation with DEC-004 boundaries (stable code auto.c06.return_routine)",
    plannedStableCode: "auto.c06.return_routine",
    status: "PLANNED"
  },
  {
    ref: "DELTA-PROTECTION-BENEFIT",
    authority: "DEC-013",
    productCode: "E-05",
    kind: "INCLUDED_BENEFIT",
    summary:
      "Protection Bonus as benefit.protection_bonus on CCTV; unlock C-01 ∧ C-06 ∧ E-05; no product row/price",
    benefitCode: "benefit.protection_bonus",
    unlockRequiredCodes: Object.freeze(["C-01", "C-06", "E-05"]),
    status: "PLANNED"
  },
  {
    ref: "DELTA-RENUMBER-E",
    authority: "DEC-013",
    productCode: null,
    kind: "IDENTITY_CROSSWALK",
    summary: "Legacy E-06→E-05 CCTV; Legacy E-07→E-06 Toilet; Legacy E-05→included benefit",
    status: "PLANNED"
  },
  {
    ref: "DELTA-E04-INDEPENDENT",
    authority: "PO-2026-07-21",
    productCode: "E-04",
    kind: "PRODUCT_CLASSIFICATION",
    summary:
      "Garden Care is independently purchasable and does not require a Collection; classify as STANDALONE.",
    status: "APPROVED"
  },
  {
    ref: "DELTA-E02-WHOLE-HOME",
    authority: "PO-2026-07-21",
    productCode: "E-02",
    kind: "SELECTION_SCOPE",
    summary:
      "Climate controls the central air-conditioning system as a whole-home Experience; room selection is optional sensor context, not a purchase dependency.",
    status: "APPROVED"
  }
]);

function listApprovedDeltas() {
  return APPROVED_DELTAS.map((d) => ({ ...d }));
}

function deltasForProduct(productCode) {
  const code = String(productCode || "").toUpperCase();
  return APPROVED_DELTAS.filter(
    (d) => d.productCode == null || String(d.productCode).toUpperCase() === code
  ).map((d) => ({ ...d }));
}

module.exports = {
  APPROVED_DELTAS,
  listApprovedDeltas,
  deltasForProduct
};
