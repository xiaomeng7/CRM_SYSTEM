/**
 * Product Owner approved water-leak protection overlay (2026-07-27).
 *
 * This is a governed delta, rather than an edit to the immutable V2.07
 * workbook. It adds product facts only where the approved Collection scope
 * has changed. Away has no fixed external-point quantity or price: its extra
 * points must be selected during site review and priced only once that scope
 * is approved.
 */

const WATER_LEAK_SENSOR_SKU = Object.freeze({
  action: "UPSERT_EQUIPMENT_SKU",
  skuCode: "TIS-BEE-WTR-LEK-1",
  canonicalName: "TIS BEE Water Leak Sensor with Built-in Buzzer",
  capabilityCategory: "Water leak monitoring",
  supplier: "TIS",
  statusLabel: "ACTIVE",
  notes: "Battery-powered Zigbee water leak sensor with built-in local buzzer. Procurement reference: AUD 44 ex GST. No customer price is derived from this record.",
  unitCostExGst: 44,
  customerVisible: false,
  source: { system: "PRODUCT_OWNER_WATER_LEAK_DECISION", date: "2026-07-27" }
});

function capability(productCode, name, quantity, notes) {
  const code = `cap.${productCode.toLowerCase().replace('-', '_')}.${name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
  return {
    action: "UPSERT_CAPABILITY_INCLUSION",
    capabilityCode: code,
    productCode,
    legacyProductCode: null,
    capabilityName: name,
    includedQty: quantity,
    customerLayer: "CUSTOMER",
    notes,
    contentQualifier: null,
    deltaApplied: "DELTA-WATER-LEAK-2026-07-27",
    source: { system: "PRODUCT_OWNER_WATER_LEAK_DECISION", date: "2026-07-27", identity: code }
  };
}

function experience(productCode, sequence, title, description, capabilityCode) {
  return {
    action: "UPSERT_EXPERIENCE",
    experienceCode: `exp.${productCode.toLowerCase().replace('-', '_')}.${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    productCode,
    legacyProductCode: null,
    sequence,
    title,
    description,
    statusLabel: "ACTIVE",
    presentationOnly: false,
    linkedCapabilityCode: capabilityCode,
    source: { system: "PRODUCT_OWNER_WATER_LEAK_DECISION", date: "2026-07-27" }
  };
}

function content(productCode, key, title, body, sequence) {
  return {
    action: "UPSERT_CONTENT_ENTRY",
    contentCode: `cnt.water_leak.${productCode.toLowerCase().replace('-', '_')}.${key}`,
    productCode,
    locale: "en-AU",
    languageLayer: "CUSTOMER",
    surface: "PRODUCT_OS",
    contentKind: "CUSTOMER_EXPERIENCE_COPY",
    sequence,
    title,
    body,
    exactText: body,
    approvalStatus: "PRODUCT_OWNER_APPROVED_2026_07_27",
    publishEligible: true,
    contentVersion: "water-leak-2026-07-27",
    a4TemplateMappingKey: `water_leak.${key}`,
    source: { system: "PRODUCT_OWNER_WATER_LEAK_DECISION", date: "2026-07-27" }
  };
}

