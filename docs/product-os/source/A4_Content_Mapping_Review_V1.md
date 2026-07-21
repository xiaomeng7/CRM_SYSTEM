# Better Home A4 Content Mapping Review V1

Review scope:

- `Better_Home_Collections_A4_Review_Set_V1.pdf` - 12 pages, six Collections
- `Better_Home_Product_Database_V2.07.xlsx` - read-only review

Purpose: confirm whether the approved Collection A4 Decision Guides can be generated from Product OS without page-level hardcoding.

## Executive conclusion

**Not yet.** Product OS V2.07 is strong enough to validate most product facts, quantities, rules, automation logic, prices and Add-on eligibility. It is not yet sufficient to reproduce the approved A4 wording and structure without hardcoded page content.

The missing layer is not another design table. It is a structured **customer-content mapping layer** between product facts and channel output.

The correct architecture is:

`Product facts (Master / Capabilities / BOM / Rules / Automation / Pricing)`  
`+ Customer language (14_Content_Library)`  
`+ Relationships and presentation mappings`  
`+ Image / Theme / Layout configuration`  
`→ A4 / Website / Proposal / Configurator / Contract / Work Order`

The database must preserve three layers:

1. **Customer language** - emotion, story, problem, response and lived experience.
2. **Product language** - canonical product names, scope, eligibility, price and dependencies.
3. **Technical language** - SKU, BOM, protocols, triggers, conditions, actions and technician notes.

No channel should invent product facts. Customer copy may vary by surface, but every factual claim must reference a stable product fact.

---

# A. Database structure assessment

## A1. Current tables and recommended authority

| Table | Current value | Recommended authority | Assessment |
|---|---|---|---|
| `04_Product_Master` | Identity, type, coverage, hero, subtitle, accent, price | Product identity, status, type, coverage and positioning only | Hero, subtitle, accent and price duplicate specialist tables. Keep temporarily, then convert to derived/cache fields or deprecate them. |
| `05_Product_Experiences` | Customer-facing experience titles/descriptions | Canonical product-experience facts | Useful, but lacks stable `Experience ID`; approved A4 experience grouping often differs from these rows. |
| `06_Product_Capabilities` | Included capabilities and quantities | Canonical customer/product scope facts | Strong foundation, but lacks stable `Capability ID`, explicit unit, scope group and display mapping. |
| `07_Product_BOM` | SKU quantities and cost | Technical and costing authority | Must never drive customer wording directly. Use it to validate capabilities and price. |
| `09_Product_Rules` | Product boundaries and exclusions | Product-rule authority | Important facts exist, but free-form key/value/notes are difficult to validate or assemble automatically. |
| `10_Pricing_Summary` | Calculated price and margin | A4 displayed-price authority | Good source for numeric price. Missing structured display qualifiers such as `From`, `Installed`, `Supply only`, `Incl GST`. |
| `11_Add_Ons` | Canonical name, promise, parent, scope, price | Add-on product authority | V2.07 is strong. Missing product-specific featured order and A4 visibility. |
| `12_Product_Card_Content` | Old front moments/footer | **Legacy - stop using** | Incomplete, duplicated and inconsistent with approved A4. Retain only for migration audit, then archive/remove from runtime consumers. |
| `14_Content_Library` | Hero, subtitle, story and footer | Primary customer-content authority | Correct future home, but currently contains only four content types per Collection and does not match approved A4 story copy. |
| `15_Icon_Library` | Icon references | Optional visual asset metadata | Not required by current Collection A4 design. Do not make icon presence a content dependency. |
| `16_Image_Library` | Generic hero paths and art direction | Image asset authority | Paths are placeholders and do not identify the actual reviewed image/crop. Needs stable asset IDs, version, crop and rights metadata. |
| `17_Theme_Library` | Product colours | Theme authority | Structurally appropriate, but current A4 uses one unified green rather than the stored product accents. Requires channel-aware tokens or a decision to use product accents. |
| `18_Layout_Config` | Template and counts | Layout policy authority | Too shallow. Several experience counts conflict with the A4; counts should normally be derived, not manually frozen. |
| `19_Automation_Library` | Trigger/condition/action | Automation-logic authority | Strong technical truth. Customer pages may paraphrase it but must not add unsupported behaviour. |
| `20_Product_Review` | Review/status | Governance and QA | Should become the release gate for Product OS → A4 generation. |

## A2. Content currently duplicated

