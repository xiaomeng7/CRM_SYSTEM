import { normalizeSnapshotIntake } from "./snapshotContract";
import { normalizeEnergyV2 } from "./normalizeEnergyV2";
import { extractAssetsEnergy } from "./extractAssetsEnergy";
import {
  normalizeInspectionProduct as normalizeInspectionProductForExecution,
  resolveEffectiveWizardSteps,
} from "../../../../src/config/inspectionProducts";

const ALLOWED_INSPECTION_PRODUCTS = new Set([
  "pre_purchase",
  "rental_lite",
  "energy_advisory",
  "essential_full",
]);

function normalizeInspectionProduct(input: unknown): string {
  const v = typeof input === "string" ? input.trim() : "";
  if (ALLOWED_INSPECTION_PRODUCTS.has(v)) return v;
  return "essential_full";
}

function normalizeSelectedAddons(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== "string") continue;
    const v = item.trim();
    if (!v) continue;
    if (!out.includes(v)) out.push(v);
  }
  return out;
}

export function prepareSubmissionRaw(input: Record<string, unknown>): Record<string, unknown> {
  const raw = { ...input };
  raw.inspection_product = normalizeInspectionProduct(raw.inspection_product);
  raw.selected_addons = normalizeSelectedAddons(raw.selected_addons);
  const executionProduct = normalizeInspectionProductForExecution(raw.inspection_product);
  const executionAddons = normalizeSelectedAddons(raw.selected_addons);
  raw.resolved_steps = Array.from(resolveEffectiveWizardSteps(executionProduct, executionAddons));
  raw.snapshot_intake = normalizeSnapshotIntake(raw);
  raw.energy_v2 = normalizeEnergyV2(raw);
  if (raw.assets_energy == null || typeof raw.assets_energy !== "object") {
    raw.assets_energy = extractAssetsEnergy(raw);
  }
  return raw;
}
