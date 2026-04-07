export const INSPECTION_PRODUCT_OPTIONS = [
  "pre_purchase",
  "rental_lite",
  "energy_advisory",
  "essential_full",
] as const;

export type InspectionProduct = (typeof INSPECTION_PRODUCT_OPTIONS)[number];

export const DEFAULT_INSPECTION_PRODUCT: InspectionProduct = "essential_full";

export const INSPECTION_PRODUCT_LABELS: Record<InspectionProduct, string> = {
  pre_purchase: "Pre Purchase",
  rental_lite: "Rental Lite",
  energy_advisory: "Energy Advisory",
  essential_full: "Essential Full",
};

export const THERMAL_IMAGING_ADDON = "thermal_imaging";
export const FULL_SAFETY_CHECK_ADDON = "full_safety_check";

export const ADDON_FORCE_VISIBLE_STEPS: Record<string, Set<string>> = {
  [THERMAL_IMAGING_ADDON]: new Set(["thermal"]),
  [FULL_SAFETY_CHECK_ADDON]: new Set([
    "access",
    "internal_rooms",
    "switchboard_rcd",
    "earthing_external",
    "other_internal",
  ]),
};

export const HIDDEN_STEPS_BY_PRODUCT: Partial<Record<InspectionProduct, Set<string>>> = {
  // Keep rental flow close to essential, only hide obvious enhanced/optional pieces.
  rental_lite: new Set(["energy_enhanced", "thermal"]),
  // Energy advisory focuses on load/supply/assets; hide a single clearly non-core block first.
  energy_advisory: new Set(["thermal"]),
  // Pre-purchase keeps core inspection; only hide the enhanced advisory-oriented optional step.
  pre_purchase: new Set(["energy_enhanced"]),
};

export function normalizeInspectionProduct(value: unknown): InspectionProduct {
  if (typeof value !== "string") return DEFAULT_INSPECTION_PRODUCT;
  const v = value.trim();
  if (!v || !INSPECTION_PRODUCT_OPTIONS.includes(v as InspectionProduct)) {
    return DEFAULT_INSPECTION_PRODUCT;
  }
  return v as InspectionProduct;
}