| Content/fact | Duplicate locations | Recommended source of truth |
|---|---|---|
| Hero | `04_Product_Master`, `14_Content_Library` | `14_Content_Library`; Product Master may cache the default hero only. |
| Subtitle | `04_Product_Master`, `14_Content_Library` | `14_Content_Library`. |
| Accent colour | `04_Product_Master`, `17_Theme_Library` | `17_Theme_Library`. |
| Customer price | `04_Product_Master`, `10_Pricing_Summary` | Product Master can hold the approved input; A4 must read the calculated/display value from Pricing Summary or a price-view table. |
| Footer text | `12_Product_Card_Content`, `14_Content_Library`, hardcoded A4 footer | Global/system content, not duplicated per product. |
| Front moments | `12_Product_Card_Content` for only Living/Bedroom/Away, plus hardcoded A4 | Migrate approved moments to `14_Content_Library`; stop using table 12. |
| Experience wording | `05_Product_Experiences`, hardcoded A4 wording | `05` owns the canonical experience; `14` owns surface copy linked by `Experience ID`. |
| Included scope wording | `06_Product_Capabilities`, `07_Product_BOM` notes, hardcoded A4 | `06` owns product scope; an A4 scope-presentation mapping groups and phrases it. |

## A3. Content that is expression, not product fact

These belong in customer content or global brand content and should not be treated as BOM/rule facts:

- Hero statement and subtitle
- Story title and story body
- Front moment titles and captions
- Problem and Better Home response prose
- Customer-facing experience title/body, where linked to a canonical experience
- Expand Further experience promise
- Add-on experience promise
- Closing brand quote
- Section labels such as `WHAT YOU EXPERIENCE`

## A4. Facts that must never be authored by the page

- Product ID, canonical product name, product type and coverage
- Included quantities, units and maximum coverage
- Device/capability inclusion and exclusions
- Automation trigger, condition, action and safety boundary
- Add-on parent eligibility and the rule that an Add-on cannot create a room or Experience
- Compatible Products/Experiences and dependency conditions
- Installation assumptions and quote conditions
- Customer price, GST treatment and installed/supply-only basis
- Image asset identity/version and approved usage
- Product/version status
- Product hierarchy position

---

# B. Collection field mapping

Legend: **Ready** = current database can generate it; **Partial** = facts exist but presentation/linking is incomplete; **Missing** = no structured source; **Conflict** = database and approved A4 disagree.

## B1. Entry Collection - C-01

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name | Entry Collection | `04_Product_Master.Name` | **Ready** |
| Product ID | C-01 | `04_Product_Master.Product ID` | **Ready** |
| Hero | Some welcomes don't need words. | `14_Content_Library: Hero`; duplicated in Product Master | **Ready**, select Content Library as authority. |
| Subtitle | Before you step inside, home is already waiting. | `14_Content_Library: Subtitle` | **Ready** |
| Story title | Entry is part of everyday life. | No matching row; Content Library title is `Entry Collection` | **Missing** - add approved `story_title`. |
| Story body | Arrival begins before the door opens... | Content Library has different body | **Conflict** - approved A4 body must be migrated without rewriting it. |
| Front moments | Welcome / Arrive / Connect / Return plus captions | No current Content Library rows | **Missing** - four sequenced moment rows required. |
| Problem | Dark approaches and separate door devices... | None | **Missing** |
| Better Home response | Entrance prepares light, access and awareness... | Facts in automation/rules, no approved customer copy | **Missing** customer-content row linked to facts. |
| Customer experiences | Warm Approach; Smart Access; Door Awareness; Video Doorbell; Garage Control | `05_Product_Experiences` has four differently grouped rows; Layout says 4 | **Conflict** - A4 has five. `Door Awareness` is not clearly supported by a door contact in Entry. Add stable experience mappings and resolve the door-state claim. |
| Scope headings | Approach; Inside; Access; Light; Garage | Capabilities exist but no group headings | **Partial** - add scope-presentation groups. |
| Scope content | PIR welcome; indoor presence; lock + doorbell; switch; garage relay | `06_Product_Capabilities`, validated by BOM | **Ready as facts**, not as current A4 grouping. |
| Expand Further | Away; CCTV; Protection Bonus | No relationship table | **Missing** - requires typed relationships; Protection is a three-product bonus dependency. |
| Permitted Add-ons | Smart Lock; Wireless Video Doorbell; Garage Door Control | `11_Add_Ons` contains these and promises | **Partial** - eligibility ready; featured sequence/visibility missing. |
| Installation assumptions | Door/lock/circuits/Wi-Fi/garage dry contact; intercom quoted | Rules cover major boundaries, but no assembled A4 copy | **Partial** |
| Price | $2,499 installed incl GST | Pricing Summary = 2499 | **Ready numeric**; display qualifiers missing. |
| Theme colour | Unified green in A4 | Theme Library says `#B68A4A` | **Conflict** - current A4 does not use stored product accent. |
| Image reference | Entry residential image/crop | Generic `/assets/products/c-01/hero.jpg` | **Partial** - actual reviewed source/crop/version not registered. |
| Layout | Collection two-sided Decision Guide | `18_Layout_Config: CollectionCard_V2` | **Partial**; back count says 4, A4 displays 5. |
| Footer/navigation | Company, C-01, V2.06, page, hierarchy with Collection highlighted | Per-product footer content plus hardcoded page elements | **Conflict/Partial** - DB is V2.07 while A4 shows V2.06; navigation should derive from type. |