function buildWaterLeakProtectionOverlay() {
  const kitchenCap = capability("C-03", "Early Water Leak Detection", 1,
    "One Zigbee water leak sensor below the kitchen sink cabinet. Local sensor buzzer, TIS screen alert, mobile app push and exact location. Active 24/7; independent of Normal, Sleep and Away modes.");
  const bathroomCap = capability("C-05", "Early Water Leak Detection", 1,
    "One Zigbee water leak sensor in the vanity cabinet or another low point not affected by normal shower splash. Local sensor buzzer, TIS screen alert, mobile app push and exact location. Active 24/7.");
  const awayCap = capability("C-06", "Extended Water Leak Protection", 1,
    "Away includes one Zigbee water leak sensor for one selected location outside Kitchen and Bathroom: laundry, hot water unit, refrigerator water connection, purifier, dishwasher risk point, plant room or other permanent water-fed equipment. This is the Better Home whole-home water leak protection layer. Sensors remain active 24/7. Away mode adds high-priority remote notification, repeated alerts, room/location summary and a future water-main shutoff interface. Further external points require Away Collection and a separately priced Add-on.");

  return {
    skus: [WATER_LEAK_SENSOR_SKU],
    capabilities: [kitchenCap, bathroomCap, awayCap],
    bomItems: [
      { action: "UPSERT_BOM_ITEM", bomItemCode: "bom.c_03.tis_bee_wtr_lek_1", productCode: "C-03", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, qty: 1, notes: "Kitchen sink cabinet default location; included in Kitchen Collection.", source: WATER_LEAK_SENSOR_SKU.source },
      { action: "UPSERT_BOM_ITEM", bomItemCode: "bom.c_05.tis_bee_wtr_lek_1", productCode: "C-05", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, qty: 1, notes: "Bathroom vanity cabinet or suitable splash-safe low point; included in Bathroom Collection.", source: WATER_LEAK_SENSOR_SKU.source },
      { action: "UPSERT_BOM_ITEM", bomItemCode: "bom.c_06.tis_bee_wtr_lek_1", productCode: "C-06", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, qty: 1, notes: "One selected external water-risk location; included in Away Collection.", source: WATER_LEAK_SENSOR_SKU.source }
    ],
    experiences: [
      experience("C-03", 6, "EARLY WATER LEAK DETECTION", "A common risk point is watched day and night, with the exact location shown if water is detected.", kitchenCap.capabilityCode),
      experience("C-05", 6, "EARLY WATER LEAK DETECTION", "A quiet early warning helps protect the room beyond everyday routines.", bathroomCap.capabilityCode),
      experience("C-06", 6, "EXTENDED WATER LEAK PROTECTION", "Protect the water-risk locations that are harder to notice while you are away.", awayCap.capabilityCode)
    ],
    contentEntries: [
      content("C-03", "early_detection", "EARLY WATER LEAK DETECTION", "One included Zigbee water leak sensor beneath the kitchen sink cabinet watches this common risk point day and night. If water is detected, it sounds locally and shows the exact location on the Better Home screen and app.", 96),
      content("C-05", "early_detection", "EARLY WATER LEAK DETECTION", "One included Zigbee water leak sensor is placed in the vanity cabinet or another splash-safe low point. If water is detected, it sounds locally and shows the exact location on the Better Home screen and app.", 96),
      content("C-06", "extended_protection", "WHOLE-HOME WATER LEAK PROTECTION", "Kitchen and Bathroom Collections protect the most common water-risk locations. Away Collection includes one sensor for an external risk point such as laundry, hot water, refrigerator water connections or plant areas—places that can be difficult to notice while you are away, but can cause significant damage.", 96),
      content("C-06", "future_shutoff", "FUTURE WATER SHUTOFF", "A future shutoff option is assessed on site. It must never reopen water automatically: manual inspection and reset are required after any shutoff.", 97)
    ],
    rules: [
      { ruleCode: "rule.water_leak.always_active", productCode: null, ruleKey: "water_leak_monitoring_mode", ruleValue: "ACTIVE_24_7", severity: "REQUIRED", notes: "Water leak monitoring is independent of Normal, Sleep and Away." },
      { ruleCode: "rule.water_shutoff.manual_reset", productCode: "C-06", ruleKey: "automatic_reopen", ruleValue: "FORBIDDEN", severity: "SAFETY", notes: "After automatic shutoff, manual inspection and reset are required." }
    ],
    automations: [
      { automationCode: "auto.water_leak.alert", name: "Water Leak Alert", description: "Local buzzer, TIS screen alert, app push and exact location.", triggerType: "WATER_DETECTED", boundaryNotes: "Always active; does not depend on home mode.", productCodes: ["C-03", "C-05", "C-06"] },
      { automationCode: "auto.c06.water_leak.away_escalation", name: "Away Water Leak Escalation", description: "High-priority remote push, repeated alerts and room/location summary while Away is enabled.", triggerType: "WATER_DETECTED_WHILE_AWAY", boundaryNotes: "Future water-main shutoff interface only; no automatic reopen.", productCodes: ["C-06"] }
    ],
    quoteRules: [
      { productCode: "C-03", rule: "INCLUDE", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, quantity: 1, priceEffect: "INCLUDED_IN_COLLECTION_PRICE", note: "No separate customer line item." },
      { productCode: "C-05", rule: "INCLUDE", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, quantity: 1, priceEffect: "INCLUDED_IN_COLLECTION_PRICE", note: "No separate customer line item." },
      { productCode: "C-06", rule: "INCLUDE_ONE_SELECTED_EXTERNAL_POINT", skuCode: WATER_LEAK_SENSOR_SKU.skuCode, quantity: 1, priceEffect: "INCLUDED_IN_COLLECTION_PRICE", note: "One selected external risk point is included in Away Collection. Further external points require Away Collection and an Additional Water Leak Sensor Add-on; customer Add-on price remains to be approved." }
    ],
    futureUpgrade: {
      code: "future.water_main_shutoff",
      name: "Future Water Main Shutoff",
      status: "OPTIONAL_SITE_ASSESSMENT",
      constraints: [
        "External long-handle Water/Gas Valve Actuator is not standard scope.",
        "Confirm valve type, access space, power and signal on site.",
        "Gas valves require local regulatory compliance and qualified installation.",
        "Prefer a pipe-mounted motorised ball valve with manual operation and position feedback when future scope is approved.",
        "Never reopen automatically after a shutoff; manual inspection and reset are required."
      ]
    }
  };
}

module.exports = { WATER_LEAK_SENSOR_SKU, buildWaterLeakProtectionOverlay };
