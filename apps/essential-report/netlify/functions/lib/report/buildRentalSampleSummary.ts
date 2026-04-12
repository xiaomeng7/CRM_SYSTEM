export type RentalOverallResult = "PASS" | "CONDITIONAL PASS";

export type RentalActionTag = "ACTION REQUIRED" | "ADVISORY";

export type RentalPropertyDetails = {
  address?: string | null;
  client_name?: string | null;
  assessment_date?: string | null;
  prepared_by?: string | null;
  property_type?: string | null;
  inspection_id?: string | null;
};

export type RentalSimpleSection = {
  items: string[];
  note?: string | null;
};

export type RentalActionItem = {
  title: string;
  tag: RentalActionTag;
  description?: string | null;
  recommended_action?: string | null;
  location?: string | null;
};

export type RentalEvidenceItem = {
  finding_title?: string | null;
  photo_ids: string[];
  location?: string | null;
};

export type RentalSampleSummary = {
  title: string;
  subtitle: string;
  overall_result: RentalOverallResult;
  summary_paragraph: string;
  property_details: RentalPropertyDetails;
  rcd_summary?: RentalSimpleSection | null;
  switchboard_summary?: RentalSimpleSection | null;
  smoke_alarm_summary?: RentalSimpleSection | null;
  gpo_lighting_summary?: RentalSimpleSection | null;
  hot_water_summary?: RentalSimpleSection | null;
  action_items: RentalActionItem[];
  evidence_items: RentalEvidenceItem[];
  limitations_text?: string | null;
  declaration?: string | null;
};