### Entry risk requiring product decision

`DOOR AWARENESS - Know the state of the main entry` is not clearly backed by an included door contact. The smart lock may expose lock state, but that is different from verified door-open/door-closed state. This claim must be linked to a supported capability or revised later.

## B2. Living Collection - C-02

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name / ID | Living Collection / C-02 | Product Master | **Ready** |
| Hero | One space. Many ways to live. | Content Library + Product Master | **Ready**, Content Library authoritative. |
| Subtitle | The atmosphere follows your life. | Content Library | **Ready** |
| Story title | Living isn't just another room. | No matching field | **Missing** |
| Story body | It is where families reconnect... | Content Library body is different and more functional | **Conflict** - migrate approved A4 body. |
| Front moments | Together; Movie Night; Reading; Relax with captions | Only titles exist in Legacy table 12; captions absent | **Missing in primary source** - migrate all four to Content Library and retire table 12. |
| Problem | One room holds conversation... | None | **Missing** |
| Better Home response | Room welcomes, changes and settles... | Automation facts exist | **Missing** customer copy. |
| Customer experiences | Quiet Welcome; Movie Night; Reading + Relax; Everyday Comfort; Natural Control | `05` has Lights Follow You, Climate Comfort, Movie, Reading, Relax | **Partial/Conflict** - same facts are regrouped; A4 merges Reading/Relax and adds Natural Control. Requires stable experience IDs and A4 presentation mapping. |
| Scope headings | Room Light; Room Response; Privacy; Warmth; Everyday Use | Capabilities exist, no grouping | **Partial** |
| Scope content | 6 circuits, dimmer, multifunction sensing, AC+TV response, curtain <=3m, warm zone <=3m, speaker | Capabilities/BOM/Rules | **Partial** - AC is a capability; compatible TV action exists only in Rule/Automation, not Capability. Do not imply TV hardware. |
| Expand Further | Mood Lighting; Climate; Healthy Air | No compatibility relationship table | **Missing** |
| Permitted Add-ons | Curtain; Warm Ambient Zone; Split-System Control | Add-on table ready | **Partial** - featured list/order missing. |
| Installation assumptions | Compatible split AC/TV; curtain boundaries; quote exceptions | Rules contain AC, curtain and TV boundaries | **Partial** - assembled customer wording hardcoded. |
| Price | $2,999 installed incl GST | Pricing Summary = 2999 | **Ready numeric**, display basis missing. |
| Theme colour | Unified A4 green | Theme Library `#6C7A5C` | **Conflict**; A4 happens to be visually close but uses a separate hardcoded colour. |
| Image reference | Living hero image/crop | Generic Image Library path | **Partial** |
| Layout | 4 front moments, 5 back experiences | Layout says 4 / 5 | **Ready for counts**, but counts should be derived. |
| Footer/navigation | Collection highlighted; C-02; V2.06 | Hardcoded | **Conflict/Partial** - version mismatch and no global footer config. |

