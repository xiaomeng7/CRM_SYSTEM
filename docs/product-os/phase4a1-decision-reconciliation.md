# Phase 4A.1 — Decision Reconciliation (DEC-001…013)

| Decision | Approved outcome | Transform rule | ImportPlan objects | Test | Status |
| --- | --- | --- | --- | --- | --- |
| DEC-001 | C-01 includes 1 Zigbee door contact | DELTA-C01-DOOR overlay | capability+BOM MAG-001+experience link+assumption | decisionDeltas contains DELTA-C01-DOOR | APPLIED_PLANNED |
| DEC-002 | Warm Kickboard Ambient Zone | Rename C-03 capability on import | capabilities C-03 | capability name == Warm Kickboard Ambient Zone | APPLIED |
| DEC-003 | Six compatible circuits not lighting-only | DELTA-C05-CIRCUIT qualifier | C-05 capability qualifier | contentQualifier present on C-05 circuit cap | APPLIED |
| DEC-004 | Return Routine with boundaries | DELTA-C06-RETURN | auto.c06.return_routine | decisionDeltas DELTA-C06-RETURN | APPLIED_PLANNED |
| DEC-005 | Product OS release V2.07; A4 template separate | governance fields | product_os_release / a4_template_version_separate | product_os_release === V2.07 | APPLIED |
| DEC-006 | A4 channel green override; accents preserved | theme.a4ChannelOverride | themes[] | themes have a4ChannelOverride.enabled | APPLIED |
| DEC-007 | Placeholders NOT_APPROVED_FOR_PUBLISH | image publishStatus | assets[] | placeholder assets gated | APPLIED |
| DEC-008 | kind × commercial_role; Protection not product | type-normalize + crosswalk | products + benefit | no Protection product; dual-axis present | APPLIED |
| DEC-009 | Experience library = facts; A4 = presentation map | import 05; presentation map separate | experiences; a4PresentationMappings=0 | experiences>0 && emptyEntityExplanations.a4PresentationMappings | PARTIAL_LIBRARY_ONLY |
| DEC-010 | Expand Further = relationships; Add-ons CTA | requires A4 extraction | relationshipsExpandFurther=0 | entityInventory.relationshipsExpandFurther === 0 → gap | NOT_APPLIED_MISSING_SOURCE |
| DEC-011 | Collections installed+GST; Toilet supply-only | price fulfillment fields | prices[] | E-06 SUPPLY_ONLY; collections INSTALLED | APPLIED |
| DEC-012 | Six Collection A4 copy verbatim into Content Library | blocked — Content Library lacks A4 verbatim layers | content_entries incomplete vs A4 | A4 front moments / problem / response missing | NOT_APPLIED_NEEDS_SOURCE |
| DEC-013 | SSoT + renumber + Protection benefit | legacy-crosswalk | aliases + benefit + E-05/E-06 | CCTV E-05 Toilet E-06 no E-07 | APPLIED |

## Summary

- Applied / applied-planned: 10
- Partial: 1
- Not applied: 2
