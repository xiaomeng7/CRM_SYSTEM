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

export const WIZARD_STEP_SEMANTIC_MAP: Record<string, string[]> = {
  core_context: ["job_client", "access", "exceptions", "signoff"],
  switchboard: ["switchboard_rcd"],
  safety_basic: ["internal_rooms", "other_internal", "earthing_external"],
  assets_profile: ["assets", "measured"],
  energy_baseline: ["energy_main_load", "energy_stress", "snapshot_intake"],
  energy_enhanced: ["energy_enhanced"],
  thermal_scan: ["thermal"],
};

export const PRODUCT_BASE_SEMANTIC_STEPS: Record<InspectionProduct, string[]> = {
  essential_full: ["core_context", "switchboard", "safety_basic", "assets_profile", "energy_baseline", "energy_enhanced"],
  rental_lite: ["core_context", "switchboard", "safety_basic", "assets_profile", "energy_baseline"],
  pre_purchase: ["core_context", "switchboard", "safety_basic", "assets_profile", "energy_baseline"],
  energy_advisory: ["core_context", "switchboard", "assets_profile", "energy_baseline", "energy_enhanced"],
};

export const PRODUCT_ADDON_SEMANTIC_STEPS: Partial<Record<InspectionProduct, Record<string, string[]>>> = {
  essential_full: {
    [THERMAL_IMAGING_ADDON]: ["thermal_scan"],
    [FULL_SAFETY_CHECK_ADDON]: ["safety_basic"],
  },
  rental_lite: {
    [THERMAL_IMAGING_ADDON]: ["thermal_scan"],
    [FULL_SAFETY_CHECK_ADDON]: ["safety_basic"],
  },
  pre_purchase: {
    [THERMAL_IMAGING_ADDON]: ["thermal_scan"],
    [FULL_SAFETY_CHECK_ADDON]: ["safety_basic"],
  },
  energy_advisory: {
    [THERMAL_IMAGING_ADDON]: ["thermal_scan"],
    [FULL_SAFETY_CHECK_ADDON]: ["safety_basic"],
  },
};

const WIZARD_STEP_ORDER = [
  "job_client",
  "energy_main_load",
  "energy_stress",
  "energy_enhanced",
  "snapshot_intake",
  "access",
  "internal_rooms",
  "switchboard_rcd",
  "earthing_external",
  "other_internal",
  "assets",
  "measured",
  "thermal",
  "exceptions",
  "signoff",
];

export function resolveEffectiveWizardSteps(
  product: InspectionProduct,
  selectedAddons: string[]
): Set<string> {
  const semantic = new Set<string>(PRODUCT_BASE_SEMANTIC_STEPS[product] ?? []);
  const addonMap = PRODUCT_ADDON_SEMANTIC_STEPS[product] ?? {};
  for (const addon of selectedAddons) {
    const extra = addonMap[addon];
    if (!extra) continue;
    for (const semanticStep of extra) semantic.add(semanticStep);
  }
  const effectiveRaw = new Set<string>();
  for (const semanticStep of semantic) {
    const wizardSteps = WIZARD_STEP_SEMANTIC_MAP[semanticStep] ?? [];
    for (const stepId of wizardSteps) effectiveRaw.add(stepId);
  }
  const ordered = new Set<string>();
  for (const stepId of WIZARD_STEP_ORDER) {
    if (effectiveRaw.has(stepId)) ordered.add(stepId);
  }
  return ordered;
}

export function normalizeInspectionProduct(value: unknown): InspectionProduct {
  if (typeof value !== "string") return DEFAULT_INSPECTION_PRODUCT;
  const v = value.trim();
  if (!v || !INSPECTION_PRODUCT_OPTIONS.includes(v as InspectionProduct)) {
    return DEFAULT_INSPECTION_PRODUCT;
  }
  return v as InspectionProduct;
}