## B3. Kitchen Collection - C-03

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name / ID | Kitchen Collection / C-03 | Product Master | **Ready** |
| Hero | The day begins quietly. | Content Library | **Ready** |
| Subtitle | Light where you need it. Calm when you don't. | Content Library | **Ready** |
| Story title | Kitchen is part of everyday life. | No matching field | **Missing** |
| Story body | From the first coffee to the final glass of water... | Content Library body differs | **Conflict** |
| Front moments | Morning; Cooking; Night; Everyday plus captions | None in primary source | **Missing** |
| Problem | Worktops can be poorly lit... | None | **Missing** |
| Better Home response | Task light, quiet night scene, appliance control | Facts spread across Experiences/Capabilities/Automation | **Missing** customer copy. |
| Customer experiences | Morning Light; Cooking Scene; Night Path; Room Response; Useful Information | `05` contains four differently grouped experiences; Layout says 4 | **Conflict** - A4 has 5. Add IDs and presentation mapping. |
| Scope headings | Room Light; Response; Worktop; Information; Appliance | Capability facts exist | **Partial** |
| Scope content | 6 circuits, dimmer, occupancy, warm strip, display, outlet | Capabilities/BOM | **Conflict risk** - BOM/capability identifies the warm strip as `Kickboard`, while A4 groups it under `WORKTOP`. The dimmable circuit may support task light, but the strip itself should not be misrepresented as worktop lighting without a product decision. |
| Expand Further | Mood Lighting; Healthy Air; Add-ons | No relationship table | **Missing/Conflict** - `Add-ons` is a CTA, not a compatible Experience. It needs a section-level CTA field, not a product relationship. |
| Permitted Add-ons | Warm Ambient Zone; Smart Display; Smart Appliance Outlet | Add-on table ready | **Partial** - featured order missing. |
| Installation assumptions | Cabinetry/mounting/circuit/safe appliance; exclusions | Partial facts in rules and capabilities | **Partial** |
| Price | $2,499 installed incl GST | Pricing Summary = 2499 | **Ready numeric** |
| Theme colour | Unified A4 green | Theme Library `#9A7B4F` | **Conflict** |
| Image reference | Kitchen hero image/crop | Generic Image Library path | **Partial** |
| Layout | 4 front moments, 5 experiences | Layout says 4 / 4 | **Conflict** |
| Footer/navigation | Collection highlighted; C-03; V2.06 | Hardcoded | **Conflict/Partial** |

## B4. Bedroom Collection - C-04

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name / ID | Bedroom Collection / C-04 | Product Master | **Ready** |
| Hero | The world can wait until morning. | Content Library | **Ready** |
| Subtitle | Designed around deeper rest and gentler mornings. | Database adds `and quiet control` | **Conflict** - approved A4 version differs. Content Library currently contains the longer version. |
| Story title | Bedroom is part of everyday life. | No matching field | **Missing** |
| Story body | Bedroom settles without a sequence of switches... | Content Library body differs | **Conflict** |
| Front moments | Good Night; Night Path; Gentle Wake; Privacy plus captions | Legacy has different set including Sleep Comfort; no primary rows | **Conflict/Missing** - migrate approved A4 moments; stop using Legacy. |
| Problem | Harsh night light and repeated bedside switching... | None | **Missing** |
| Better Home response | Warm low light, privacy and two bedside controls... | Facts supported by capabilities/rules | **Missing** customer copy. |
| Customer experiences | Good Night; Night Path; Gentle Wake; Quiet Privacy; Restful Audio | `05` has four: Good Night, Night Path, Gentle Wake, Sleep Sounds; Layout says 4 | **Conflict** - A4 splits privacy and audio into five experiences. |
| Scope headings | Room Light; Response; Privacy; Bedside; Rest | Capabilities exist | **Partial** |
| Scope content | Switch, dimmer, multifunction sensor, curtain <=3m, two remotes, warm zone, speaker | Capabilities/BOM/Rules | **Ready as facts**, grouping missing. |
| Expand Further | Mood Lighting; Climate; Healthy Air | No relationship table | **Missing** |
| Permitted Add-ons | Curtain; Bedside Remote; Split-System Control | Add-on table ready | **Partial** |
| Installation assumptions | Fabric/sheers, double track, >3m/custom, TV/access quote | Rules partially cover curtain and TV | **Partial** |
| Price | $2,699 installed incl GST | Pricing Summary = 2699 | **Ready numeric** |
| Theme colour | Unified A4 green | Theme Library `#4D6073` | **Conflict** |
| Image reference | Bedroom hero image/crop | Generic Image Library path | **Partial** |
| Layout | 4 front moments, 5 back experiences | Layout says 4 / 4 | **Conflict** |
| Footer/navigation | Collection highlighted; C-04; V2.06 | Hardcoded | **Conflict/Partial** |