type ReportContext = {
  inspection_id?: string | null;
  prepared_for?: string | null;
  prepared_by?: string | null;
  assessment_date?: string | null;
  limitations?: string[] | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function extractValue(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (!("value" in value)) return value;
  const nested = (value as { value: unknown }).value;
  if (isRecord(nested) && "value" in nested) return extractValue(nested);
  return nested;
}

function asText(value: unknown): string | null {
  const v = extractValue(value);
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function asStringArray(value: unknown): string[] {
  const v = extractValue(value);
  if (!Array.isArray(v)) return [];
  return v
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter(Boolean);
}

function hasActionRequiredPriority(priority: string | null): boolean {
  if (!priority) return false;
  return ["IMMEDIATE", "URGENT", "RECOMMENDED_0_3_MONTHS", "RECOMMENDED"].includes(priority);
}

function buildSectionFromPairs(
  pairs: Array<{ label: string; value: unknown }>,
  note?: string | null
): RentalSimpleSection | null {
  const items = pairs
    .map(({ label, value }) => {
      const text = asText(value);
      return text ? `${label}: ${text}` : "";
    })
    .filter(Boolean);
  if (items.length === 0 && !note) return null;
  return { items, note: note ?? null };
}

function deriveRentalOverallResult(actionItems: RentalActionItem[]): RentalOverallResult {
  return actionItems.length > 0 ? "CONDITIONAL PASS" : "PASS";
}

function buildRentalSummaryParagraph(params: {
  overallResult: RentalOverallResult;
  address?: string | null;
  actionItemCount: number;
}): string {
  const locationText = params.address ? `The property at ${params.address}` : "This property";
  if (params.actionItemCount === 0) {
    return `${locationText} was assessed for rental changeover compliance. Overall result: ${params.overallResult}. No action items were identified at this time, and the property appears suitable for tenancy based on the available inspection data.`;
  }
  return `${locationText} was assessed for rental changeover compliance. Overall result: ${params.overallResult}. ${params.actionItemCount} follow-up item${params.actionItemCount > 1 ? "s are" : " is"} listed below and should be addressed as part of tenancy handover and routine compliance management.`;
}

function mapFindingsToActionItems(findings: Array<Record<string, unknown>>): RentalActionItem[] {
  return findings.map((finding) => {
    const priority = asText(finding.priority_final) || asText(finding.priority);
    const title = asText(finding.title) || asText(finding.id) || "Unspecified finding";
    const description =
      asText((finding as Record<string, unknown>).description) ||
      asText((finding as Record<string, unknown>).summary) ||
      null;
    return {
      title,
      tag: hasActionRequiredPriority(priority) ? "ACTION REQUIRED" : "ADVISORY",
      description,
      recommended_action: hasActionRequiredPriority(priority)
        ? "Please arrange licensed electrician follow-up before or during tenancy handover."
        : "Monitor and address during routine maintenance.",
      location: asText(finding.location),
    };
  });
}

function extractEvidenceItems(findings: Array<Record<string, unknown>>): RentalEvidenceItem[] {
  const out: RentalEvidenceItem[] = [];
  for (const finding of findings) {
    const photoIds = asStringArray(finding.photo_ids);
    if (photoIds.length === 0) continue;
    out.push({
      finding_title: asText(finding.title) || asText(finding.id),
      photo_ids: photoIds,
      location: asText(finding.location),
    });
  }
  return out;
}

export function buildRentalSampleSummary(
  raw: Record<string, unknown>,
  findings: Array<Record<string, unknown>>,
  reportContext: ReportContext
): RentalSampleSummary {
  const job = isRecord(raw.job) ? raw.job : {};
  const signoff = isRecord(raw.signoff) ? raw.signoff : {};
  const gpoTests = isRecord(raw.gpo_tests) ? raw.gpo_tests : {};
  const lighting = isRecord(raw.lighting) ? raw.lighting : {};
  const switchboard = isRecord(raw.switchboard) ? raw.switchboard : {};
  const smoke = isRecord(raw.smoke_alarms) ? raw.smoke_alarms : isRecord(raw.smoke_alarm) ? raw.smoke_alarm : {};
  const hotWater = isRecord(raw.hot_water) ? raw.hot_water : isRecord(raw.hot_water_system) ? raw.hot_water_system : {};

  const actionItems = mapFindingsToActionItems(findings);
  const overallResult = deriveRentalOverallResult(actionItems);

  const propertyAddress = asText(job.address) || reportContext.prepared_for || null;
  const preparedBy = reportContext.prepared_by || asText(signoff.technician_name) || null;
  const assessmentDate = reportContext.assessment_date || asText(raw.created_at) || null;

  const rcdSummary = buildSectionFromPairs(
    [
      { label: "Tests performed", value: (isRecord(raw.rcd_tests) ? raw.rcd_tests : {}).performed },
      { label: "Total tested", value: (isRecord((raw.rcd_tests as Record<string, unknown>)?.summary) ? (raw.rcd_tests as Record<string, unknown>).summary : {}).total_tested },
      { label: "Total pass", value: (isRecord((raw.rcd_tests as Record<string, unknown>)?.summary) ? (raw.rcd_tests as Record<string, unknown>).summary : {}).total_pass },
      { label: "Total fail", value: (isRecord((raw.rcd_tests as Record<string, unknown>)?.summary) ? (raw.rcd_tests as Record<string, unknown>).summary : {}).total_fail },
    ],
    null
  );

  const switchboardSummary = buildSectionFromPairs(
    [
      { label: "Overall condition", value: switchboard.overall_condition },
      { label: "Signs of overheating", value: switchboard.signs_of_overheating },
      { label: "Water ingress", value: switchboard.water_ingress },
      { label: "Labelling quality", value: switchboard.labelling_quality },
    ],
    null
  );

  const smokeAlarmSummary = buildSectionFromPairs(
    [
      { label: "Count", value: smoke.count ?? smoke.total },
      { label: "Type", value: smoke.type },
      { label: "Compliance", value: smoke.compliance },
    ],
    null
  );

  const gpoSummary = isRecord(gpoTests.summary) ? gpoTests.summary : {};
  const lightingRooms = asStringArray((lighting.rooms as unknown) ?? []);
  const gpoLightingSummary = buildSectionFromPairs(
    [
      { label: "GPO tested", value: gpoSummary.total_gpo_tested ?? gpoSummary.total_tested },
      { label: "Polarity pass", value: gpoSummary.polarity_pass },
      { label: "Earth present pass", value: gpoSummary.earth_present_pass },
      { label: "Lighting rooms captured", value: lightingRooms.length > 0 ? lightingRooms.length : null },
    ],
    null
  );

  const hotWaterSummary = buildSectionFromPairs(
    [
      { label: "System type", value: hotWater.system_type ?? hotWater.type },
      { label: "Isolator status", value: hotWater.isolator_status ?? hotWater.isolator_present },
      { label: "Wiring condition", value: hotWater.wiring_condition },
    ],
    null
  );

  const evidenceItems = extractEvidenceItems(findings);
  const limitationsText = reportContext.limitations?.length
    ? reportContext.limitations.join(" ")
    : "This inspection is limited to visible and accessible components at the time of attendance.";
  const declaration = "This report records observed electrical conditions for rental changeover purposes based on available inspection data.";

  return {
    title: "Rental Changeover Electrical Inspection Report",
    subtitle: "Compliance report for tenancy changeover",
    overall_result: overallResult,
    summary_paragraph: buildRentalSummaryParagraph({
      overallResult,
      address: propertyAddress,
      actionItemCount: actionItems.length,
    }),
    property_details: {
      address: propertyAddress,
      client_name: asText(job.client_name),
      assessment_date: assessmentDate,
      prepared_by: preparedBy,
      property_type: asText(job.property_type),
      inspection_id: reportContext.inspection_id ?? null,
    },
    rcd_summary: rcdSummary,
    switchboard_summary: switchboardSummary,
    smoke_alarm_summary: smokeAlarmSummary,
    gpo_lighting_summary: gpoLightingSummary,
    hot_water_summary: hotWaterSummary,
    action_items: actionItems,
    evidence_items: evidenceItems,
    limitations_text: limitationsText,
    declaration,
  };
}