## B5. Bathroom Collection - C-05

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name / ID | Bathroom Collection / C-05 | Product Master | **Ready** |
| Hero | Every day begins and ends in comfort. | Content Library | **Ready** |
| Subtitle | Light and ventilation settle into the room's rhythm. | Content Library | **Ready** |
| Story title | Bathroom is part of everyday life. | No matching field | **Missing** |
| Story body | Morning warmth, a quieter night path... | Content Library body differs | **Conflict** |
| Front moments | Welcome; Night; Shower; Renew plus captions | None in primary source | **Missing** |
| Problem | Harsh night light, forgotten ventilation... | None | **Missing** |
| Better Home response | Soft welcome, manual Shower Mode, fan overrun | Facts exist in Rules/Automation | **Missing** customer copy. |
| Customer experiences | Welcome Light; Night Path; Shower Mode; Ventilation; Warm-up Routine | `05` has only Everyday Mode, Shower Mode, Night Mode; Layout says 3 | **Conflict** - A4 has 5. |
| Scope headings | Room Light; Response; Night; Ventilation; Comfort | Capability facts exist | **Partial** |
| Scope content | `Up to 6 lighting circuits`, dimmer, occupancy, warm zone, existing fan, Shower Mode | Capabilities/BOM/Rules | **Conflict risk** - database says the switch covers compatible lighting/fan/heating circuits, not necessarily six lighting circuits. A4 scope overstates lighting-only capacity. |
| Expand Further | Mood Lighting; Healthy Air; Add-ons | No relationship table | **Missing/Conflict** - `Add-ons` is a CTA, not an Experience. |
| Permitted Add-ons | Warm Ambient Zone; Occupancy Sensor; Exhaust Fan Control | Add-on table ready | **Partial** |
| Installation assumptions | Fan/heating equipment excluded; compatibility/compliance | Rules/capabilities support this | **Partial** - approved assembled copy missing. |
| Price | $2,199 installed incl GST | Pricing Summary = 2199 | **Ready numeric** |
| Theme colour | Unified A4 green | Theme Library `#6E8F9C` | **Conflict** |
| Image reference | Bathroom hero image/crop | Generic Image Library path | **Partial** |
| Layout | 4 front moments, 5 experiences | Layout says 4 / 3 | **Conflict** |
| Footer/navigation | Collection highlighted; C-05; V2.06 | Hardcoded | **Conflict/Partial** |

## B6. Away Collection - C-06

| A4 field | Approved A4 content | Current Product OS source | Status / action |
|---|---|---|---|
| Product name / ID | Away Collection / C-06 | Product Master | **Ready** |
| Hero | Leave knowing home has settled. | Content Library | **Ready** |
| Subtitle | A clear departure. A quieter return. | Database uses a comma | **Minor conflict** - approved punctuation differs. |
| Story title | Away is part of everyday life. | No matching field | **Missing** |
| Story body | Gives rooms already chosen one shared departure state... | Content Library body differs | **Conflict** |
| Front moments | Leave; Settle; Aware; Return plus captions | Legacy has a different set including Home Check/Holiday Mode | **Conflict/Missing** |
| Problem | Lights and connected equipment remain on... | None | **Missing** |
| Better Home response | One command settles existing rooms and reports four openings | Facts supported by Rules/Automation | **Missing** customer copy. |
| Customer experiences | One-Touch Away; Existing-Room Setback; Opening Awareness; Return Routine; Clear Boundary | `05` has Leave Home, Home Check, Away Mode, Holiday Mode; Layout says 4 | **Conflict** - A4 omits Holiday Mode and adds Return Routine/Clear Boundary. `Return Routine` is not defined in Automation Library. |
| Scope headings | Whole Home; Awareness; Departure; Return; Handover | Facts partially exist | **Partial** - Return behaviour lacks a canonical automation/fact. |
| Scope content | Existing Collection logic, four contacts, one Away state, return response, no automatic garage | Capabilities/Rules/Automation | **Partial/Conflict** - return response is not structurally defined. |
| Expand Further | Entry; CCTV; Protection Bonus | No relationship table | **Missing** - requires cross-sell and bonus dependency relationships, not only Compatible Experience. |
| Permitted Add-ons | Additional Door / Window Contact | Add-on table ready | **Ready**, though A4 visibility/sequence still needs mapping. |
| Installation assumptions | Foundation, existing Collection, contact placement, Zigbee coverage, not alarm | Rules support most facts | **Partial** - `Zigbee` is technical language leaking into the customer layer; use a customer term generated from the same rule later. |
| Price | $1,499 installed incl GST | Pricing Summary = 1499 | **Ready numeric** |
| Theme colour | Unified A4 green | Theme Library `#475569` | **Conflict** |
| Image reference | Away hero image/crop | Generic Image Library path | **Partial** |
| Layout | 4 front moments, 5 experiences; Expand Further shown | Layout says 4 / 4 and `Show Compatible Experience Packs = false` | **Conflict/Partial** - the A4 section is cross-sell/bonus, not compatible Experience Packs. Layout lacks relationship-type controls. |
| Footer/navigation | Collection highlighted; C-06; V2.06 | Hardcoded | **Conflict/Partial** |

---

# C. Recommended new or adjusted fields

## C1. Expand `14_Content_Library` as the primary customer-content source

Recommended schema:

| Field | Purpose |
|---|---|
| `Content ID` | Stable key; never use title text as identity. |
| `Product ID` | Parent product. |
| `Surface` | `Shared`, `A4`, `Website`, `Proposal`, etc. Use `Shared` by default. |
| `Side / Context` | `Front`, `Back`, `Summary`, where required. |
| `Content Type` | Hero, Subtitle, Story, Front Moment, Problem, Response, Experience Copy, Expansion Promise, Assumption Copy, Closing Quote. |
| `Content Key` | Stable semantic key such as `problem.primary`. |
| `Sequence` | Display order. |
| `Title` / `Body` | Approved customer language. |
| `Fact Reference Type` / `Fact Reference ID` | Links copy to Experience, Capability, Rule, Relationship or Add-on. |
| `Locale` | Start with `en-AU`; allows later Chinese or other language output. |
| `Status` / `Version` | Draft, Approved, Frozen, Retired. |
| `Effective From / To` | Supports controlled release. |

Migrate the approved A4 wording exactly; do not rewrite during migration.

## C2. Add stable IDs to fact tables

- `Experience ID` in `05_Product_Experiences`
- `Capability ID` in `06_Product_Capabilities`
- `Rule ID` in `09_Product_Rules`
- `Automation ID` in `19_Automation_Library`
- `Asset ID` in `16_Image_Library`
- `Relationship ID` in a new relationship table

Sequences and text labels are not safe foreign keys.

## C3. Add `Product_Relationships`

Minimum fields:

- Relationship ID
- From Product ID
- To Product ID
- Relationship Type: `Compatible Experience`, `Cross-sell`, `Dependency`, `Bonus Unlock`, `Mutually Exclusive`
- Required Product IDs / dependency expression
- Sequence
- Show on A4 / Website / Configurator
- Status

This table must generate Expand Further. It must distinguish Living → Mood Lighting from Entry + Away + CCTV → Protection Bonus.

## C4. Add scope presentation mapping

Do not store the A4 scope as independent prose disconnected from capabilities.

Recommended tables/fields:

### `Product_Scope_Groups`

- Scope Group ID
- Product ID
- Group key
- Customer heading
- Sequence
- Surface visibility

### `Product_Scope_Items`

- Scope Group ID
- Capability ID
- Display sequence
- Customer label override, if necessary
- Show quantity / show unit / show qualifier

The displayed facts must resolve from Capabilities and Rules, while the customer heading remains a presentation choice.

## C5. Add product-specific Add-on display mapping

`11_Add_Ons` already owns canonical name, promise, scope, parent eligibility and price.

Add a small mapping table rather than duplicating Add-on text:

- Product ID
- Add-on ID
- Featured on A4
- Sequence
- Display mode: featured / catalogue only

The page reads name and promise from `11_Add_Ons`.

## C6. Structure price display metadata

Add or derive:

- `Price Display Mode`: Exact / From / Contact
- `Service Basis`: Installed / Supply only
- `Tax Display`: Incl GST / Ex GST
- `Currency`: AUD
- `Price Note Key`

The numeric value remains linked to Pricing Summary.

## C7. Strengthen installation/rule structure

Current free-form rules are useful but difficult to generate safely. Add:

- Rule ID
- Rule category: dependency, compatibility, exclusion, quantity limit, site assumption, quote condition, safety boundary
- Machine-readable operator/value where practical
- Customer wording reference
- Technical wording
- Severity: information / quote required / cannot proceed

## C8. Register actual image assets

Add:

- Asset ID
- Product ID
- Usage (`A4 Front Hero`)
- Actual repository path or asset URL
- Source/origin
- Rights/approval status
- Version/hash
- Aspect ratio
- Focal point and crop settings
- Alt text
- Status

The reviewed PDF crop must be reproducible from these fields.

## C9. Replace theme duplication with channel-aware design tokens

The current A4 uses one Better Home green, warm cream and dark text across all Collections, while the Theme Library stores different product accents.

Recommended model:

- Global theme tokens: background, text, rule, brand accent
- Optional product atmosphere/accent tokens
- Channel override: A4 may intentionally use the global accent
- Template version

Do not let pages hardcode hex values.

## C10. Strengthen Layout Config

Add:

- Template ID and Template Version
- Page size/orientation and side count
- Section order and visibility
- Maximum items per section
- Relationship types shown in Expand Further
- Add-on display mode
- Price placement/style
- Image usage/crop preset
- Hierarchy navigation enabled/current level
- Footer policy

Remove manual content counts where they can be derived. Add validation limits instead, such as `Max Back Experiences = 5`.

## C11. Add global/system content

Company name, global quote, hierarchy labels, footer format, legal/pricing note templates and section labels should live in a global content/config table rather than repeating per product.

---

# D. Data conflicts and risk register

| Priority | Issue | Products | Risk | Required resolution |
|---|---|---|---|---|
| P0 | Approved A4 copy is not in Content Library | All six | Regeneration changes or loses approved language | Migrate exact approved copy with stable IDs. |
| P0 | Experience counts/grouping disagree with Layout and Product Experiences | Entry, Kitchen, Bedroom, Bathroom, Away | Generator drops, duplicates or invents experiences | Introduce Experience IDs and surface presentation mapping; derive counts. |
| P0 | Entry `Door Awareness` lacks a clearly included door-state capability | Entry | Customer may expect door-open/closed sensing | Confirm supported smart-lock state or require contact capability; then link claim. |
| P0 | Kitchen warm strip shown under `WORKTOP`, while BOM identifies `Kickboard` | Kitchen | Scope may promise the wrong installation location/function | Resolve canonical capability and A4 group mapping. |
| P0 | Bathroom says up to six lighting circuits; database says switch circuits may serve lighting/fan/heating | Bathroom | Overstates lighting capacity | Generate scope from capability qualifier; avoid page-authored quantity meaning. |
| P0 | Away `Return Routine` is not defined in Automation Library | Away | Page promises unmodelled behaviour | Add canonical return automation/fact or remove claim in a later approved content revision. |
| P1 | A4 version footer is V2.06, database is V2.07 | All | Traceability and release-control failure | Footer version must be generated from release metadata. |
| P1 | A4 theme colours differ from Theme Library | All | Print Engine cannot reproduce reviewed output | Decide global A4 tokens vs product accents, then store the decision. |
| P1 | Image paths are generic placeholders, not reviewed assets/crops | All | Regenerated sheets use different imagery | Register exact assets and crop metadata. |
| P1 | Expand Further has no relationship authority | All | Ineligible products or bonus conditions may be shown | Add typed Product Relationships. |
| P1 | Kitchen/Bathroom use `Add-ons` inside Expand Further | Kitchen, Bathroom | Mixes product relationship with section CTA | Add a layout CTA field; do not store as a product relationship. |
| P1 | Away Layout hides Compatible Experience Packs but A4 shows Entry/CCTV/Protection | Away | Layout flag cannot represent cross-sell/bonus | Add relationship-type visibility. |
| P1 | Hero/subtitle/accent/price are duplicated | All | Competing source-of-truth values drift | Publish an authority matrix and deprecate duplicates. |
| P2 | `12_Product_Card_Content` conflicts with approved moments | Living, Bedroom, Away | Legacy consumer may output old language | Mark read-only Legacy, remove from runtime, archive after migration. |
| P2 | Technical language `Zigbee coverage` appears in customer assumptions | Away | Breaks customer/product/technical language separation | Keep technical term in rule/technician layer; create customer wording reference. |
| P2 | Content Library story titles are product names, not approved story titles | All | Front page cannot be generated accurately | Add/migrate `story_title`. |

---

# E. Cursor implementation task list

## Phase 0 - Protect the current state

1. Create a read-only snapshot/tag of Product OS V2.07 and the approved Collection A4 PDF.
2. Add automated checks proving no migration changes BOM cost, labour, price or eligibility values.
3. Document the source-of-truth authority matrix from Section A1.

## Phase 1 - Stop Legacy content use

4. Mark `12_Product_Card_Content` as `Legacy / No Runtime Use` at table and application level.
5. Search all generators and templates for reads from table 12.
6. Replace those reads with `14_Content_Library` only after approved content has migrated.
7. Keep table 12 temporarily for comparison; do not silently delete it in the first migration.

## Phase 2 - Establish stable identifiers

8. Add stable IDs for Content, Experience, Capability, Rule, Automation, Asset and Relationship records.
9. Backfill IDs deterministically and add uniqueness validation.
10. Prohibit joins by title, sequence or free-text key when a stable ID exists.

## Phase 3 - Migrate approved A4 customer language

11. Extend `14_Content_Library` with Surface, Side/Context, Fact Reference, Locale, Version and effective-status fields.
12. Import the approved A4 text exactly for all six Collections:
    - Hero and subtitle
    - Story title/body
    - Four front moments and captions
    - Problem and response
    - A4 customer-experience copy
    - Expansion promises
    - Installation-assumption customer copy
13. Do not rewrite text during migration.
14. Add a content-diff test comparing generated text against the approved PDF extraction.

## Phase 4 - Link expression to product facts

15. Create Product Scope Groups and Scope Items linked to Capability IDs.
16. Create Product Relationships with typed compatibility, cross-sell, dependency and bonus-unlock rules.
17. Create Product-to-Add-on featured mappings linked to Add-on IDs.
18. Link every factual A4 claim to Experience, Capability, Rule, Relationship or Add-on IDs.
19. Prevent unreferenced quantity, limit, compatibility and price statements in customer templates.

## Phase 5 - Resolve P0 product conflicts

20. Entry: resolve `Door Awareness` support and record the decision.
21. Kitchen: resolve Kickboard vs Worktop warm-light scope.
22. Bathroom: resolve six lighting circuits vs six compatible mixed-use circuits.
23. Away: define or remove the Return Routine behaviour in the canonical automation model.
24. Reconcile A4 experience groupings with `05_Product_Experiences`; preserve approved copy using mapping rather than renaming facts blindly.

## Phase 6 - Make visual output reproducible

25. Register exact approved image assets, versions, crops, focal points and rights.
26. Decide and store the A4 global theme token policy versus product accent colours.
27. Version the Collection A4 template.
28. Expand Layout Config with section order, limits, relationship types, price policy, hierarchy and footer policy.
29. Replace hardcoded footer, hierarchy, section labels and version strings with global/system configuration.

## Phase 7 - Price and scope safety

30. Add structured price display metadata: Exact/From, Installed/Supply only, GST basis and currency.
31. Generate customer scope from Capabilities and Rules, never directly from BOM notes.
32. Use BOM only to validate that included capability quantities are technically and financially supported.
33. Add validation that every A4 Add-on is eligible for its parent and does not create a new room or Experience.

## Phase 8 - Generator and release gates

34. Build a Product OS → A4 JSON view/API. Templates should consume this view only.
35. The view should expose separate objects for identity, content, experiences, scope, relationships, Add-ons, assumptions, price, theme, image, layout and footer.
36. Add release validation:
    - required content keys present
    - no orphan content/fact references
    - counts within layout maximums
    - price and GST basis present
    - capability/BOM reconciliation passes
    - Add-on eligibility passes
    - relationship dependencies pass
    - image/theme/layout versions are approved
    - product and footer versions match the release
37. Render all six sheets and compare text/content snapshots with the approved A4 set.
38. Only after all validations pass, mark the A4 data view `Frozen` for Print Engine use.

---

# Recommended source precedence for the A4 generator

1. `04_Product_Master` - identity/type/coverage/status
2. `14_Content_Library` - approved customer language
3. `05_Product_Experiences` + content mapping - canonical experiences and A4 wording
4. `06_Product_Capabilities` + scope mapping - included customer scope
5. `09_Product_Rules` + `19_Automation_Library` - boundaries and behaviour validation
6. `Product_Relationships` - Expand Further and bonus dependencies
7. `11_Add_Ons` + featured mapping - permitted Add-ons
8. `10_Pricing_Summary` + price-display metadata - investment
9. `16_Image_Library` - approved asset and crop
10. `17_Theme_Library` - approved channel tokens
11. `18_Layout_Config` - template/version/section policy
12. Global system content - footer, hierarchy, labels and release version

`07_Product_BOM` remains a technical validation source and must not become a customer-copy source.

